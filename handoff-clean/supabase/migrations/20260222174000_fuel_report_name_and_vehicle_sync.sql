-- Fuel report (report_type = 50): persist report_name metadata and track unique monitored assets.

alter table if exists raw_telemetry_inbound
  add column if not exists report_name text;
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'daily_movement_reports'
  ) then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'daily_movement_reports'
        and column_name = 'report_name'
    ) then
      alter table public.daily_movement_reports add column report_name text;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'daily_movement_reports'
        and column_name = 'source_imei'
    ) then
      alter table public.daily_movement_reports add column source_imei text;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'daily_movement_reports'
        and column_name = 'source_client_name'
    ) then
      alter table public.daily_movement_reports add column source_client_name text;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'daily_movement_reports'
        and column_name = 'source_assigned_asset'
    ) then
      alter table public.daily_movement_reports add column source_assigned_asset text;
    end if;
  end if;
end $$;
create table if not exists fuel_report_asset_registry (
  id uuid primary key default gen_random_uuid(),
  report_name text not null unique,
  report_type text not null default '50',
  imei_number text,
  client_name text,
  assigned_asset text,
  vehicle_sync_status text,
  vehicle_sync_message text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_raw_inbound_id uuid references raw_telemetry_inbound(id) on delete set null
);
create index if not exists idx_fuel_report_asset_registry_last_seen
  on fuel_report_asset_registry(last_seen_at desc);
create index if not exists idx_fuel_report_asset_registry_assigned_asset
  on fuel_report_asset_registry(assigned_asset);
alter table fuel_report_asset_registry enable row level security;
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'fuel_report_asset_registry'
      and policyname = 'admin_select_fuel_report_asset_registry'
  ) then
    create policy "admin_select_fuel_report_asset_registry"
      on fuel_report_asset_registry
      for select
      using (public.is_admin());
  end if;
end $$;
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
  v_asset text := nullif(trim(p_assigned_asset), '');
  v_client text := nullif(trim(p_client_name), '');
  v_imei text := nullif(trim(p_imei_number), '');
  v_vehicle_id text;
  v_has_id boolean;
  v_has_asset_id boolean;
  v_has_vehicle_plate boolean;
  v_cols text[] := array[]::text[];
  v_vals text[] := array[]::text[];
  v_missing_required text[];
  v_col record;
  v_sql text;
begin
  if v_asset is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'missing_assigned_asset');
  end if;

  if to_regclass('public.vehicles') is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'vehicles_table_missing');
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'id'
  ) into v_has_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'asset_id'
  ) into v_has_asset_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'vehicle_plate'
  ) into v_has_vehicle_plate;

  if v_has_id and v_has_asset_id then
    execute 'select id::text from public.vehicles where asset_id = $1 limit 1'
      into v_vehicle_id
      using v_asset;
  end if;

  if v_vehicle_id is null and v_has_id and v_has_vehicle_plate then
    execute 'select id::text from public.vehicles where vehicle_plate = $1 limit 1'
      into v_vehicle_id
      using v_asset;
  end if;

  if v_vehicle_id is not null then
    return jsonb_build_object('status', 'existing', 'vehicle_id', v_vehicle_id);
  end if;

  for v_col in
    select column_name, udt_name, column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicles'
      and column_name in (
        'id',
        'asset_id',
        'vehicle_plate',
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
          v_vals := array_append(v_vals, format('%L', v_asset));
        end if;
      end if;
    elsif v_col.column_name = 'asset_id' then
      v_cols := array_append(v_cols, 'asset_id');
      v_vals := array_append(v_vals, format('%L', v_asset));
    elsif v_col.column_name = 'vehicle_plate' then
      v_cols := array_append(v_cols, 'vehicle_plate');
      v_vals := array_append(v_vals, format('%L', v_asset));
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
      v_vals := array_append(v_vals, format('%L', v_asset));
    elsif v_col.column_name = 'vehicle_name' then
      v_cols := array_append(v_cols, 'vehicle_name');
      v_vals := array_append(v_vals, format('%L', v_asset));
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
insert into ingestion_mappings (source, report_type, target_table, upsert_target, mapping_config, notes)
values (
  'teletrac',
  '50',
  'daily_movement_reports',
  'raw_inbound_id',
  '{
    "fields": {
      "report_name": "report_name",
      "asset": "asset_description",
      "registration_number": "registration_number",
      "start_time": "departure_time",
      "end_time": "arrival_time",
      "kilometers": "distance_km",
      "fuelUsed": "fuel_used_litres",
      "start_Location": "departed_from",
      "endLocation": "arrived_at",
      "max_Speed": "max_speed_kmh",
      "duration": "driving_time"
    },
    "defaults": {
      "company_name": "Teletrac Ingestion"
    }
  }'::jsonb,
  'Fuel report type 50 mapping with report_name metadata extraction support'
)
on conflict (source, report_type, version) do update
set
  target_table = excluded.target_table,
  upsert_target = excluded.upsert_target,
  mapping_config = excluded.mapping_config,
  notes = excluded.notes,
  is_active = true,
  updated_at = now();
