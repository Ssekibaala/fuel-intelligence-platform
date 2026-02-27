-- Enforce vehicles.asset_id as IMEI-derived identity (not vehicle_plate),
-- and repair existing rows where asset_id was copied from vehicle_plate.
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create or replace function public.sync_vehicle_from_fuel_report(
  p_assigned_asset text,
  p_client_name text default null,
  p_imei_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned_asset text := nullif(trim(p_assigned_asset), '');
  v_client text := nullif(trim(p_client_name), '');
  v_imei text := public.normalize_imei(p_imei_number);
  v_asset_key text := v_imei;
  v_vehicle_id text;
  v_client_id uuid;
  v_has_id boolean;
  v_has_imei boolean;
  v_has_asset_id boolean;
  v_has_vehicle_plate boolean;
  v_has_client_name boolean;
  v_has_company_name boolean;
  v_has_client_id boolean;
  v_cols text[] := array[]::text[];
  v_vals text[] := array[]::text[];
  v_missing_required text[];
  v_col record;
  v_sql text;
begin
  if to_regclass('public.vehicles') is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'vehicles_table_missing');
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'id'
  ) into v_has_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'imei'
  ) into v_has_imei;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'asset_id'
  ) into v_has_asset_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'vehicle_plate'
  ) into v_has_vehicle_plate;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'client_name'
  ) into v_has_client_name;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'company_name'
  ) into v_has_company_name;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'client_id'
  ) into v_has_client_id;

  if v_has_client_id and to_regclass('public.clients') is not null then
    if v_client is not null then
      select c.id
      into v_client_id
      from public.clients c
      where lower(c.name) = lower(v_client)
      order by c.created_at asc
      limit 1;
    end if;

    if v_client_id is null then
      select c.id
      into v_client_id
      from public.clients c
      order by c.created_at asc
      limit 1;
    end if;
  end if;

  if v_has_id and v_has_imei and v_imei is not null then
    execute 'select id::text from public.vehicles where public.normalize_imei(imei) = $1 limit 1'
      into v_vehicle_id
      using v_imei;
  end if;

  if v_vehicle_id is null and v_has_id and v_has_asset_id and v_asset_key is not null then
    execute 'select id::text from public.vehicles where asset_id = $1 limit 1'
      into v_vehicle_id
      using v_asset_key;
  end if;

  if v_vehicle_id is null and v_has_id and v_has_vehicle_plate and v_assigned_asset is not null then
    execute 'select id::text from public.vehicles where vehicle_plate = $1 limit 1'
      into v_vehicle_id
      using v_assigned_asset;
  end if;

  if v_vehicle_id is not null then
    if v_has_imei and v_imei is not null then
      execute '
        update public.vehicles
        set imei = coalesce(imei, $1)
        where id::text = $2
      ' using v_imei, v_vehicle_id;
    end if;

    if v_has_asset_id and v_asset_key is not null then
      execute '
        update public.vehicles
        set asset_id = case
          when asset_id is null then $1
          when $2 is not null and asset_id = $2 then $1
          else asset_id
        end
        where id::text = $3
      ' using v_asset_key, v_assigned_asset, v_vehicle_id;
    end if;

    if v_has_vehicle_plate and v_assigned_asset is not null then
      execute '
        update public.vehicles
        set vehicle_plate = coalesce(vehicle_plate, $1)
        where id::text = $2
      ' using v_assigned_asset, v_vehicle_id;
    end if;

    if v_has_client_id and v_client_id is not null then
      execute '
        update public.vehicles
        set client_id = coalesce(client_id, $1)
        where id::text = $2
      ' using v_client_id, v_vehicle_id;
    end if;

    if v_client is not null then
      if v_has_client_name then
        execute 'update public.vehicles set client_name = coalesce(client_name, $1) where id::text = $2'
          using v_client, v_vehicle_id;
      end if;
      if v_has_company_name then
        execute 'update public.vehicles set company_name = coalesce(company_name, $1) where id::text = $2'
          using v_client, v_vehicle_id;
      end if;
    end if;

    return jsonb_build_object('status', 'existing', 'vehicle_id', v_vehicle_id);
  end if;

  if v_assigned_asset is null and v_imei is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'missing_imei_and_asset');
  end if;

  for v_col in
    select column_name, udt_name, column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicles'
      and column_name in (
        'id',
        'client_id',
        'asset_id',
        'vehicle_plate',
        'driver_name',
        'status',
        'current_fuel_level',
        'fuel_efficiency',
        'efficiency_rating',
        'client_name',
        'company_name',
        'imei_number',
        'imei',
        'name',
        'vehicle_name'
      )
  loop
    if v_col.column_name = 'id' then
      if v_col.column_default is null then
        if v_col.udt_name = 'uuid' then
          v_cols := array_append(v_cols, 'id');
          v_vals := array_append(v_vals, 'gen_random_uuid()');
        else
          v_cols := array_append(v_cols, 'id');
          v_vals := array_append(v_vals, format('%L', coalesce(v_asset_key, v_assigned_asset)));
        end if;
      end if;
    elsif v_col.column_name = 'client_id' and v_client_id is not null then
      v_cols := array_append(v_cols, 'client_id');
      v_vals := array_append(v_vals, format('%L', v_client_id));
    elsif v_col.column_name = 'asset_id' and v_asset_key is not null then
      v_cols := array_append(v_cols, 'asset_id');
      v_vals := array_append(v_vals, format('%L', v_asset_key));
    elsif v_col.column_name = 'vehicle_plate' and v_assigned_asset is not null then
      v_cols := array_append(v_cols, 'vehicle_plate');
      v_vals := array_append(v_vals, format('%L', v_assigned_asset));
    elsif v_col.column_name = 'driver_name' then
      v_cols := array_append(v_cols, 'driver_name');
      v_vals := array_append(v_vals, format('%L', 'Unassigned'));
    elsif v_col.column_name = 'status' then
      v_cols := array_append(v_cols, 'status');
      v_vals := array_append(v_vals, format('%L', 'Active'));
    elsif v_col.column_name = 'current_fuel_level' then
      v_cols := array_append(v_cols, 'current_fuel_level');
      v_vals := array_append(v_vals, '0');
    elsif v_col.column_name = 'fuel_efficiency' then
      v_cols := array_append(v_cols, 'fuel_efficiency');
      v_vals := array_append(v_vals, '0');
    elsif v_col.column_name = 'efficiency_rating' then
      v_cols := array_append(v_cols, 'efficiency_rating');
      v_vals := array_append(v_vals, format('%L', 'Average'));
    elsif v_col.column_name = 'client_name' and v_client is not null then
      v_cols := array_append(v_cols, 'client_name');
      v_vals := array_append(v_vals, format('%L', v_client));
    elsif v_col.column_name = 'company_name' and v_client is not null then
      v_cols := array_append(v_cols, 'company_name');
      v_vals := array_append(v_vals, format('%L', v_client));
    elsif v_col.column_name = 'imei_number' and v_imei is not null then
      v_cols := array_append(v_cols, 'imei_number');
      v_vals := array_append(v_vals, format('%L', v_imei));
    elsif v_col.column_name = 'imei' and v_imei is not null then
      v_cols := array_append(v_cols, 'imei');
      v_vals := array_append(v_vals, format('%L', v_imei));
    elsif v_col.column_name = 'name' then
      v_cols := array_append(v_cols, 'name');
      v_vals := array_append(v_vals, format('%L', coalesce(v_assigned_asset, v_asset_key)));
    elsif v_col.column_name = 'vehicle_name' then
      v_cols := array_append(v_cols, 'vehicle_name');
      v_vals := array_append(v_vals, format('%L', coalesce(v_assigned_asset, v_asset_key)));
    end if;
  end loop;

  select array_agg(c.column_name order by c.ordinal_position)
  into v_missing_required
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'vehicles'
    and c.is_nullable = 'NO'
    and c.is_generated = 'NEVER'
    and coalesce(c.is_identity, 'NO') = 'NO'
    and c.column_default is null
    and not (c.column_name = any(v_cols));

  if coalesce(array_length(v_missing_required, 1), 0) > 0 then
    return jsonb_build_object(
      'status',
      'skipped',
      'reason',
      'vehicles_required_columns_missing',
      'columns',
      v_missing_required
    );
  end if;

  if coalesce(array_length(v_cols, 1), 0) = 0 then
    return jsonb_build_object('status', 'skipped', 'reason', 'vehicles_insert_columns_unavailable');
  end if;

  if v_has_id then
    v_sql := format(
      'insert into public.vehicles (%s) values (%s) returning id::text',
      array_to_string(v_cols, ','),
      array_to_string(v_vals, ',')
    );
    execute v_sql into v_vehicle_id;
  else
    v_sql := format(
      'insert into public.vehicles (%s) values (%s)',
      array_to_string(v_cols, ','),
      array_to_string(v_vals, ',')
    );
    execute v_sql;
    v_vehicle_id := null;
  end if;

  return jsonb_build_object('status', 'inserted', 'vehicle_id', v_vehicle_id);
