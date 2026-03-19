-- Keep vehicle summary metrics nullable until report_type=147 (today end_date) sets them.

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
      v_vals := array_append(v_vals, 'null');
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

update public.vehicles
set
  fuel_efficiency = null,
  total_distance = null,
  total_engine_hours = null,
  total_fuel_used = null;