exception
  when others then
    return jsonb_build_object('status', 'error', 'error', sqlerrm);
end;
$$;

create or replace function public.upsert_vehicle_live_state(
  p_imei text,
  p_assigned_asset text default null,
  p_client_name text default null,
  p_gps_at timestamptz default null,
  p_engine_hours numeric default null,
  p_is_ignition_on boolean default null,
  p_vehicle_speed numeric default null,
  p_driver_id text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_odometer numeric default null,
  p_road_name text default null,
  p_event_name text default null,
  p_event_id text default null,
  p_raw_inbound_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sync jsonb;
  v_vehicle_id uuid;
  v_asset text;
  v_client text;
begin
  if p_imei is null or btrim(p_imei) = '' then
    return jsonb_build_object('status', 'skipped', 'reason', 'missing_imei');
  end if;

  v_asset := nullif(btrim(p_assigned_asset), '');
  if v_asset is null then
    v_asset := p_imei;
  end if;

  v_client := nullif(btrim(p_client_name), '');

  select public.sync_vehicle_from_fuel_report(v_asset, v_client, p_imei) into v_sync;
  v_vehicle_id := nullif(v_sync ->> 'vehicle_id', '')::uuid;

  if v_vehicle_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', coalesce(v_sync ->> 'reason', 'vehicle_sync_failed')
    );
  end if;

  update public.vehicles
  set
    imei = coalesce(imei, p_imei),
    asset_id = case
      when p_imei is null or btrim(p_imei) = '' then asset_id
      when asset_id is null then p_imei
      when nullif(btrim(vehicle_plate), '') is not null and asset_id = vehicle_plate then p_imei
      when asset_id = v_asset and v_asset <> p_imei then p_imei
      else asset_id
    end,
    vehicle_plate = coalesce(vehicle_plate, v_asset),
    client_name = coalesce(client_name, v_client),
    last_gps_at = coalesce(p_gps_at, last_gps_at),
    last_engine_hours = coalesce(p_engine_hours, last_engine_hours),
    last_ignition_on = coalesce(p_is_ignition_on, last_ignition_on),
    last_speed_kmh = coalesce(p_vehicle_speed, last_speed_kmh),
    last_driver_id = coalesce(nullif(btrim(p_driver_id), ''), last_driver_id),
    last_latitude = coalesce(p_latitude, last_latitude),
    last_longitude = coalesce(p_longitude, last_longitude),
    last_odometer_km = coalesce(p_odometer, last_odometer_km),
    last_road_name = coalesce(nullif(btrim(p_road_name), ''), last_road_name),
    last_event_name = coalesce(nullif(btrim(p_event_name), ''), last_event_name),
    last_event_id = coalesce(nullif(btrim(p_event_id), ''), last_event_id),
    total_engine_hours = case
      when p_engine_hours is null then total_engine_hours
      else greatest(coalesce(total_engine_hours, p_engine_hours), p_engine_hours)
    end,
    total_distance = case
      when p_odometer is null then total_distance
      else greatest(coalesce(total_distance, p_odometer), p_odometer)
    end,
    source_last_raw_inbound_id = coalesce(p_raw_inbound_id, source_last_raw_inbound_id),
    updated_at = now()
  where id = v_vehicle_id
    and (
      p_gps_at is null
      or last_gps_at is null
      or p_gps_at >= last_gps_at
    );

  if found then
    return jsonb_build_object('status', 'updated', 'vehicle_id', v_vehicle_id);
  end if;

  return jsonb_build_object('status', 'stale_ignored', 'vehicle_id', v_vehicle_id);
end;
$$;

do $$
declare
  v_fixed integer := 0;
  v_unresolved integer := 0;
  v_has_needed_columns boolean := false;
begin
  if to_regclass('public.vehicles') is null then
    return;
  end if;

  select (
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'vehicles' and column_name = 'asset_id'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'vehicles' and column_name = 'vehicle_plate'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'vehicles' and column_name = 'imei'
    )
  )
  into v_has_needed_columns;

  if not v_has_needed_columns then
    return;
  end if;

  if to_regprocedure('public.normalize_imei(text)') is not null then
    update public.vehicles
    set asset_id = public.normalize_imei(imei)
    where asset_id is not null
      and vehicle_plate is not null
      and asset_id = vehicle_plate
      and imei is not null
      and btrim(imei) <> '';
  else
    update public.vehicles
    set asset_id = nullif(trim(imei), '')
    where asset_id is not null
      and vehicle_plate is not null
      and asset_id = vehicle_plate
      and imei is not null
      and btrim(imei) <> '';
  end if;

  get diagnostics v_fixed = row_count;

  select count(*)
  into v_unresolved
  from public.vehicles
  where asset_id is not null
    and vehicle_plate is not null
    and asset_id = vehicle_plate
    and (imei is null or btrim(imei) = '');

  raise notice 'vehicles.asset_id repair done. fixed=% unresolved_missing_imei=%', v_fixed, v_unresolved;
end $$;
