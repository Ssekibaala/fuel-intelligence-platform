-- Consolidated migration file (ordered source migrations).
-- Generated from supabase/migrations/*.sql for easy handoff.


-- >>> BEGIN 20260222000000_telemetry_ingestion.sql

-- Production-Grade SQL Migration for Telemetry Ingestion Platform

-- 1. Status Enum for cleaner constraints
do $$ 
begin
    if not exists (select 1 from pg_type where typname = 'ingestion_status') then
        create type ingestion_status as enum ('pending', 'processing', 'processed', 'failed', 'dead_letter');
    end if;
end $$;

-- 2. Staging Table (The Inbound Buffer)
create table if not exists raw_telemetry_inbound (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  report_type text not null,
  payload_json jsonb not null,
  headers_json jsonb,
  payload_hash text not null,
  status ingestion_status not null default 'pending',
  attempt_count int not null default 0,
  last_error text,
  error_code text,
  next_retry_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  request_id text,
  request_timestamp timestamptz,
  auth_method text,
  signature_valid boolean default false,
  
  -- Combined uniqueness for idempotency
  unique(source, report_type, payload_hash)
);

-- Optimization Indexes
create index if not exists idx_staging_status_retry_received 
on raw_telemetry_inbound (status, next_retry_at, received_at) 
where status = 'pending';

create index if not exists idx_staging_source_type_received 
on raw_telemetry_inbound (source, report_type, received_at desc);

-- Index for lock recovery visibility
create index if not exists idx_staging_processing_locked_at
on raw_telemetry_inbound (locked_at)
where status = 'processing';

-- 3. Ingestion Mappings (The Rule Engine)
create table if not exists ingestion_mappings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  report_type text not null,
  target_table text not null,
  upsert_target text, -- Column(s) to use for conflict resolution (e.g., 'report_id' or 'raw_inbound_id')
  mapping_config jsonb not null, -- {fields, transforms, validators}
  version int default 1,
  is_active boolean default true,
  notes text,
  updated_at timestamptz default now(),
  updated_by uuid,
  unique(source, report_type, version)
);

create index if not exists idx_mappings_lookup 
on ingestion_mappings (source, report_type) 
where is_active = true;

-- 4. Traceability: Update Existing Tables
do $$ 
begin
    -- Add raw_inbound_id and mapping_version to daily_movement_reports
    if not exists (select 1 from information_schema.columns where table_name='daily_movement_reports' and column_name='raw_inbound_id') then
        alter table daily_movement_reports add column raw_inbound_id uuid references raw_telemetry_inbound(id) on delete set null;
    end if;
    if not exists (select 1 from information_schema.columns where table_name='daily_movement_reports' and column_name='applied_mapping_version') then
        alter table daily_movement_reports add column applied_mapping_version int;
        create index idx_dmr_raw_inbound on daily_movement_reports(raw_inbound_id);
    end if;
end $$;

-- 5. New Table: Telemetry Alerts (Updated with Mapping Version)
create table if not exists telemetry_alerts (
  id uuid primary key default gen_random_uuid(),
  raw_inbound_id uuid references raw_telemetry_inbound(id) on delete set null,
  applied_mapping_version int,
  report_id bigint, -- Not unique because one report can have many alerts
  alert_name text,
  alert_event text,
  alert_timestamp timestamptz,
  generated_date timestamptz,
  asset_id text,
  vehicle_id varchar references vehicles(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  location text,
  speed text,
  battery text,
  priority text,
  lon double precision,
  lat double precision,
  created_at timestamptz default now()
);

create index if not exists idx_alerts_vehicle_date on telemetry_alerts(vehicle_id, alert_timestamp desc);
create index if not exists idx_alerts_client_date on telemetry_alerts(client_id, alert_timestamp desc);
create index if not exists idx_alerts_raw_inbound on telemetry_alerts(raw_inbound_id);

-- Uniqueness for safe upserting
alter table telemetry_alerts drop constraint if exists telemetry_alerts_idempotency_key;
alter table telemetry_alerts add constraint telemetry_alerts_idempotency_key unique (asset_id, alert_timestamp, alert_name);

-- 6. Utility Functions: Row Claiming & Lock Recovery
create or replace function claim_ingestion_batch(
  p_worker_id text,
  p_batch_size int default 100
)
returns setof raw_telemetry_inbound
language plpgsql
security definer
as $$
begin
  return query
  update raw_telemetry_inbound
  set 
    status = 'processing',
    locked_at = now(),
    locked_by = p_worker_id,
    attempt_count = attempt_count + 1
  where id in (
    select id
    from raw_telemetry_inbound
    where status = 'pending'
      and next_retry_at <= now()
      and locked_at is null -- Defensive: don't claim if already locked
    order by received_at asc
    for update skip locked
    limit p_batch_size
  )
  returning *;
end;
$$;

/**
 * Recovers rows stuck in 'processing' status for too long.
 * Should be called periodically (e.g. by a watchdog cron).
 */
create or replace function recover_stale_locks(
  p_timeout_minutes int default 10
)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  update raw_telemetry_inbound
  set 
    status = 'pending',
    locked_at = null,
    locked_by = null,
    last_error = 'Stale lock recovered (worker likely crashed)'
  where status = 'processing'
    and locked_at < now() - (p_timeout_minutes || ' minutes')::interval;
    
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 7. Trigger for Auto-linking Alerts (Traceability Aware)
create or replace function public.populate_telemetry_alert_links()
returns trigger
language plpgsql
as $$
begin
  if new.vehicle_id is null or new.client_id is null then
    select v.id, v.client_id
    into new.vehicle_id, new.client_id
    from vehicles v
    where (new.asset_id is not null and v.asset_id = new.asset_id)
       or (new.asset_id is not null and v.vehicle_plate = new.asset_id)
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists telemetry_alerts_link_trigger on telemetry_alerts;
create trigger telemetry_alerts_link_trigger
before insert on telemetry_alerts
for each row execute function public.populate_telemetry_alert_links();

-- 8. Enable RLS
alter table raw_telemetry_inbound enable row level security;
alter table ingestion_mappings enable row level security;
alter table telemetry_alerts enable row level security;

-- Policies (Service Role/Admin access)
-- Note: Ingestion worker uses service-role, but we add policies for dashboard visibility
create policy "admin_select_staging" on raw_telemetry_inbound
  for select using (public.is_admin());

create policy "admin_select_mappings" on ingestion_mappings
  for select using (public.is_admin());

create policy "telemetry_alerts_select" on telemetry_alerts
  for select using (
    public.is_admin()
    or exists (
      select 1 from client_users cu
      where cu.client_id = telemetry_alerts.client_id and cu.user_id = auth.uid()
    )
  );

-- <<< END 20260222000000_telemetry_ingestion.sql



-- >>> BEGIN 20260222000001_seed_mappings.sql

-- Seed initial mapping for Teletrac Fuel Trip Report (Type 137)
insert into ingestion_mappings (source, report_type, target_table, upsert_target, mapping_config, notes)
values (
  'teletrac',
  '137',
  'daily_movement_reports',
  'raw_inbound_id', -- Using raw_inbound_id as a reliable conflict target for this implementation
  '{
    "fields": {
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
  }',
  'Initial mapping for Fuel Trip Listing reports'
)
on conflict (source, report_type, version) do nothing;

-- Seed initial mapping for Teletrac Alert (Type 1)
insert into ingestion_mappings (source, report_type, target_table, upsert_target, mapping_config, notes)
values (
  'teletrac',
  '1',
  'telemetry_alerts',
  'asset_id,alert_timestamp,alert_name',
  '{
    "fields": {
      "report_id": "report_id",
      "generated_date": "generated_date",
      "alert_name": "alert_name",
      "event": "alert_event",
      "date": "alert_timestamp",
      "asset": "asset_id",
      "location": "location",
      "speed": "speed",
      "battery": "battery",
      "priority": "priority",
      "lon": "lon",
      "lat": "lat"
    }
  }',
  'Initial mapping for Alert reports'
)
on conflict (source, report_type, version) do nothing;

-- <<< END 20260222000001_seed_mappings.sql



-- >>> BEGIN 20260222122000_schedule_process_telemetry_cron.sql

-- Ensure telemetry worker cron exists and points to process-telemetry edge function.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Remove existing schedule with same name to keep this migration idempotent.
do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'process-telemetry-cron' loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'process-telemetry-cron',
  '* * * * *',
  $$ select net.http_post('https://pkduhowdqvymmvboyivt.supabase.co/functions/v1/process-telemetry', '{}', '{}') $$
);

-- <<< END 20260222122000_schedule_process_telemetry_cron.sql



-- >>> BEGIN 20260222133000_fix_dmr_raw_inbound_upsert_conflict.sql

-- Ensure daily_movement_reports.raw_inbound_id can be used as an UPSERT conflict target.
-- Postgres unique constraints allow multiple NULLs, so this remains safe for older rows.

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
      from pg_constraint
      where conname = 'daily_movement_reports_raw_inbound_id_key'
        and conrelid = 'public.daily_movement_reports'::regclass
    ) then
      alter table public.daily_movement_reports
        add constraint daily_movement_reports_raw_inbound_id_key unique (raw_inbound_id);
    end if;
  end if;
end $$;

-- <<< END 20260222133000_fix_dmr_raw_inbound_upsert_conflict.sql



-- >>> BEGIN 20260222174000_fuel_report_name_and_vehicle_sync.sql

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

-- <<< END 20260222174000_fuel_report_name_and_vehicle_sync.sql



-- >>> BEGIN 20260222191000_imei_key_and_fuel_normalized_tables.sql

-- Harden report_type=50 processing around IMEI as the primary mapping key.
-- This migration is additive and idempotent.

create extension if not exists pgcrypto;

create or replace function public.normalize_imei(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  if p_value is null then
    return null;
  end if;

  v_digits := regexp_replace(trim(p_value), '[^0-9]', '', 'g');
  if v_digits = '' then
    return null;
  end if;

  return v_digits;
end;
$$;

create or replace function public.extract_imei_from_report_name(p_report_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_parts text[];
  v_part text;
  v_key text;
  v_val text;
begin
  if p_report_name is null or btrim(p_report_name) = '' then
    return null;
  end if;

  v_parts := string_to_array(p_report_name, '|');
  foreach v_part in array v_parts loop
    if strpos(v_part, '=') > 0 then
      v_key := lower(regexp_replace(split_part(v_part, '=', 1), '[^a-z0-9]', '', 'g'));
      v_val := btrim(split_part(v_part, '=', 2));
      if v_key in ('imei', 'imeinumber', 'imeino') then
        return public.normalize_imei(v_val);
      end if;
    elsif strpos(v_part, ':') > 0 then
      v_key := lower(regexp_replace(split_part(v_part, ':', 1), '[^a-z0-9]', '', 'g'));
      v_val := btrim(split_part(v_part, ':', 2));
      if v_key in ('imei', 'imeinumber', 'imeino') then
        return public.normalize_imei(v_val);
      end if;
    end if;
  end loop;

  return public.normalize_imei(split_part(p_report_name, '|', 1));
end;
$$;

create or replace function public.extract_client_from_report_name(p_report_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_parts text[];
  v_part text;
  v_key text;
  v_val text;
begin
  if p_report_name is null or btrim(p_report_name) = '' then
    return null;
  end if;

  v_parts := string_to_array(p_report_name, '|');
  foreach v_part in array v_parts loop
    if strpos(v_part, '=') > 0 then
      v_key := lower(regexp_replace(split_part(v_part, '=', 1), '[^a-z0-9]', '', 'g'));
      v_val := btrim(split_part(v_part, '=', 2));
      if v_key in ('client', 'clientname', 'customer', 'company') and v_val <> '' then
        return v_val;
      end if;
    elsif strpos(v_part, ':') > 0 then
      v_key := lower(regexp_replace(split_part(v_part, ':', 1), '[^a-z0-9]', '', 'g'));
      v_val := btrim(split_part(v_part, ':', 2));
      if v_key in ('client', 'clientname', 'customer', 'company') and v_val <> '' then
        return v_val;
      end if;
    end if;
  end loop;

  if array_length(v_parts, 1) >= 2 and btrim(v_parts[2]) <> '' then
    return btrim(v_parts[2]);
  end if;

  return null;
end;
$$;

create or replace function public.extract_asset_from_report_name(p_report_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_parts text[];
  v_part text;
  v_key text;
  v_val text;
begin
  if p_report_name is null or btrim(p_report_name) = '' then
    return null;
  end if;

  v_parts := string_to_array(p_report_name, '|');
  foreach v_part in array v_parts loop
    if strpos(v_part, '=') > 0 then
      v_key := lower(regexp_replace(split_part(v_part, '=', 1), '[^a-z0-9]', '', 'g'));
      v_val := btrim(split_part(v_part, '=', 2));
      if v_key in ('asset', 'assignedasset', 'assignedassetstatic', 'registration', 'registrationnumber', 'reg', 'regnumber') and v_val <> '' then
        return v_val;
      end if;
    elsif strpos(v_part, ':') > 0 then
      v_key := lower(regexp_replace(split_part(v_part, ':', 1), '[^a-z0-9]', '', 'g'));
      v_val := btrim(split_part(v_part, ':', 2));
      if v_key in ('asset', 'assignedasset', 'assignedassetstatic', 'registration', 'registrationnumber', 'reg', 'regnumber') and v_val <> '' then
        return v_val;
      end if;
    end if;
  end loop;

  if array_length(v_parts, 1) >= 3 and btrim(v_parts[3]) <> '' then
    return btrim(v_parts[3]);
  end if;

  return null;
end;
$$;

create or replace function public.extract_imei_from_payload(p_payload jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_imei text;
begin
  if p_payload is null then
    return null;
  end if;

  v_imei := coalesce(
    p_payload ->> 'imei',
    p_payload ->> 'imei_number',
    p_payload ->> 'imeiNumber',
    p_payload #>> '{device,imei}',
    p_payload #>> '{data,0,imei}',
    p_payload #>> '{data,0,imei_number}',
    p_payload #>> '{data,0,imeiNumber}'
  );

  return public.normalize_imei(v_imei);
end;
$$;

alter table if exists public.raw_telemetry_inbound
  add column if not exists source_imei text;

create index if not exists idx_raw_telemetry_inbound_source_imei
  on public.raw_telemetry_inbound(source_imei);

create index if not exists idx_raw_telemetry_inbound_payload_hash
  on public.raw_telemetry_inbound(payload_hash);

update public.raw_telemetry_inbound r
set source_imei = coalesce(
  r.source_imei,
  public.extract_imei_from_payload(r.payload_json),
  public.extract_imei_from_report_name(r.report_name),
  public.extract_imei_from_report_name(r.payload_json ->> 'report_name')
)
where r.source_imei is null;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vehicles'
  ) then
    alter table public.vehicles add column if not exists imei text;
  end if;
end $$;

do $$
declare
  v_has_asset_id boolean;
  v_has_vehicle_plate boolean;
begin
  if to_regclass('public.vehicles') is null or to_regclass('public.fuel_report_asset_registry') is null then
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'asset_id'
  ) into v_has_asset_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'vehicle_plate'
  ) into v_has_vehicle_plate;

  if v_has_asset_id then
    update public.vehicles v
    set imei = public.normalize_imei(fr.imei_number)
    from public.fuel_report_asset_registry fr
    where v.imei is null
      and fr.imei_number is not null
      and fr.assigned_asset is not null
      and v.asset_id = fr.assigned_asset;
  end if;

  if v_has_vehicle_plate then
    update public.vehicles v
    set imei = public.normalize_imei(fr.imei_number)
    from public.fuel_report_asset_registry fr
    where v.imei is null
      and fr.imei_number is not null
      and fr.assigned_asset is not null
      and v.vehicle_plate = fr.assigned_asset;
  end if;
end $$;

do $$
declare
  v_has_dups boolean := false;
begin
  if to_regclass('public.vehicles') is null then
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'imei'
  ) then
    return;
  end if;

  select exists (
    select 1
    from (
      select public.normalize_imei(imei) as normalized_imei, count(*) as c
      from public.vehicles
      where imei is not null and btrim(imei) <> ''
      group by public.normalize_imei(imei)
      having count(*) > 1
    ) d
  ) into v_has_dups;

  if v_has_dups then
    if to_regclass('public.idx_vehicles_imei_lookup') is null then
      execute $sql$create index idx_vehicles_imei_lookup on public.vehicles ((public.normalize_imei(imei))) where imei is not null and btrim(imei) <> ''$sql$;
    end if;
  else
    if to_regclass('public.idx_vehicles_imei_unique') is null then
      execute $sql$create unique index idx_vehicles_imei_unique on public.vehicles ((public.normalize_imei(imei))) where imei is not null and btrim(imei) <> ''$sql$;
    end if;
  end if;
end $$;

create index if not exists idx_fuel_report_asset_registry_imei_number
  on public.fuel_report_asset_registry((public.normalize_imei(imei_number)));

do $$
declare
  v_vehicle_id_type text := 'text';
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicles'
      and column_name = 'id'
  ) then
    select format_type(a.atttypid, a.atttypmod)
    into v_vehicle_id_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'vehicles'
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;
  end if;

  execute format(
    'create table if not exists public.fuel_temperature_reports (
      id uuid primary key default gen_random_uuid(),
      raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null,
      vehicle_id %s,
      imei_number text,
      client_name text,
      registration_number text,
      report_name text,
      report_type text not null default ''50'',
      report_timestamp timestamptz,
      source_payload jsonb not null default ''{}''::jsonb,
      created_at timestamptz not null default now(),
      unique(raw_inbound_id)
    )',
    v_vehicle_id_type
  );

  execute format(
    'create table if not exists public.refuel_events (
      id uuid primary key default gen_random_uuid(),
      temperature_report_id text,
      raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null,
      vehicle_id %s,
      event_timestamp timestamptz,
      fuel_volume_litres numeric,
      odometer_km numeric,
      location text,
      payload jsonb not null default ''{}''::jsonb,
      created_at timestamptz not null default now()
    )',
    v_vehicle_id_type
  );

  execute format(
    'create table if not exists public.raw_sensor_data (
      id uuid primary key default gen_random_uuid(),
      temperature_report_id text,
      raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null,
      vehicle_id %s,
      sensor_name text not null,
      sensor_value text,
      sensor_unit text,
      sensor_timestamp timestamptz,
      payload jsonb not null default ''{}''::jsonb,
      created_at timestamptz not null default now()
    )',
    v_vehicle_id_type
  );
end $$;

do $$
declare
  v_vehicle_id_type text := 'text';
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicles'
      and column_name = 'id'
  ) then
    select format_type(a.atttypid, a.atttypmod)
    into v_vehicle_id_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'vehicles'
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;
  end if;

  if to_regclass('public.fuel_temperature_reports') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'raw_inbound_id'
    ) then
      alter table public.fuel_temperature_reports
        add column raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'vehicle_id'
    ) then
      execute format('alter table public.fuel_temperature_reports add column vehicle_id %s', v_vehicle_id_type);
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'imei_number'
    ) then
      alter table public.fuel_temperature_reports add column imei_number text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'client_name'
    ) then
      alter table public.fuel_temperature_reports add column client_name text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'registration_number'
    ) then
      alter table public.fuel_temperature_reports add column registration_number text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'report_name'
    ) then
      alter table public.fuel_temperature_reports add column report_name text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'report_type'
    ) then
      alter table public.fuel_temperature_reports add column report_type text default '50';
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'report_timestamp'
    ) then
      alter table public.fuel_temperature_reports add column report_timestamp timestamptz;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'source_payload'
    ) then
      alter table public.fuel_temperature_reports add column source_payload jsonb not null default '{}'::jsonb;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'fuel_temperature_reports_raw_inbound_id_key'
        and conrelid = 'public.fuel_temperature_reports'::regclass
    ) then
      begin
        alter table public.fuel_temperature_reports
          add constraint fuel_temperature_reports_raw_inbound_id_key unique (raw_inbound_id);
      exception
        when others then null;
      end;
    end if;
  end if;

  if to_regclass('public.refuel_events') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'refuel_events' and column_name = 'temperature_report_id'
    ) then
      alter table public.refuel_events
        add column temperature_report_id text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'refuel_events' and column_name = 'raw_inbound_id'
    ) then
      alter table public.refuel_events
        add column raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'refuel_events' and column_name = 'vehicle_id'
    ) then
      execute format('alter table public.refuel_events add column vehicle_id %s', v_vehicle_id_type);
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'refuel_events' and column_name = 'payload'
    ) then
      alter table public.refuel_events add column payload jsonb not null default '{}'::jsonb;
    end if;
  end if;

  if to_regclass('public.raw_sensor_data') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'raw_sensor_data' and column_name = 'temperature_report_id'
    ) then
      alter table public.raw_sensor_data
        add column temperature_report_id text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'raw_sensor_data' and column_name = 'raw_inbound_id'
    ) then
      alter table public.raw_sensor_data
        add column raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'raw_sensor_data' and column_name = 'vehicle_id'
    ) then
      execute format('alter table public.raw_sensor_data add column vehicle_id %s', v_vehicle_id_type);
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'raw_sensor_data' and column_name = 'payload'
    ) then
      alter table public.raw_sensor_data add column payload jsonb not null default '{}'::jsonb;
    end if;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'raw_inbound_id'
  ) then
    create index if not exists idx_fuel_temperature_reports_raw_inbound
      on public.fuel_temperature_reports(raw_inbound_id);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'vehicle_id'
  ) then
    create index if not exists idx_fuel_temperature_reports_vehicle_id
      on public.fuel_temperature_reports(vehicle_id);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'imei_number'
  ) then
    create index if not exists idx_fuel_temperature_reports_imei_number
      on public.fuel_temperature_reports((public.normalize_imei(imei_number)));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'refuel_events' and column_name = 'temperature_report_id'
  ) then
    create index if not exists idx_refuel_events_temperature_report_id
      on public.refuel_events(temperature_report_id);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'refuel_events' and column_name = 'vehicle_id'
  ) then
    create index if not exists idx_refuel_events_vehicle_id
      on public.refuel_events(vehicle_id);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'raw_sensor_data' and column_name = 'temperature_report_id'
  ) then
    create index if not exists idx_raw_sensor_data_temperature_report_id
      on public.raw_sensor_data(temperature_report_id);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'raw_sensor_data' and column_name = 'vehicle_id'
  ) then
    create index if not exists idx_raw_sensor_data_vehicle_id
      on public.raw_sensor_data(vehicle_id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'id'
      and data_type = 'uuid'
  ) then
    execute 'alter table public.profiles alter column id set default gen_random_uuid()';
  end if;
exception
  when undefined_table then null;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'client_users'
      and column_name = 'id'
      and data_type = 'uuid'
  ) then
    execute 'alter table public.client_users alter column id set default gen_random_uuid()';
  end if;
exception
  when undefined_table then null;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'telemetry_alerts'
      and column_name = 'report_id'
      and data_type = 'bigint'
  ) then
    create sequence if not exists public.telemetry_alerts_report_id_seq;
    alter table public.telemetry_alerts
      alter column report_id set default nextval('public.telemetry_alerts_report_id_seq');

    perform setval(
      'public.telemetry_alerts_report_id_seq',
      coalesce((select max(report_id) from public.telemetry_alerts where report_id is not null), 0) + 1,
      false
    );
  end if;
exception
  when undefined_table then null;
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
  v_imei text := public.normalize_imei(p_imei_number);
  v_vehicle_id text;
  v_has_id boolean;
  v_has_imei boolean;
  v_has_asset_id boolean;
  v_has_vehicle_plate boolean;
  v_has_client_name boolean;
  v_has_company_name boolean;
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

  if v_has_id and v_has_imei and v_imei is not null then
    execute 'select id::text from public.vehicles where public.normalize_imei(imei) = $1 limit 1'
      into v_vehicle_id
      using v_imei;
  end if;

  if v_vehicle_id is null and v_has_id and v_has_asset_id and v_asset is not null then
    execute 'select id::text from public.vehicles where asset_id = $1 limit 1'
      into v_vehicle_id
      using v_asset;
  end if;

  if v_vehicle_id is null and v_has_id and v_has_vehicle_plate and v_asset is not null then
    execute 'select id::text from public.vehicles where vehicle_plate = $1 limit 1'
      into v_vehicle_id
      using v_asset;
  end if;

  if v_vehicle_id is not null then
    if v_has_imei and v_imei is not null then
      execute 'update public.vehicles set imei = coalesce(imei, $1) where id::text = $2'
        using v_imei, v_vehicle_id;
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

  if v_asset is null and v_imei is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'missing_imei_and_asset');
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
          v_vals := array_append(v_vals, format('%L', coalesce(v_asset, v_imei)));
        end if;
      end if;
    elsif v_col.column_name = 'asset_id' and v_asset is not null then
      v_cols := array_append(v_cols, 'asset_id');
      v_vals := array_append(v_vals, format('%L', v_asset));
    elsif v_col.column_name = 'vehicle_plate' and v_asset is not null then
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
      v_vals := array_append(v_vals, format('%L', coalesce(v_asset, v_imei)));
    elsif v_col.column_name = 'vehicle_name' then
      v_cols := array_append(v_cols, 'vehicle_name');
      v_vals := array_append(v_vals, format('%L', coalesce(v_asset, v_imei)));
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

-- <<< END 20260222191000_imei_key_and_fuel_normalized_tables.sql



-- >>> BEGIN 20260222200000_strict_uuid_unification_and_assetid_strategy.sql

-- Strict UUID unification for telemetry tables and references.
-- Teletrac rule: IMEI is treated as asset_id for this source.

create extension if not exists pgcrypto;

create or replace function public.promote_reference_column_to_uuid(
  p_src_schema text,
  p_src_table text,
  p_src_col text,
  p_ref_schema text,
  p_ref_table text,
  p_ref_legacy_col text default 'id_legacy',
  p_fk_name text default null,
  p_on_delete text default 'SET NULL',
  p_on_update text default 'NO ACTION'
)
returns void
language plpgsql
as $$
declare
  v_src regclass;
  v_ref regclass;
  v_src_type text;
  v_ref_id_type text;
  v_tmp_col text := p_src_col || '__uuid';
  v_src_has_legacy boolean;
  v_ref_has_legacy boolean;
  v_has_fk boolean;
  v_fk_name text := coalesce(p_fk_name, substr(p_src_table || '_' || p_src_col ||b '_fkey_uuid', 1, 63));
  v_drop_fk record;
begin
  v_src := to_regclass(format('%I.%I', p_src_schema, p_src_table));
  v_ref := to_regclass(format('%I.%I', p_ref_schema, p_ref_table));
  if v_src is null or v_ref is null then
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = p_src_schema
      and table_name = p_src_table
      and column_name = p_src_col
  ) then
    return;
  end if;

  select format_type(a.atttypid, a.atttypmod)
  into v_src_type
  from pg_attribute a
  where a.attrelid = v_src
    and a.attname = p_src_col
    and a.attnum > 0
    and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod)
  into v_ref_id_type
  from pg_attribute a
  where a.attrelid = v_ref
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if v_src_type <> 'uuid' then
    execute format(
      'alter table %I.%I add column if not exists %I uuid',
      p_src_schema,
      p_src_table,
      v_tmp_col
    );

    select exists (
      select 1
      from information_schema.columns
      where table_schema = p_ref_schema
        and table_name = p_ref_table
        and column_name = p_ref_legacy_col
    )
    into v_ref_has_legacy;

    if v_ref_has_legacy then
      execute format(
        'update %I.%I src
         set %I = ref.id
         from %I.%I ref
         where src.%I is not null
           and src.%I is null
           and (
             ref.id::text = src.%I::text
             or ref.%I = src.%I::text
           )',
        p_src_schema,
        p_src_table,
        v_tmp_col,
        p_ref_schema,
        p_ref_table,
        p_src_col,
        v_tmp_col,
        p_src_col,
        p_ref_legacy_col,
        p_src_col
      );
    else
      execute format(
        'update %I.%I src
         set %I = ref.id
         from %I.%I ref
         where src.%I is not null
           and src.%I is null
           and ref.id::text = src.%I::text',
        p_src_schema,
        p_src_table,
        v_tmp_col,
        p_ref_schema,
        p_ref_table,
        p_src_col,
        v_tmp_col,
        p_src_col
      );
    end if;

    for v_drop_fk in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
      where con.contype = 'f'
        and con.confrelid = v_ref
        and array_length(con.conkey, 1) = 1
        and ns.nspname = p_src_schema
        and rel.relname = p_src_table
        and att.attname = p_src_col
    loop
      execute format(
        'alter table %I.%I drop constraint if exists %I',
        p_src_schema,
        p_src_table,
        v_drop_fk.conname
      );
    end loop;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = p_src_schema
        and table_name = p_src_table
        and column_name = p_src_col || '_legacy'
    )
    into v_src_has_legacy;

    if not v_src_has_legacy then
      execute format(
        'alter table %I.%I rename column %I to %I',
        p_src_schema,
        p_src_table,
        p_src_col,
        p_src_col || '_legacy'
      );
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = p_src_schema
        and table_name = p_src_table
        and column_name = p_src_col
    ) then
      execute format(
        'alter table %I.%I rename column %I to %I',
        p_src_schema,
        p_src_table,
        v_tmp_col,
        p_src_col
      );
    end if;
  end if;

  if v_ref_id_type = 'uuid' and exists (
    select 1
    from information_schema.columns
    where table_schema = p_src_schema
      and table_name = p_src_table
      and column_name = p_src_col
      and data_type = 'uuid'
  ) then
    select exists (
      select 1
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
      where con.contype = 'f'
        and ns.nspname = p_src_schema
        and rel.relname = p_src_table
        and con.conname = v_fk_name
    )
    into v_has_fk;

    if not v_has_fk then
      execute format(
        'alter table %I.%I add constraint %I foreign key (%I) references %I.%I(id) on update %s on delete %s',
        p_src_schema,
        p_src_table,
        v_fk_name,
        p_src_col,
        p_ref_schema,
        p_ref_table,
        p_on_update,
        p_on_delete
      );
    end if;
  end if;
end;
$$;

create or replace function public.convert_table_id_to_uuid(
  p_schema text,
  p_table text,
  p_legacy_col text default 'id_legacy'
)
returns void
language plpgsql
as $$
declare
  v_target regclass;
  v_id_type text;
  v_fk record;
  v_drop_pk record;
  v_legacy_col text := p_legacy_col;
  v_alt_legacy_col text;
  v_has_id_uuid boolean;
begin
  v_target := to_regclass(format('%I.%I', p_schema, p_table));
  if v_target is null then
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = 'id'
  ) then
    return;
  end if;

  select format_type(a.atttypid, a.atttypmod)
  into v_id_type
  from pg_attribute a
  where a.attrelid = v_target
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if v_id_type = 'uuid' then
    execute format(
      'alter table %I.%I alter column id set default gen_random_uuid()',
      p_schema,
      p_table
    );
    return;
  end if;

  execute format(
    'alter table %I.%I add column if not exists id_uuid uuid default gen_random_uuid()',
    p_schema,
    p_table
  );

  execute format(
    'update %I.%I set id_uuid = gen_random_uuid() where id_uuid is null',
    p_schema,
    p_table
  );

  if exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = v_legacy_col
  ) then
    v_alt_legacy_col := v_legacy_col || '_text';
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = p_schema
        and table_name = p_table
        and column_name = v_alt_legacy_col
    ) then
      execute format(
        'alter table %I.%I add column %I text',
        p_schema,
        p_table,
        v_alt_legacy_col
      );
    end if;
    execute format(
      'update %I.%I set %I = coalesce(%I, id::text)',
      p_schema,
      p_table,
      v_alt_legacy_col,
      v_alt_legacy_col
    );
    v_legacy_col := v_alt_legacy_col;
  else
    execute format(
      'alter table %I.%I add column %I text',
      p_schema,
      p_table,
      v_legacy_col
    );
    execute format(
      'update %I.%I set %I = coalesce(%I, id::text)',
      p_schema,
      p_table,
      v_legacy_col,
      v_legacy_col
    );
  end if;

  create temporary table if not exists _uuid_fk_work (
    src_schema text,
    src_table text,
    src_col text,
    constraint_name text,
    on_delete text,
    on_update text
  ) on commit drop;

  truncate table _uuid_fk_work;

  insert into _uuid_fk_work (src_schema, src_table, src_col, constraint_name, on_delete, on_update)
  select
    ns.nspname,
    rel.relname,
    att.attname,
    con.conname,
    case con.confdeltype
      when 'a' then 'NO ACTION'
      when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'
      when 'n' then 'SET NULL'
      when 'd' then 'SET DEFAULT'
      else 'NO ACTION'
    end as on_delete,
    case con.confupdtype
      when 'a' then 'NO ACTION'
      when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'
      when 'n' then 'SET NULL'
      when 'd' then 'SET DEFAULT'
      else 'NO ACTION'
    end as on_update
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
  where con.contype = 'f'
    and con.confrelid = v_target
    and array_length(con.conkey, 1) = 1
    and array_length(con.confkey, 1) = 1;

  for v_fk in
    select * from _uuid_fk_work
  loop
    execute format(
      'alter table %I.%I add column if not exists %I uuid',
      v_fk.src_schema,
      v_fk.src_table,
      v_fk.src_col || '__uuid'
    );

    execute format(
      'update %I.%I src
       set %I = ref.id_uuid
       from %I.%I ref
       where src.%I is not null
         and src.%I is null
         and (
           ref.id::text = src.%I::text
           or ref.%I = src.%I::text
         )',
      v_fk.src_schema,
      v_fk.src_table,
      v_fk.src_col || '__uuid',
      p_schema,
      p_table,
      v_fk.src_col,
      v_fk.src_col || '__uuid',
      v_fk.src_col,
      v_legacy_col,
      v_fk.src_col
    );

    execute format(
      'alter table %I.%I drop constraint if exists %I',
      v_fk.src_schema,
      v_fk.src_table,
      v_fk.constraint_name
    );
  end loop;

  for v_drop_pk in
    select conname
    from pg_constraint
    where conrelid = v_target
      and contype = 'p'
  loop
    execute format(
      'alter table %I.%I drop constraint if exists %I',
      p_schema,
      p_table,
      v_drop_pk.conname
    );
  end loop;

  execute format(
    'alter table %I.%I rename column id to %I',
    p_schema,
    p_table,
    v_legacy_col || '_old'
  );

  select exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = 'id_uuid'
  )
  into v_has_id_uuid;

  if v_has_id_uuid then
    execute format(
      'alter table %I.%I rename column id_uuid to id',
      p_schema,
      p_table
    );
  end if;

  execute format(
    'alter table %I.%I alter column id set default gen_random_uuid()',
    p_schema,
    p_table
  );

  execute format(
    'alter table %I.%I alter column id set not null',
    p_schema,
    p_table
  );

  if not exists (
    select 1
    from pg_constraint
    where conrelid = v_target
      and contype = 'p'
  ) then
    execute format(
      'alter table %I.%I add primary key (id)',
      p_schema,
      p_table
    );
  end if;

  for v_fk in
    select * from _uuid_fk_work
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = v_fk.src_schema
        and table_name = v_fk.src_table
        and column_name = v_fk.src_col
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = v_fk.src_schema
        and table_name = v_fk.src_table
        and column_name = v_fk.src_col || '__uuid'
    ) then
      if not exists (
        select 1
        from information_schema.columns
        where table_schema = v_fk.src_schema
          and table_name = v_fk.src_table
          and column_name = v_fk.src_col || '_legacy'
      ) then
        execute format(
          'alter table %I.%I rename column %I to %I',
          v_fk.src_schema,
          v_fk.src_table,
          v_fk.src_col,
          v_fk.src_col || '_legacy'
        );
      end if;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = v_fk.src_schema
        and table_name = v_fk.src_table
        and column_name = v_fk.src_col
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = v_fk.src_schema
        and table_name = v_fk.src_table
        and column_name = v_fk.src_col || '__uuid'
    ) then
      execute format(
        'alter table %I.%I rename column %I to %I',
        v_fk.src_schema,
        v_fk.src_table,
        v_fk.src_col || '__uuid',
        v_fk.src_col
      );
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = v_fk.src_schema
        and table_name = v_fk.src_table
        and column_name = v_fk.src_col
        and data_type = 'uuid'
    ) then
      if not exists (
        select 1
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace ns on ns.oid = rel.relnamespace
        where con.contype = 'f'
          and ns.nspname = v_fk.src_schema
          and rel.relname = v_fk.src_table
          and con.conname = v_fk.constraint_name
      ) then
        execute format(
          'alter table %I.%I add constraint %I foreign key (%I) references %I.%I(id) on update %s on delete %s',
          v_fk.src_schema,
          v_fk.src_table,
          v_fk.constraint_name,
          v_fk.src_col,
          p_schema,
          p_table,
          v_fk.on_update,
          v_fk.on_delete
        );
      end if;
    end if;
  end loop;
end;
$$;

select public.convert_table_id_to_uuid('public', 'vehicles', 'id_legacy');
select public.convert_table_id_to_uuid('public', 'fuel_temperature_reports', 'id_legacy');

select public.promote_reference_column_to_uuid(
  'public', 'telemetry_alerts', 'vehicle_id',
  'public', 'vehicles',
  'id_legacy',
  'telemetry_alerts_vehicle_id_fkey',
  'SET NULL',
  'NO ACTION'
);

select public.promote_reference_column_to_uuid(
  'public', 'fuel_temperature_reports', 'vehicle_id',
  'public', 'vehicles',
  'id_legacy',
  'fuel_temperature_reports_vehicle_id_fkey',
  'SET NULL',
  'NO ACTION'
);

select public.promote_reference_column_to_uuid(
  'public', 'refuel_events', 'vehicle_id',
  'public', 'vehicles',
  'id_legacy',
  'refuel_events_vehicle_id_fkey',
  'SET NULL',
  'NO ACTION'
);

select public.promote_reference_column_to_uuid(
  'public', 'raw_sensor_data', 'vehicle_id',
  'public', 'vehicles',
  'id_legacy',
  'raw_sensor_data_vehicle_id_fkey',
  'SET NULL',
  'NO ACTION'
);

select public.promote_reference_column_to_uuid(
  'public', 'daily_movement_reports', 'vehicle_id',
  'public', 'vehicles',
  'id_legacy',
  'daily_movement_reports_vehicle_id_fkey',
  'SET NULL',
  'NO ACTION'
);

select public.promote_reference_column_to_uuid(
  'public', 'refuel_events', 'temperature_report_id',
  'public', 'fuel_temperature_reports',
  'id_legacy',
  'refuel_events_temperature_report_id_fkey',
  'CASCADE',
  'NO ACTION'
);

select public.promote_reference_column_to_uuid(
  'public', 'raw_sensor_data', 'temperature_report_id',
  'public', 'fuel_temperature_reports',
  'id_legacy',
  'raw_sensor_data_temperature_report_id_fkey',
  'CASCADE',
  'NO ACTION'
);

do $$
declare
  r record;
begin
  for r in
    select c.table_schema, c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'id'
      and c.data_type = 'uuid'
  loop
    begin
      execute format(
        'alter table %I.%I alter column id set default gen_random_uuid()',
        r.table_schema,
        r.table_name
      );
    exception
      when others then null;
    end;
  end loop;
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
  v_assigned_asset text := nullif(trim(p_assigned_asset), '');
  v_client text := nullif(trim(p_client_name), '');
  v_imei text := public.normalize_imei(p_imei_number);
  v_asset_key text := v_imei;
  v_vehicle_id text;
  v_has_id boolean;
  v_has_imei boolean;
  v_has_asset_id boolean;
  v_has_vehicle_plate boolean;
  v_has_client_name boolean;
  v_has_company_name boolean;
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
          v_vals := array_append(v_vals, format('%L', coalesce(v_asset_key, v_assigned_asset)));
        end if;
      end if;
    elsif v_col.column_name = 'asset_id' and v_asset_key is not null then
      v_cols := array_append(v_cols, 'asset_id');
      v_vals := array_append(v_vals, format('%L', v_asset_key));
    elsif v_col.column_name = 'vehicle_plate' and v_assigned_asset is not null then
      v_cols := array_append(v_cols, 'vehicle_plate');
      v_vals := array_append(v_vals, format('%L', v_assigned_asset));
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

-- <<< END 20260222200000_strict_uuid_unification_and_assetid_strategy.sql



-- >>> BEGIN 20260222221000_sync_vehicle_required_defaults.sql

-- Ensure vehicles can be auto-created from raw telemetry even when report payloads
-- do not carry all required vehicle columns.

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

-- <<< END 20260222221000_sync_vehicle_required_defaults.sql



-- >>> BEGIN 20260222224000_report50_event_sensor_identity_columns.sql

-- Add report_type=50 identity columns to event/sensor derived tables.

do $$
begin
  if to_regclass('public.refuel_events') is not null then
    alter table public.refuel_events add column if not exists imei_number text;
    alter table public.refuel_events add column if not exists client_name text;
    alter table public.refuel_events add column if not exists registration_number text;
    alter table public.refuel_events add column if not exists event_type text;
  end if;
end $$;

do $$
begin
  if to_regclass('public.raw_sensor_data') is not null then
    alter table public.raw_sensor_data add column if not exists imei_number text;
    alter table public.raw_sensor_data add column if not exists client_name text;
    alter table public.raw_sensor_data add column if not exists registration_number text;
  end if;
end $$;

create index if not exists idx_refuel_events_imei_number
  on public.refuel_events(imei_number);

create index if not exists idx_refuel_events_registration_number
  on public.refuel_events(registration_number);

create index if not exists idx_refuel_events_event_type
  on public.refuel_events(event_type);

create index if not exists idx_raw_sensor_data_imei_number
  on public.raw_sensor_data(imei_number);

create index if not exists idx_raw_sensor_data_registration_number
  on public.raw_sensor_data(registration_number);

do $$
begin
  if to_regclass('public.fuel_temperature_reports') is null then
    return;
  end if;

  -- Backfill refuel_events identity columns from parent fuel report when possible.
  if to_regclass('public.refuel_events') is not null then
    update public.refuel_events re
    set
      imei_number = coalesce(re.imei_number, fr.imei_number),
      client_name = coalesce(re.client_name, fr.client_name),
      registration_number = coalesce(re.registration_number, fr.registration_number)
    from public.fuel_temperature_reports fr
    where (
      (re.temperature_report_id is not null and re.temperature_report_id::text = fr.id::text)
      or (re.fuel_report_id is not null and re.fuel_report_id::text = fr.id::text)
    )
      and (
        re.imei_number is null
        or re.client_name is null
        or re.registration_number is null
      );
  end if;

  -- Backfill raw_sensor_data identity columns from parent fuel report when possible.
  if to_regclass('public.raw_sensor_data') is not null then
    update public.raw_sensor_data rs
    set
      imei_number = coalesce(rs.imei_number, fr.imei_number),
      client_name = coalesce(rs.client_name, fr.client_name),
      registration_number = coalesce(rs.registration_number, fr.registration_number)
    from public.fuel_temperature_reports fr
    where (
      (rs.temperature_report_id is not null and rs.temperature_report_id::text = fr.id::text)
      or (rs.fuel_report_id is not null and rs.fuel_report_id::text = fr.id::text)
    )
      and (
        rs.imei_number is null
        or rs.client_name is null
        or rs.registration_number is null
      );
  end if;
end $$;

-- <<< END 20260222224000_report50_event_sensor_identity_columns.sql



-- >>> BEGIN 20260222232000_raw_sensor_telemetry_columns_cleanup.sql

-- Report 50 telemetry detail columns on raw_sensor_data
-- and cleanup of legacy duplicate columns.

do $$
begin
  if to_regclass('public.raw_sensor_data') is null then
    return;
  end if;

  alter table public.raw_sensor_data add column if not exists af numeric(10, 2);
  alter table public.raw_sensor_data add column if not exists telemetry_id integer;
  alter table public.raw_sensor_data add column if not exists rf numeric(10, 2);
  alter table public.raw_sensor_data add column if not exists alt numeric(10, 2);
  alter table public.raw_sensor_data add column if not exists hrs numeric(14, 2);
  alter table public.raw_sensor_data add column if not exists ign integer;
  alter table public.raw_sensor_data add column if not exists odo numeric(12, 3);
  alter table public.raw_sensor_data add column if not exists rpm numeric(10, 2);
  alter table public.raw_sensor_data add column if not exists date text;
  alter table public.raw_sensor_data add column if not exists spid numeric(10, 2);
end $$;

-- Backfill telemetry columns from payload when available.
update public.raw_sensor_data rs
set
  af = coalesce(rs.af, nullif(regexp_replace(coalesce(rs.payload ->> 'af', ''), '[^0-9\.\-]', '', 'g'), '')::numeric),
  telemetry_id = coalesce(rs.telemetry_id, nullif(regexp_replace(coalesce(rs.payload ->> 'id', ''), '[^0-9\.\-]', '', 'g'), '')::numeric::int),
  rf = coalesce(rs.rf, nullif(regexp_replace(coalesce(rs.payload ->> 'rf', ''), '[^0-9\.\-]', '', 'g'), '')::numeric),
  alt = coalesce(rs.alt, nullif(regexp_replace(coalesce(rs.payload ->> 'alt', ''), '[^0-9\.\-]', '', 'g'), '')::numeric),
  hrs = coalesce(rs.hrs, nullif(regexp_replace(coalesce(rs.payload ->> 'hrs', ''), '[^0-9\.\-]', '', 'g'), '')::numeric),
  ign = coalesce(rs.ign, nullif(regexp_replace(coalesce(rs.payload ->> 'ign', ''), '[^0-9\.\-]', '', 'g'), '')::numeric::int),
  odo = coalesce(rs.odo, nullif(regexp_replace(coalesce(rs.payload ->> 'odo', ''), '[^0-9\.\-]', '', 'g'), '')::numeric),
  rpm = coalesce(rs.rpm, nullif(regexp_replace(coalesce(rs.payload ->> 'rpm', ''), '[^0-9\.\-]', '', 'g'), '')::numeric),
  date = coalesce(rs.date, nullif(rs.payload ->> 'date', '')),
  spid = coalesce(rs.spid, nullif(regexp_replace(coalesce(rs.payload ->> 'spid', ''), '[^0-9\.\-]', '', 'g'), '')::numeric)
where rs.payload <> '{}'::jsonb;

-- Keep registration text exactly as sent in report_name positional segment.
do $$
begin
  if to_regclass('public.raw_telemetry_inbound') is null then
    return;
  end if;

  if to_regclass('public.fuel_temperature_reports') is not null then
    update public.fuel_temperature_reports ftr
    set registration_number = split_part(r.report_name, '|', 3)
    from public.raw_telemetry_inbound r
    where ftr.raw_inbound_id = r.id
      and r.report_type = '50'
      and r.report_name like '%|%|%';
  end if;

  if to_regclass('public.refuel_events') is not null then
    update public.refuel_events re
    set registration_number = split_part(r.report_name, '|', 3)
    from public.raw_telemetry_inbound r
    where re.raw_inbound_id = r.id
      and r.report_type = '50'
      and r.report_name like '%|%|%';
  end if;

  if to_regclass('public.raw_sensor_data') is not null then
    update public.raw_sensor_data rs
    set registration_number = split_part(r.report_name, '|', 3)
    from public.raw_telemetry_inbound r
    where rs.raw_inbound_id = r.id
      and r.report_type = '50'
      and r.report_name like '%|%|%';
  end if;

  if to_regclass('public.fuel_report_asset_registry') is not null then
    update public.fuel_report_asset_registry fr
    set
      client_name = split_part(fr.report_name, '|', 2),
      assigned_asset = split_part(fr.report_name, '|', 3)
    where fr.report_type = '50'
      and fr.report_name like '%|%|%';
  end if;
end $$;

-- Remove redundant legacy columns from raw_sensor_data.
alter table if exists public.raw_sensor_data
  drop column if exists fuel_report_id_legacy,
  drop column if exists temperature_report_id_legacy,
  drop column if exists vehicle_id_legacy;

drop index if exists public.idx_raw_sensor_data_temperature_report_id;
drop index if exists public.idx_raw_sensor_data_vehicle_id;

create index if not exists idx_raw_sensor_data_temperature_report_id
  on public.raw_sensor_data (temperature_report_id);

create index if not exists idx_raw_sensor_data_vehicle_id
  on public.raw_sensor_data (vehicle_id);

-- <<< END 20260222232000_raw_sensor_telemetry_columns_cleanup.sql



-- >>> BEGIN 20260222235000_report50_sql_bulk_ingest.sql

-- Bulk SQL ingestion for large report_type=50 telemetry arrays.
-- This avoids edge function compute limits for rows with thousands of telemetry points.

create or replace function public.try_numeric(p_text text)
returns numeric
language plpgsql
immutable
as $$
declare
  v_clean text;
begin
  if p_text is null then
    return null;
  end if;
  v_clean := nullif(regexp_replace(p_text, '[^0-9\.\-]', '', 'g'), '');
  if v_clean is null then
    return null;
  end if;
  return v_clean::numeric;
exception
  when others then
    return null;
end;
$$;

create or replace function public.try_timestamp(p_text text)
returns timestamp without time zone
language plpgsql
immutable
as $$
begin
  if p_text is null or btrim(p_text) = '' then
    return null;
  end if;
  return p_text::timestamp;
exception
  when others then
    return null;
end;
$$;

create or replace function public.process_report50_details(
  p_raw_inbound_id uuid,
  p_temperature_report_id uuid,
  p_vehicle_id uuid,
  p_imei_number text,
  p_client_name text,
  p_registration_number text,
  p_report_timestamp timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := '{}'::jsonb;
  v_data jsonb := '{}'::jsonb;
  v_sensor_count integer := 0;
  v_refuel_count integer := 0;
begin
  select payload_json
  into v_payload
  from public.raw_telemetry_inbound
  where id = p_raw_inbound_id;

  if v_payload is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'raw_inbound_not_found',
      'raw_inbound_id', p_raw_inbound_id
    );
  end if;

  v_data := coalesce(v_payload -> 'data', '{}'::jsonb);

  insert into public.raw_sensor_data (
    fuel_report_id,
    temperature_report_id,
    raw_inbound_id,
    vehicle_id,
    imei_number,
    client_name,
    registration_number,
    timestamp,
    fuel,
    altitude,
    odometer,
    speed,
    temperature,
    af,
    telemetry_id,
    rf,
    alt,
    hrs,
    ign,
    odo,
    rpm,
    date,
    spid,
    payload
  )
  select
    p_temperature_report_id,
    p_temperature_report_id,
    p_raw_inbound_id,
    p_vehicle_id,
    p_imei_number,
    p_client_name,
    p_registration_number,
    coalesce(public.try_timestamp(elem ->> 'date'), p_report_timestamp::timestamp),
    coalesce(public.try_numeric(elem ->> 'rf'), public.try_numeric(elem ->> 'af')),
    public.try_numeric(elem ->> 'alt'),
    public.try_numeric(elem ->> 'odo'),
    public.try_numeric(elem ->> 'spid'),
    public.try_numeric(elem ->> 'temp'),
    public.try_numeric(elem ->> 'af'),
    public.try_numeric(elem ->> 'id')::int,
    public.try_numeric(elem ->> 'rf'),
    public.try_numeric(elem ->> 'alt'),
    public.try_numeric(elem ->> 'hrs'),
    public.try_numeric(elem ->> 'ign')::int,
    public.try_numeric(elem ->> 'odo'),
    public.try_numeric(elem ->> 'rpm'),
    nullif(elem ->> 'date', ''),
    public.try_numeric(elem ->> 'spid'),
    elem
  from jsonb_array_elements(coalesce(v_data -> 'telemetry', '[]'::jsonb)) as src(elem);

  get diagnostics v_sensor_count = row_count;

  insert into public.refuel_events (
    fuel_report_id,
    temperature_report_id,
    raw_inbound_id,
    vehicle_id,
    imei_number,
    client_name,
    registration_number,
    event_type,
    event_time,
    refilled,
    initial_fuel,
    final_fuel,
    location,
    latitude,
    longitude,
    payload
  )
  select
    p_temperature_report_id,
    p_temperature_report_id,
    p_raw_inbound_id,
    p_vehicle_id,
    p_imei_number,
    p_client_name,
    p_registration_number,
    event_type,
    coalesce(public.try_timestamp(elem ->> 'timestamp'), p_report_timestamp::timestamp),
    signed_volume,
    public.try_numeric(elem ->> 'initial_fuel'),
    public.try_numeric(elem ->> 'final_fuel'),
    nullif(elem ->> 'location', ''),
    public.try_numeric(elem ->> 'lat'),
    public.try_numeric(elem ->> 'lon'),
    jsonb_build_object('event_type', event_type) || elem
  from (
    select 'refill'::text as event_type,
           elem,
           abs(coalesce(public.try_numeric(elem ->> 'refill'), public.try_numeric(elem ->> 'refilled'))) as signed_volume
    from jsonb_array_elements(coalesce(v_data #> '{refill_details,refills}', '[]'::jsonb)) as refill(elem)
    union all
    select 'drain'::text as event_type,
           elem,
           -abs(coalesce(public.try_numeric(elem ->> 'drain'), public.try_numeric(elem ->> 'drained'))) as signed_volume
    from jsonb_array_elements(coalesce(v_data #> '{drain_details,drains}', '[]'::jsonb)) as drain(elem)
  ) t
  where signed_volume is not null;

  get diagnostics v_refuel_count = row_count;

  return jsonb_build_object(
    'status', 'ok',
    'raw_inbound_id', p_raw_inbound_id,
    'sensor_rows', v_sensor_count,
    'refuel_rows', v_refuel_count
  );
end;
$$;

-- <<< END 20260222235000_report50_sql_bulk_ingest.sql



-- >>> BEGIN 20260223001500_report50_summary_daily_metrics.sql

-- Persist report_type=50 summary metrics into daily_metrics with traceability fields.

do $$
begin
  if to_regclass('public.daily_metrics') is null then
    return;
  end if;

  alter table public.daily_metrics
    add column if not exists raw_inbound_id uuid,
    add column if not exists imei_number text,
    add column if not exists client_name text,
    add column if not exists registration_number text,
    add column if not exists report_type text;

  begin
    alter table public.daily_metrics
      add constraint daily_metrics_raw_inbound_id_fkey
      foreign key (raw_inbound_id) references public.raw_telemetry_inbound(id) on delete set null;
  exception
    when duplicate_object then null;
  end;

  begin
    alter table public.daily_metrics
      add constraint daily_metrics_raw_inbound_id_key unique (raw_inbound_id);
  exception
    when duplicate_object then null;
  end;
end $$;

create index if not exists idx_daily_metrics_imei_number
  on public.daily_metrics(imei_number);

create index if not exists idx_daily_metrics_registration_number
  on public.daily_metrics(registration_number);

create index if not exists idx_daily_metrics_raw_inbound_id
  on public.daily_metrics(raw_inbound_id);

-- Backfill identity fields from fuel_temperature_reports where possible.
do $$
begin
  if to_regclass('public.daily_metrics') is null or to_regclass('public.fuel_temperature_reports') is null then
    return;
  end if;

  update public.daily_metrics dm
  set
    imei_number = coalesce(dm.imei_number, ftr.imei_number),
    client_name = coalesce(dm.client_name, ftr.client_name),
    registration_number = coalesce(dm.registration_number, ftr.registration_number),
    report_type = coalesce(dm.report_type, '50')
  from public.fuel_temperature_reports ftr
  where dm.raw_inbound_id is not null
    and ftr.raw_inbound_id = dm.raw_inbound_id;
end $$;

-- <<< END 20260223001500_report50_summary_daily_metrics.sql



-- >>> BEGIN 20260223013000_registration_number_30_chars.sql

-- Standardize registration number capacity to 30 characters.
-- Applies to report-related tables that expose/store registration_number.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_movement_reports'
      and column_name = 'registration_number'
  ) then
    alter table public.daily_movement_reports
      alter column registration_number type varchar(30)
      using case when registration_number is null then null else left(registration_number::text, 30) end;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fuel_temperature_reports'
      and column_name = 'registration_number'
  ) then
    alter table public.fuel_temperature_reports
      alter column registration_number type varchar(30)
      using case when registration_number is null then null else left(registration_number::text, 30) end;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'refuel_events'
      and column_name = 'registration_number'
  ) then
    alter table public.refuel_events
      alter column registration_number type varchar(30)
      using case when registration_number is null then null else left(registration_number::text, 30) end;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'raw_sensor_data'
      and column_name = 'registration_number'
  ) then
    alter table public.raw_sensor_data
      alter column registration_number type varchar(30)
      using case when registration_number is null then null else left(registration_number::text, 30) end;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_metrics'
      and column_name = 'registration_number'
  ) then
    alter table public.daily_metrics
      alter column registration_number type varchar(30)
      using case when registration_number is null then null else left(registration_number::text, 30) end;
  end if;
end $$;

-- <<< END 20260223013000_registration_number_30_chars.sql



-- >>> BEGIN 20260223020000_vehicle_summary_freshness_columns.sql

-- Track freshness for report_type=147 vehicle summary updates.

do $$
begin
  if to_regclass('public.vehicles') is null then
    return;
  end if;

  alter table public.vehicles
    add column if not exists last_summary_generated_at timestamptz,
    add column if not exists source_summary_report_id bigint,
    add column if not exists source_summary_payload jsonb;
end $$;

create index if not exists idx_vehicles_last_summary_generated_at
  on public.vehicles(last_summary_generated_at desc);

-- <<< END 20260223020000_vehicle_summary_freshness_columns.sql



-- >>> BEGIN 20260223193000_trip137_and_worker_hardening.sql

-- Support report_type=137 as multi-row trip ingestion and add worker observability hardening.

create extension if not exists pgcrypto;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'daily_movement_reports'
  ) then
    alter table public.daily_movement_reports
      add column if not exists source_trip_key text;

    alter table public.daily_movement_reports
      drop constraint if exists daily_movement_reports_raw_inbound_id_key;
  end if;
end $$;

create index if not exists idx_daily_movement_reports_raw_inbound
  on public.daily_movement_reports(raw_inbound_id);

create index if not exists idx_daily_movement_reports_source_trip_key
  on public.daily_movement_reports(source_trip_key);

create index if not exists idx_daily_movement_reports_source_imei
  on public.daily_movement_reports(source_imei);

create unique index if not exists uq_daily_movement_reports_raw_inbound_single
  on public.daily_movement_reports(raw_inbound_id)
  where raw_inbound_id is not null and source_trip_key is null;

create unique index if not exists uq_daily_movement_reports_raw_inbound_trip
  on public.daily_movement_reports(raw_inbound_id, source_trip_key)
  where raw_inbound_id is not null and source_trip_key is not null;

-- Activate a mapping revision for Teletrac report_type=137 using trip key idempotency.
update public.ingestion_mappings
set is_active = false,
    updated_at = now()
where source = 'teletrac'
  and report_type = '137'
  and is_active = true;

insert into public.ingestion_mappings (
  source,
  report_type,
  target_table,
  upsert_target,
  mapping_config,
  version,
  is_active,
  notes
)
values (
  'teletrac',
  '137',
  'daily_movement_reports',
  'raw_inbound_id,source_trip_key',
  '{
    "fields": {
      "asset": "registration_number",
      "start_time": "departure_time",
      "end_time": "arrival_time",
      "kilometers": "distance_km",
      "fuelUsed": "fuel_used_litres",
      "start_Location": "departed_from",
      "endLocation": "arrived_at",
      "max_Speed": "max_speed_kmh",
      "duration": "driving_time",
      "report_name": "report_name"
    },
    "defaults": {
      "company_name": "Teletrac Ingestion"
    }
  }'::jsonb,
  2,
  true,
  'v2 mapping: multi-row trip rows for report type 137 keyed by raw_inbound_id + source_trip_key'
)
on conflict (source, report_type, version) do update
set
  target_table = excluded.target_table,
  upsert_target = excluded.upsert_target,
  mapping_config = excluded.mapping_config,
  is_active = true,
  notes = excluded.notes,
  updated_at = now();

create table if not exists public.ingestion_processing_runs (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  claimed_count integer not null default 0,
  processed_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.ingestion_processing_failures (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.ingestion_processing_runs(id) on delete set null,
  raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null,
  source text,
  report_type text,
  attempt_count integer,
  error_message text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ingestion_processing_runs_started
  on public.ingestion_processing_runs(started_at desc);

create index if not exists idx_ingestion_processing_runs_status
  on public.ingestion_processing_runs(status);

create index if not exists idx_ingestion_processing_failures_raw_inbound
  on public.ingestion_processing_failures(raw_inbound_id);

create index if not exists idx_ingestion_processing_failures_created
  on public.ingestion_processing_failures(created_at desc);

alter table public.ingestion_processing_runs enable row level security;
alter table public.ingestion_processing_failures enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ingestion_processing_runs'
      and policyname = 'admin_select_ingestion_processing_runs'
  ) then
    create policy "admin_select_ingestion_processing_runs"
      on public.ingestion_processing_runs
      for select
      using (public.is_admin());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ingestion_processing_failures'
      and policyname = 'admin_select_ingestion_processing_failures'
  ) then
    create policy "admin_select_ingestion_processing_failures"
      on public.ingestion_processing_failures
      for select
      using (public.is_admin());
  end if;
end $$;

create or replace function public.purge_old_ingestion_worker_logs(p_keep_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep_days integer := greatest(coalesce(p_keep_days, 30), 1);
  v_deleted integer := 0;
  v_step integer := 0;
begin
  delete from public.ingestion_processing_failures
  where created_at < now() - make_interval(days => v_keep_days);
  get diagnostics v_step = row_count;
  v_deleted := v_deleted + v_step;

  delete from public.ingestion_processing_runs
  where created_at < now() - make_interval(days => v_keep_days)
    and status <> 'running';
  get diagnostics v_step = row_count;
  v_deleted := v_deleted + v_step;

  return v_deleted;
end;
$$;

do $$
declare
  r record;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  for r in select jobid from cron.job where jobname = 'purge-ingestion-worker-logs' loop
    perform cron.unschedule(r.jobid);
  end loop;

  perform cron.schedule(
    'purge-ingestion-worker-logs',
    '15 3 * * *',
    $cron$select public.purge_old_ingestion_worker_logs(30);$cron$
  );
end $$;

-- <<< END 20260223193000_trip137_and_worker_hardening.sql



-- >>> BEGIN 20260223201000_raw_sensor_data_drop_duplicate_columns.sql

-- Clean raw_sensor_data by removing duplicated generic sensor columns.
-- Keep telemetry-native columns (af/rf/alt/hrs/ign/odo/rpm/date/spid) and identity/FK columns.

alter table if exists public.raw_sensor_data
  drop column if exists timestamp,
  drop column if exists fuel,
  drop column if exists altitude,
  drop column if exists odometer,
  drop column if exists speed,
  drop column if exists temperature,
  drop column if exists sensor_name,
  drop column if exists sensor_value,
  drop column if exists sensor_unit,
  drop column if exists sensor_timestamp;

create index if not exists idx_raw_sensor_data_date
  on public.raw_sensor_data(date);

create or replace function public.process_report50_details(
  p_raw_inbound_id uuid,
  p_temperature_report_id uuid,
  p_vehicle_id uuid,
  p_imei_number text,
  p_client_name text,
  p_registration_number text,
  p_report_timestamp timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := '{}'::jsonb;
  v_data jsonb := '{}'::jsonb;
  v_sensor_count integer := 0;
  v_refuel_count integer := 0;
begin
  select payload_json
  into v_payload
  from public.raw_telemetry_inbound
  where id = p_raw_inbound_id;

  if v_payload is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'raw_inbound_not_found',
      'raw_inbound_id', p_raw_inbound_id
    );
  end if;

  v_data := coalesce(v_payload -> 'data', '{}'::jsonb);

  insert into public.raw_sensor_data (
    fuel_report_id,
    temperature_report_id,
    raw_inbound_id,
    vehicle_id,
    imei_number,
    client_name,
    registration_number,
    af,
    telemetry_id,
    rf,
    alt,
    hrs,
    ign,
    odo,
    rpm,
    date,
    spid,
    payload
  )
  select
    p_temperature_report_id,
    p_temperature_report_id,
    p_raw_inbound_id,
    p_vehicle_id,
    p_imei_number,
    p_client_name,
    p_registration_number,
    public.try_numeric(elem ->> 'af'),
    public.try_numeric(elem ->> 'id')::int,
    coalesce(public.try_numeric(elem ->> 'rf'), public.try_numeric(elem ->> 'af')),
    public.try_numeric(elem ->> 'alt'),
    public.try_numeric(elem ->> 'hrs'),
    public.try_numeric(elem ->> 'ign')::int,
    public.try_numeric(elem ->> 'odo'),
    public.try_numeric(elem ->> 'rpm'),
    coalesce(
      nullif(elem ->> 'date', ''),
      to_char(p_report_timestamp at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS')
    ),
    public.try_numeric(elem ->> 'spid'),
    elem
  from jsonb_array_elements(coalesce(v_data -> 'telemetry', '[]'::jsonb)) as src(elem);

  get diagnostics v_sensor_count = row_count;

  insert into public.refuel_events (
    fuel_report_id,
    temperature_report_id,
    raw_inbound_id,
    vehicle_id,
    imei_number,
    client_name,
    registration_number,
    event_type,
    event_time,
    refilled,
    initial_fuel,
    final_fuel,
    location,
    latitude,
    longitude,
    payload
  )
  select
    p_temperature_report_id,
    p_temperature_report_id,
    p_raw_inbound_id,
    p_vehicle_id,
    p_imei_number,
    p_client_name,
    p_registration_number,
    event_type,
    coalesce(public.try_timestamp(elem ->> 'timestamp'), p_report_timestamp::timestamp),
    signed_volume,
    public.try_numeric(elem ->> 'initial_fuel'),
    public.try_numeric(elem ->> 'final_fuel'),
    nullif(elem ->> 'location', ''),
    public.try_numeric(elem ->> 'lat'),
    public.try_numeric(elem ->> 'lon'),
    jsonb_build_object('event_type', event_type) || elem
  from (
    select 'refill'::text as event_type,
           elem,
           abs(coalesce(public.try_numeric(elem ->> 'refill'), public.try_numeric(elem ->> 'refilled'))) as signed_volume
    from jsonb_array_elements(coalesce(v_data #> '{refill_details,refills}', '[]'::jsonb)) as refill(elem)
    union all
    select 'drain'::text as event_type,
           elem,
           -abs(coalesce(public.try_numeric(elem ->> 'drain'), public.try_numeric(elem ->> 'drained'))) as signed_volume
    from jsonb_array_elements(coalesce(v_data #> '{drain_details,drains}', '[]'::jsonb)) as drain(elem)
  ) t
  where signed_volume is not null;

  get diagnostics v_refuel_count = row_count;

  return jsonb_build_object(
    'status', 'ok',
    'raw_inbound_id', p_raw_inbound_id,
    'sensor_rows', v_sensor_count,
    'refuel_rows', v_refuel_count
  );
end;
$$;

-- <<< END 20260223201000_raw_sensor_data_drop_duplicate_columns.sql



-- >>> BEGIN 20260223212000_trip137_backfill_and_repair.sql

-- Repair and backfill report_type=137 trips into daily_movement_reports.
-- This rebuilds all trip rows from raw_telemetry_inbound payload_json.data arrays.

do $$
begin
  if to_regclass('public.daily_movement_reports') is null then
    return;
  end if;

  alter table public.daily_movement_reports
    add column if not exists source_trip_key text;

  alter table public.daily_movement_reports
    drop constraint if exists daily_movement_reports_raw_inbound_id_key;
end $$;

create index if not exists idx_daily_movement_reports_raw_inbound
  on public.daily_movement_reports(raw_inbound_id);

create index if not exists idx_daily_movement_reports_source_trip_key
  on public.daily_movement_reports(source_trip_key);

create unique index if not exists uq_daily_movement_reports_raw_inbound_single
  on public.daily_movement_reports(raw_inbound_id)
  where raw_inbound_id is not null and source_trip_key is null;

drop index if exists public.uq_daily_movement_reports_raw_inbound_trip;
create unique index if not exists uq_daily_movement_reports_raw_inbound_trip
  on public.daily_movement_reports(raw_inbound_id, source_trip_key);

do $$
declare
  v_raw_rows integer := 0;
  v_upserted_rows integer := 0;
begin
  if to_regclass('public.raw_telemetry_inbound') is null
     or to_regclass('public.daily_movement_reports') is null
  then
    return;
  end if;

  select count(*)
  into v_raw_rows
  from public.raw_telemetry_inbound r
  where r.report_type = '137'
    and jsonb_typeof(r.payload_json -> 'data') = 'array';

  delete from public.daily_movement_reports dmr
  using public.raw_telemetry_inbound r
  where dmr.raw_inbound_id = r.id
    and r.report_type = '137';

  with src as (
    select
      r.id as raw_inbound_id,
      r.payload_json as payload,
      coalesce(r.payload_json ->> 'report_name', r.report_name) as report_name,
      r.source_imei as row_source_imei,
      elem as item
    from public.raw_telemetry_inbound r
    cross join lateral jsonb_array_elements(coalesce(r.payload_json -> 'data', '[]'::jsonb)) as item(elem)
    where r.report_type = '137'
  ),
  shaped as (
    select
      s.raw_inbound_id,
      s.report_name,
      coalesce(
        public.normalize_imei(s.item ->> 'imei'),
        public.normalize_imei(s.payload ->> 'imei'),
        public.normalize_imei(s.row_source_imei)
      ) as source_imei,
      coalesce(
        nullif(s.item ->> 'client_name', ''),
        nullif(s.item ->> 'client', ''),
        nullif(s.payload ->> 'client_name', ''),
        nullif(s.payload ->> 'client', '')
      ) as source_client_name,
      coalesce(
        nullif(s.item ->> 'asset', ''),
        nullif(s.item ->> 'registration_number', '')
      ) as source_assigned_asset,
      coalesce(
        public.try_timestamp(nullif(s.item ->> 'date', '')),
        public.try_timestamp(nullif(s.item ->> 'start_time', '')),
        public.try_timestamp(nullif(s.payload ->> 'generated_date', '')),
        now()::timestamp
      ) as report_date,
      public.try_timestamp(nullif(s.payload ->> 'start_date', '')) as from_date,
      public.try_timestamp(nullif(s.payload ->> 'end_date', '')) as to_date,
      coalesce(
        nullif(s.item ->> 'asset', ''),
        nullif(s.item ->> 'registration_number', '')
      ) as registration_number,
      nullif(s.item ->> 'asset', '') as asset_description,
      public.try_timestamp(nullif(s.item ->> 'start_time', '')) as departure_time,
      public.try_timestamp(nullif(s.item ->> 'end_time', '')) as arrival_time,
      coalesce(
        nullif(s.item ->> 'start_Location', ''),
        nullif(s.item ->> 'start_location', '')
      ) as departed_from,
      coalesce(
        nullif(s.item ->> 'endLocation', ''),
        nullif(s.item ->> 'end_location', '')
      ) as arrived_at,
      nullif(s.item ->> 'duration', '') as driving_time,
      public.try_numeric(s.item ->> 'kilometers') as distance_km,
      public.try_numeric(s.item ->> 'fuelUsed') as fuel_used_litres,
      public.try_numeric(s.item ->> 'max_Speed')::integer as max_speed_kmh,
      array_to_string(
        array[
          coalesce(
            public.normalize_imei(s.item ->> 'imei'),
            public.normalize_imei(s.payload ->> 'imei'),
            public.normalize_imei(s.row_source_imei),
            ''
          ),
          coalesce(nullif(s.item ->> 'asset', ''), ''),
          coalesce(nullif(s.item ->> 'start_time', ''), nullif(s.item ->> 'date', ''), ''),
          coalesce(nullif(s.item ->> 'end_time', ''), nullif(s.item ->> 'arrival_time', ''), nullif(s.item ->> 'date', ''), ''),
          coalesce(nullif(s.item ->> 'start_odometer', ''), ''),
          coalesce(nullif(s.item ->> 'end_odometer', ''), ''),
          coalesce(nullif(s.item ->> 'kilometers', ''), ''),
          coalesce(nullif(s.item ->> 'duration', ''), '')
        ],
        '|'
      ) as source_trip_key
    from src s
  )
  insert into public.daily_movement_reports (
    raw_inbound_id,
    applied_mapping_version,
    source_trip_key,
    report_name,
    source_imei,
    source_client_name,
    source_assigned_asset,
    report_date,
    from_date,
    to_date,
    registration_number,
    asset_description,
    departure_time,
    arrival_time,
    departed_from,
    arrived_at,
    driving_time,
    distance_km,
    fuel_used_litres,
    max_speed_kmh,
    company_name,
    vehicle_id
  )
  select
    sh.raw_inbound_id,
    2 as applied_mapping_version,
    sh.source_trip_key,
    sh.report_name,
    sh.source_imei,
    sh.source_client_name,
    sh.source_assigned_asset,
    sh.report_date,
    sh.from_date,
    sh.to_date,
    left(sh.registration_number, 30),
    sh.asset_description,
    sh.departure_time,
    sh.arrival_time,
    sh.departed_from,
    sh.arrived_at,
    sh.driving_time,
    sh.distance_km,
    sh.fuel_used_litres,
    sh.max_speed_kmh,
    coalesce(sh.source_client_name, 'Teletrac Ingestion') as company_name,
    v.id as vehicle_id
  from shaped sh
  left join public.vehicles v
    on (sh.source_imei is not null and public.normalize_imei(v.imei) = sh.source_imei)
    or (sh.source_assigned_asset is not null and v.vehicle_plate = sh.source_assigned_asset)
  where sh.source_trip_key is not null
    and btrim(sh.source_trip_key) <> ''
  on conflict (raw_inbound_id, source_trip_key) do update
  set
    report_name = excluded.report_name,
    source_imei = excluded.source_imei,
    source_client_name = excluded.source_client_name,
    source_assigned_asset = excluded.source_assigned_asset,
    report_date = excluded.report_date,
    from_date = excluded.from_date,
    to_date = excluded.to_date,
    registration_number = excluded.registration_number,
    asset_description = excluded.asset_description,
    departure_time = excluded.departure_time,
    arrival_time = excluded.arrival_time,
    departed_from = excluded.departed_from,
    arrived_at = excluded.arrived_at,
    driving_time = excluded.driving_time,
    distance_km = excluded.distance_km,
    fuel_used_litres = excluded.fuel_used_litres,
    max_speed_kmh = excluded.max_speed_kmh,
    company_name = excluded.company_name,
    vehicle_id = coalesce(excluded.vehicle_id, public.daily_movement_reports.vehicle_id);

  get diagnostics v_upserted_rows = row_count;
  raise notice 'Trip 137 repair completed: raw rows=% | upserted trips=%', v_raw_rows, v_upserted_rows;
end $$;

-- <<< END 20260223212000_trip137_backfill_and_repair.sql



-- >>> BEGIN 20260223224000_drop_unused_daily_movement_columns.sql

-- Remove unused columns from daily_movement_reports to keep schema clean.

alter table if exists public.daily_movement_reports
  drop column if exists site_name,
  drop column if exists asset_id,
  drop column if exists standing_time,
  drop column if exists next_departure,
  drop column if exists standing_time_at_location;

-- <<< END 20260223224000_drop_unused_daily_movement_columns.sql



-- >>> BEGIN 20260223233000_reset_all_operational_data.sql

-- One-time operational data reset.
-- Keeps configuration/auth tables intact (e.g. ingestion_mappings, clients, profiles, client_users).

do $$
declare
  v_targets text[] := array[
    'raw_sensor_data',
    'refuel_events',
    'fuel_temperature_reports',
    'daily_movement_reports',
    'daily_metrics',
    'fuel_events',
    'telemetry_alerts',
    'fuel_report_asset_registry',
    'kpi_aggregates',
    'vehicles',
    'ingestion_processing_failures',
    'ingestion_processing_runs'
  ];
  v_existing text[];
begin
  select array_agg(format('public.%I', t))
  into v_existing
  from unnest(v_targets) as t
  where to_regclass(format('public.%I', t)) is not null;

  if coalesce(array_length(v_existing, 1), 0) = 0 then
    raise notice 'No target tables found for operational reset.';
    return;
  end if;

  execute 'truncate table ' || array_to_string(v_existing, ', ') || ' restart identity cascade';
  raise notice 'Operational reset complete. Truncated % tables.', array_length(v_existing, 1);
end $$;

-- <<< END 20260223233000_reset_all_operational_data.sql



-- >>> BEGIN 20260223235000_keep_only_client_profile_user_settings.sql

-- Keep only client/account setup data and clear telemetry/vehicle/report data.
-- Preserved data tables:
--   - clients
--   - profiles
--   - user_settings
--   - client_users
--   - ingestion_mappings (config)

do $$
declare
  v_targets text[] := array[
    'raw_sensor_data',
    'refuel_events',
    'fuel_temperature_reports',
    'daily_movement_reports',
    'daily_metrics',
    'fuel_events',
    'telemetry_alerts',
    'fuel_report_asset_registry',
    'kpi_aggregates',
    'vehicles',
    'ingestion_processing_failures',
    'ingestion_processing_runs'
  ];
  v_existing text[];
begin
  select array_agg(format('public.%I', t))
  into v_existing
  from unnest(v_targets) as t
  where to_regclass(format('public.%I', t)) is not null;

  if coalesce(array_length(v_existing, 1), 0) = 0 then
    raise notice 'No telemetry/report tables found to truncate.';
    return;
  end if;

  execute 'truncate table ' || array_to_string(v_existing, ', ') || ' restart identity cascade';
  raise notice 'Kept client/account tables only. Truncated % tables.', array_length(v_existing, 1);
end $$;

-- <<< END 20260223235000_keep_only_client_profile_user_settings.sql



-- >>> BEGIN 20260224001000_daily_metrics_per_day_per_imei.sql

-- Daily metrics: enforce one row per IMEI per day and enrich report_type=50 aggregates.

do $$
declare
  v_metric_date_type text;
begin
  if to_regclass('public.daily_metrics') is null then
    return;
  end if;

  alter table public.daily_metrics
    add column if not exists metric_day date,
    add column if not exists fuel_economy_km_l numeric(14, 6),
    add column if not exists total_refilled_l numeric(14, 3),
    add column if not exists total_drained_l numeric(14, 3),
    add column if not exists telemetry_points integer,
    add column if not exists telemetry_first_at timestamptz,
    add column if not exists telemetry_last_at timestamptz,
    add column if not exists fuel_level_open_l numeric(14, 3),
    add column if not exists fuel_level_close_l numeric(14, 3),
    add column if not exists fuel_level_min_l numeric(14, 3),
    add column if not exists fuel_level_max_l numeric(14, 3),
    add column if not exists fuel_level_avg_l numeric(14, 3),
    add column if not exists odometer_open_km numeric(14, 3),
    add column if not exists odometer_close_km numeric(14, 3),
    add column if not exists odometer_delta_km numeric(14, 3),
    add column if not exists hours_counter_open numeric(14, 3),
    add column if not exists hours_counter_close numeric(14, 3),
    add column if not exists hours_counter_delta numeric(14, 3),
    add column if not exists ignition_on_points integer,
    add column if not exists avg_speed_kmh numeric(14, 3),
    add column if not exists max_speed_kmh numeric(14, 3),
    add column if not exists avg_rpm numeric(14, 3),
    add column if not exists max_rpm numeric(14, 3),
    add column if not exists avg_altitude numeric(14, 3),
    add column if not exists max_altitude numeric(14, 3),
    add column if not exists generated_at timestamptz;

  -- Convert metric_date to date-only granularity for daily aggregates.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_metrics'
      and column_name = 'metric_date'
  ) then
    select data_type
    into v_metric_date_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_metrics'
      and column_name = 'metric_date';

    if v_metric_date_type in ('timestamp without time zone', 'timestamp with time zone') then
      alter table public.daily_metrics
        alter column metric_date type date
        using metric_date::date;
    end if;
  end if;

  update public.daily_metrics
  set metric_day = coalesce(metric_day, metric_date::date, created_at::date, now()::date)
  where metric_day is null;

  update public.daily_metrics
  set metric_date = coalesce(metric_date, metric_day, created_at::date, now()::date)
  where metric_date is null;

  alter table public.daily_metrics
    alter column metric_day set not null;
end $$;

-- De-duplicate historical rows before adding uniqueness rules.
with ranked as (
  select
    ctid,
    row_number() over (
      partition by metric_day, imei_number
      order by created_at desc nulls last, raw_inbound_id desc nulls last
    ) as rn
  from public.daily_metrics
  where metric_day is not null
    and imei_number is not null
    and btrim(imei_number) <> ''
)
delete from public.daily_metrics dm
using ranked r
where dm.ctid = r.ctid
  and r.rn > 1;

with ranked as (
  select
    ctid,
    row_number() over (
      partition by metric_day, vehicle_id
      order by created_at desc nulls last, raw_inbound_id desc nulls last
    ) as rn
  from public.daily_metrics
  where metric_day is not null
    and (imei_number is null or btrim(imei_number) = '')
    and vehicle_id is not null
)
delete from public.daily_metrics dm
using ranked r
where dm.ctid = r.ctid
  and r.rn > 1;

create index if not exists idx_daily_metrics_metric_day
  on public.daily_metrics(metric_day);

create unique index if not exists uq_daily_metrics_metric_day_imei
  on public.daily_metrics(metric_day, imei_number)
  where imei_number is not null and btrim(imei_number) <> '';

create unique index if not exists uq_daily_metrics_metric_day_vehicle
  on public.daily_metrics(metric_day, vehicle_id)
  where (imei_number is null or btrim(imei_number) = '') and vehicle_id is not null;

-- <<< END 20260224001000_daily_metrics_per_day_per_imei.sql



-- >>> BEGIN 20260224014000_daily_metrics_refill_drain_counts.sql

-- Add explicit refill/drain counts for daily_metrics and backfill from existing columns.

do $$
begin
  if to_regclass('public.daily_metrics') is null then
    return;
  end if;

  alter table public.daily_metrics
    add column if not exists refill_count integer,
    add column if not exists drain_count integer;

  update public.daily_metrics
  set
    refill_count = coalesce(refill_count, number_of_refills, 0),
    drain_count = coalesce(drain_count, number_of_thefts, 0)
  where refill_count is null
     or drain_count is null;
end $$;

create index if not exists idx_daily_metrics_refill_count
  on public.daily_metrics(refill_count);

create index if not exists idx_daily_metrics_drain_count
  on public.daily_metrics(drain_count);

-- <<< END 20260224014000_daily_metrics_refill_drain_counts.sql



-- >>> BEGIN 20260224021000_drop_unused_daily_metrics_columns.sql

-- Drop no-longer-needed telemetry rollup columns from daily_metrics.

do $$
begin
  if to_regclass('public.daily_metrics') is null then
    return;
  end if;

  alter table public.daily_metrics
    drop column if exists telemetry_points,
    drop column if exists telemetry_first_at,
    drop column if exists telemetry_last_at,
    drop column if exists fuel_level_min_l,
    drop column if exists fuel_level_max_l,
    drop column if exists fuel_level_avg_l,
    drop column if exists odometer_delta_km,
    drop column if exists hours_counter_open,
    drop column if exists hours_counter_close,
    drop column if exists hours_counter_delta,
    drop column if exists ignition_on_points,
    drop column if exists avg_speed_kmh,
    drop column if exists max_speed_kmh,
    drop column if exists avg_rpm,
    drop column if exists max_rpm,
    drop column if exists avg_altitude,
    drop column if exists max_altitude;
end $$;

-- <<< END 20260224021000_drop_unused_daily_metrics_columns.sql



-- >>> BEGIN 20260224032000_drop_redundant_legacy_and_duplicate_columns.sql

-- Remove legacy/duplicate columns that are no longer used by ingestion.
-- Keep canonical UUID/FK columns and report identity columns.

create or replace function public.process_report50_details(
  p_raw_inbound_id uuid,
  p_temperature_report_id uuid,
  p_vehicle_id uuid,
  p_imei_number text,
  p_client_name text,
  p_registration_number text,
  p_report_timestamp timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := '{}'::jsonb;
  v_data jsonb := '{}'::jsonb;
  v_sensor_count integer := 0;
  v_refuel_count integer := 0;
begin
  select payload_json
  into v_payload
  from public.raw_telemetry_inbound
  where id = p_raw_inbound_id;

  if v_payload is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'raw_inbound_not_found',
      'raw_inbound_id', p_raw_inbound_id
    );
  end if;

  v_data := coalesce(v_payload -> 'data', '{}'::jsonb);

  insert into public.raw_sensor_data (
    temperature_report_id,
    raw_inbound_id,
    vehicle_id,
    imei_number,
    client_name,
    registration_number,
    af,
    telemetry_id,
    rf,
    alt,
    hrs,
    ign,
    odo,
    rpm,
    date,
    spid,
    payload
  )
  select
    p_temperature_report_id,
    p_raw_inbound_id,
    p_vehicle_id,
    p_imei_number,
    p_client_name,
    p_registration_number,
    public.try_numeric(elem ->> 'af'),
    public.try_numeric(elem ->> 'id')::int,
    coalesce(public.try_numeric(elem ->> 'rf'), public.try_numeric(elem ->> 'af')),
    public.try_numeric(elem ->> 'alt'),
    public.try_numeric(elem ->> 'hrs'),
    public.try_numeric(elem ->> 'ign')::int,
    public.try_numeric(elem ->> 'odo'),
    public.try_numeric(elem ->> 'rpm'),
    coalesce(
      nullif(elem ->> 'date', ''),
      to_char(p_report_timestamp at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS')
    ),
    public.try_numeric(elem ->> 'spid'),
    elem
  from jsonb_array_elements(coalesce(v_data -> 'telemetry', '[]'::jsonb)) as src(elem);

  get diagnostics v_sensor_count = row_count;

  insert into public.refuel_events (
    temperature_report_id,
    raw_inbound_id,
    vehicle_id,
    imei_number,
    client_name,
    registration_number,
    event_type,
    event_time,
    refilled,
    initial_fuel,
    final_fuel,
    location,
    latitude,
    longitude,
    payload
  )
  select
    p_temperature_report_id,
    p_raw_inbound_id,
    p_vehicle_id,
    p_imei_number,
    p_client_name,
    p_registration_number,
    event_type,
    coalesce(public.try_timestamp(elem ->> 'timestamp'), p_report_timestamp::timestamp),
    signed_volume,
    public.try_numeric(elem ->> 'initial_fuel'),
    public.try_numeric(elem ->> 'final_fuel'),
    nullif(elem ->> 'location', ''),
    public.try_numeric(elem ->> 'lat'),
    public.try_numeric(elem ->> 'lon'),
    jsonb_build_object('event_type', event_type) || elem
  from (
    select
      'refill'::text as event_type,
      elem,
      abs(coalesce(public.try_numeric(elem ->> 'refill'), public.try_numeric(elem ->> 'refilled'))) as signed_volume
    from jsonb_array_elements(coalesce(v_data #> '{refill_details,refills}', '[]'::jsonb)) as refill(elem)
    union all
    select
      'drain'::text as event_type,
      elem,
      -abs(coalesce(public.try_numeric(elem ->> 'drain'), public.try_numeric(elem ->> 'drained'))) as signed_volume
    from jsonb_array_elements(coalesce(v_data #> '{drain_details,drains}', '[]'::jsonb)) as drain(elem)
  ) t
  where signed_volume is not null;

  get diagnostics v_refuel_count = row_count;

  return jsonb_build_object(
    'status', 'ok',
    'raw_inbound_id', p_raw_inbound_id,
    'sensor_rows', v_sensor_count,
    'refuel_rows', v_refuel_count
  );
end;
$$;

do $$
declare
  r record;
  v_roles text;
  v_cmd text;
  v_qual text;
  v_with_check text;
  v_sql text;
begin
  for r in
    select *
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%vehicle_id_legacy%'
        or coalesce(with_check, '') like '%vehicle_id_legacy%'
        or coalesce(qual, '') like '%fuel_report_id_legacy%'
        or coalesce(with_check, '') like '%fuel_report_id_legacy%'
        or coalesce(qual, '') like '%temperature_report_id_legacy%'
        or coalesce(with_check, '') like '%temperature_report_id_legacy%'
        or coalesce(qual, '') like '%number_of_refills%'
        or coalesce(with_check, '') like '%number_of_refills%'
        or coalesce(qual, '') like '%number_of_thefts%'
        or coalesce(with_check, '') like '%number_of_thefts%'
        or coalesce(qual, '') like '%metric_date%'
        or coalesce(with_check, '') like '%metric_date%'
      )
  loop
    select string_agg(quote_ident(x), ', ')
    into v_roles
    from unnest(r.roles) as t(x);
    v_roles := coalesce(v_roles, 'public');

    v_cmd := case when r.cmd = 'ALL' then '' else ' for ' || r.cmd end;

    v_qual := replace(coalesce(r.qual, ''), 'vehicle_id_legacy', 'vehicle_id');
    v_qual := replace(v_qual, 'fuel_report_id_legacy', 'temperature_report_id');
    v_qual := replace(v_qual, 'temperature_report_id_legacy', 'temperature_report_id');
    v_qual := replace(v_qual, 'number_of_refills', 'refill_count');
    v_qual := replace(v_qual, 'number_of_thefts', 'drain_count');
    v_qual := replace(v_qual, 'metric_date', 'metric_day');
    if btrim(v_qual) = '' then v_qual := null; end if;

    v_with_check := replace(coalesce(r.with_check, ''), 'vehicle_id_legacy', 'vehicle_id');
    v_with_check := replace(v_with_check, 'fuel_report_id_legacy', 'temperature_report_id');
    v_with_check := replace(v_with_check, 'temperature_report_id_legacy', 'temperature_report_id');
    v_with_check := replace(v_with_check, 'number_of_refills', 'refill_count');
    v_with_check := replace(v_with_check, 'number_of_thefts', 'drain_count');
    v_with_check := replace(v_with_check, 'metric_date', 'metric_day');
    if btrim(v_with_check) = '' then v_with_check := null; end if;

    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);

    v_sql := format(
      'create policy %I on %I.%I as %s%s to %s',
      r.policyname,
      r.schemaname,
      r.tablename,
      r.permissive,
      v_cmd,
      v_roles
    );

    if v_qual is not null then
      v_sql := v_sql || ' using (' || v_qual || ')';
    end if;

    if v_with_check is not null then
      v_sql := v_sql || ' with check (' || v_with_check || ')';
    end if;

    execute v_sql;
  end loop;
end $$;

alter table if exists public.raw_sensor_data
  drop column if exists fuel_report_id;

alter table if exists public.refuel_events
  drop column if exists fuel_report_id,
  drop column if exists fuel_report_id_legacy,
  drop column if exists temperature_report_id_legacy,
  drop column if exists vehicle_id_legacy;

alter table if exists public.daily_movement_reports
  drop column if exists vehicle_id_legacy;

alter table if exists public.daily_metrics
  drop column if exists vehicle_id_legacy,
  drop column if exists metric_date,
  drop column if exists number_of_refills,
  drop column if exists number_of_thefts;

alter table if exists public.telemetry_alerts
  drop column if exists vehicle_id_legacy;

alter table if exists public.fuel_temperature_reports
  drop column if exists vehicle_id_legacy;

-- <<< END 20260224032000_drop_redundant_legacy_and_duplicate_columns.sql



-- >>> BEGIN 20260224043000_report_name_client_name_backfill.sql

-- Populate client names from report_name patterns like:
--   "<report title>|<client>"
-- and keep this available on derived tables.

do $$
begin
  if to_regclass('public.telemetry_alerts') is not null then
    alter table public.telemetry_alerts
      add column if not exists source_client_name text;

    create index if not exists idx_telemetry_alerts_source_client_name
      on public.telemetry_alerts(source_client_name);
  end if;
end $$;

-- Backfill telemetry alerts client name from raw report_name.
update public.telemetry_alerts ta
set source_client_name = coalesce(
  nullif(btrim(ta.source_client_name), ''),
  nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), ''),
  nullif(btrim(r.payload_json ->> 'client_name'), ''),
  nullif(btrim(r.payload_json ->> 'client'), '')
)
from public.raw_telemetry_inbound r
where ta.raw_inbound_id = r.id
  and (ta.source_client_name is null or btrim(ta.source_client_name) = '');

-- Backfill daily movement client/company name from report_name.
update public.daily_movement_reports dmr
set source_client_name = coalesce(
      nullif(btrim(dmr.source_client_name), ''),
      nullif(btrim(split_part(coalesce(dmr.report_name, ''), '|', 2)), ''),
      nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), '')
    ),
    company_name = coalesce(
      nullif(btrim(dmr.company_name), ''),
      nullif(btrim(dmr.source_client_name), ''),
      nullif(btrim(split_part(coalesce(dmr.report_name, ''), '|', 2)), ''),
      nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), ''),
      dmr.company_name
    )
from public.raw_telemetry_inbound r
where dmr.raw_inbound_id = r.id
  and (
    dmr.source_client_name is null
    or btrim(dmr.source_client_name) = ''
    or dmr.company_name is null
    or btrim(dmr.company_name) = ''
    or dmr.company_name = 'Teletrac Ingestion'
  );

-- Backfill report50-derived client name where historical rows missed it.
update public.daily_metrics dm
set client_name = coalesce(
  nullif(btrim(dm.client_name), ''),
  nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), '')
)
from public.raw_telemetry_inbound r
where dm.raw_inbound_id = r.id
  and (dm.client_name is null or btrim(dm.client_name) = '');

update public.fuel_temperature_reports fr
set client_name = coalesce(
  nullif(btrim(fr.client_name), ''),
  nullif(btrim(split_part(coalesce(fr.report_name, ''), '|', 2)), ''),
  nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), '')
)
from public.raw_telemetry_inbound r
where fr.raw_inbound_id = r.id
  and (fr.client_name is null or btrim(fr.client_name) = '');

update public.fuel_report_asset_registry far
set client_name = coalesce(
  nullif(btrim(far.client_name), ''),
  nullif(btrim(split_part(coalesce(far.report_name, ''), '|', 2)), '')
)
where far.report_name like '%|%'
  and (far.client_name is null or btrim(far.client_name) = '');

-- <<< END 20260224043000_report_name_client_name_backfill.sql



-- >>> BEGIN 20260224045000_daily_movement_company_name_from_report_client.sql

-- Replace default company label with parsed client where available.

update public.daily_movement_reports dmr
set company_name = coalesce(
      nullif(btrim(dmr.source_client_name), ''),
      nullif(btrim(split_part(coalesce(dmr.report_name, ''), '|', 2)), ''),
      nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), ''),
      dmr.company_name
    )
from public.raw_telemetry_inbound r
where dmr.raw_inbound_id = r.id
  and (
    dmr.company_name is null
    or btrim(dmr.company_name) = ''
    or lower(btrim(dmr.company_name)) = 'teletrac ingestion'
  );

-- <<< END 20260224045000_daily_movement_company_name_from_report_client.sql



-- >>> BEGIN 20260224052000_normalize_client_name_and_drop_duplicates.sql

-- Normalize client naming across derived telemetry tables.
-- Canonical column name is client_name.

do $$
begin
  if to_regclass('public.daily_movement_reports') is not null then
    alter table public.daily_movement_reports
      add column if not exists client_name text;
  end if;

  if to_regclass('public.telemetry_alerts') is not null then
    alter table public.telemetry_alerts
      add column if not exists client_name text;
  end if;
end $$;

-- Backfill daily movement client_name from existing duplicate columns and report_name.
update public.daily_movement_reports dmr
set client_name = coalesce(
      nullif(btrim(dmr.client_name), ''),
      nullif(btrim(dmr.source_client_name), ''),
      nullif(btrim(dmr.company_name), ''),
      nullif(btrim(split_part(coalesce(dmr.report_name, ''), '|', 2)), ''),
      nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), '')
    )
from public.raw_telemetry_inbound r
where dmr.raw_inbound_id = r.id
  and (dmr.client_name is null or btrim(dmr.client_name) = '');

update public.daily_movement_reports dmr
set client_name = nullif(btrim(split_part(coalesce(dmr.report_name, ''), '|', 2)), '')
where (dmr.client_name is null or btrim(dmr.client_name) = '')
  and coalesce(dmr.report_name, '') like '%|%';

-- Backfill telemetry alerts client_name from existing duplicate columns and raw report_name.
update public.telemetry_alerts ta
set client_name = coalesce(
      nullif(btrim(ta.client_name), ''),
      nullif(btrim(ta.source_client_name), ''),
      nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), ''),
      nullif(btrim(r.payload_json ->> 'client_name'), ''),
      nullif(btrim(r.payload_json ->> 'client'), '')
    )
from public.raw_telemetry_inbound r
where ta.raw_inbound_id = r.id
  and (ta.client_name is null or btrim(ta.client_name) = '');

-- Keep mappings aligned with canonical target name.
update public.ingestion_mappings im
set mapping_config = (
  with rewritten_fields as (
    select
      jsonb_set(
        im.mapping_config,
        '{fields}',
        (
          select coalesce(
            jsonb_object_agg(k, to_jsonb(case when v = 'company_name' then 'client_name' else v end)),
            '{}'::jsonb
          )
          from jsonb_each_text(coalesce(im.mapping_config -> 'fields', '{}'::jsonb)) as e(k, v)
        ),
        true
      ) as cfg
  ),
  normalized_defaults as (
    select
      jsonb_set(
        cfg #- '{defaults,company_name}',
        '{defaults,client_name}',
        coalesce(cfg #> '{defaults,client_name}', cfg #> '{defaults,company_name}', to_jsonb('Teletrac Ingestion'::text)),
        true
      ) as final_cfg
    from rewritten_fields
  )
  select final_cfg from normalized_defaults
)
where im.target_table = 'daily_movement_reports';

-- Rewrite policies that still reference duplicate column names.
do $$
declare
  r record;
  v_roles text;
  v_cmd text;
  v_qual text;
  v_with_check text;
  v_sql text;
begin
  for r in
    select *
    from pg_policies
    where schemaname = 'public'
      and tablename in ('daily_movement_reports', 'telemetry_alerts')
      and (
        coalesce(qual, '') like '%source_client_name%'
        or coalesce(with_check, '') like '%source_client_name%'
        or coalesce(qual, '') like '%company_name%'
        or coalesce(with_check, '') like '%company_name%'
      )
  loop
    select string_agg(quote_ident(x), ', ')
    into v_roles
    from unnest(r.roles) as t(x);
    v_roles := coalesce(v_roles, 'public');

    v_cmd := case when r.cmd = 'ALL' then '' else ' for ' || r.cmd end;

    v_qual := replace(coalesce(r.qual, ''), 'source_client_name', 'client_name');
    v_qual := replace(v_qual, 'company_name', 'client_name');
    if btrim(v_qual) = '' then v_qual := null; end if;

    v_with_check := replace(coalesce(r.with_check, ''), 'source_client_name', 'client_name');
    v_with_check := replace(v_with_check, 'company_name', 'client_name');
    if btrim(v_with_check) = '' then v_with_check := null; end if;

    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);

    v_sql := format(
      'create policy %I on %I.%I as %s%s to %s',
      r.policyname,
      r.schemaname,
      r.tablename,
      r.permissive,
      v_cmd,
      v_roles
    );

    if v_qual is not null then
      v_sql := v_sql || ' using (' || v_qual || ')';
    end if;

    if v_with_check is not null then
      v_sql := v_sql || ' with check (' || v_with_check || ')';
    end if;

    execute v_sql;
  end loop;
end $$;

drop index if exists public.idx_telemetry_alerts_source_client_name;

alter table if exists public.daily_movement_reports
  drop column if exists source_client_name,
  drop column if exists company_name;

alter table if exists public.telemetry_alerts
  drop column if exists source_client_name;

create index if not exists idx_daily_movement_reports_client_name
  on public.daily_movement_reports(client_name);

create index if not exists idx_telemetry_alerts_client_name
  on public.telemetry_alerts(client_name);

-- <<< END 20260224052000_normalize_client_name_and_drop_duplicates.sql



-- >>> BEGIN 20260224060000_report0_vehicle_live_state_and_cleanup.sql

-- Handle high-frequency report_type=0 updates by maintaining a latest-state snapshot per vehicle.
-- Also remove non-essential legacy columns from vehicles.

do $$
begin
  if to_regclass('public.vehicles') is null then
    return;
  end if;

  alter table public.vehicles
    add column if not exists client_name text,
    add column if not exists source_last_raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null,
    add column if not exists last_gps_at timestamptz,
    add column if not exists last_engine_hours numeric(14, 3),
    add column if not exists last_ignition_on boolean,
    add column if not exists last_speed_kmh numeric(10, 3),
    add column if not exists last_driver_id text,
    add column if not exists last_latitude numeric(11, 6),
    add column if not exists last_longitude numeric(11, 6),
    add column if not exists last_odometer_km numeric(14, 3),
    add column if not exists last_road_name text,
    add column if not exists last_event_name text,
    add column if not exists last_event_id text;
end $$;

create index if not exists idx_vehicles_imei on public.vehicles(imei);
create index if not exists idx_vehicles_last_gps_at on public.vehicles(last_gps_at desc);

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

alter table if exists public.vehicles
  drop column if exists driver_name,
  drop column if exists efficiency_rating,
  drop column if exists working_days,
  drop column if exists parking_days,
  drop column if exists last_maintenance_date,
  drop column if exists maintenance_status,
  drop column if exists theft_incidents,
  drop column if exists cost_per_km,
  drop column if exists system_reliability;

-- <<< END 20260224060000_report0_vehicle_live_state_and_cleanup.sql



-- >>> BEGIN 20260224100000_report137_identity_registry_alignment.sql

-- report_type 137 payloads carry many assets per row.
-- Keep raw_telemetry_inbound.source_imei null for this report type.

update public.raw_telemetry_inbound
set source_imei = null
where report_type = '137'
  and source_imei is not null;

-- <<< END 20260224100000_report137_identity_registry_alignment.sql



-- >>> BEGIN 20260224103000_drop_fuel_report_asset_registry.sql

-- Remove legacy asset registry table.
-- Vehicles table is now the single source of truth for identity resolution.

do $$
begin
  if to_regclass('public.fuel_report_asset_registry') is not null then
    execute 'drop policy if exists "admin_select_fuel_report_asset_registry" on public.fuel_report_asset_registry';
  end if;
end $$;

drop index if exists public.idx_fuel_report_asset_registry_last_seen;
drop index if exists public.idx_fuel_report_asset_registry_assigned_asset;
drop index if exists public.idx_fuel_report_asset_registry_imei_number;
drop index if exists public.idx_fuel_report_asset_registry_imei_last_seen;
drop index if exists public.idx_fuel_report_asset_registry_asset_last_seen;

drop table if exists public.fuel_report_asset_registry cascade;

-- <<< END 20260224103000_drop_fuel_report_asset_registry.sql



-- >>> BEGIN 20260225003000_rename_refuel_events_to_fuel_events.sql

-- Rename telemetry event table from refuel_events -> fuel_events.
-- Keeps all existing data/constraints; only renames relation and adds canonical indexes.

do $$
begin
  if to_regclass('public.fuel_events') is null
     and to_regclass('public.refuel_events') is not null then
    alter table public.refuel_events rename to fuel_events;
  end if;
end
$$;

create index if not exists idx_fuel_events_temperature_report_id
  on public.fuel_events (temperature_report_id);

create index if not exists idx_fuel_events_vehicle_id
  on public.fuel_events (vehicle_id);

create index if not exists idx_fuel_events_imei_number
  on public.fuel_events (imei_number);

create index if not exists idx_fuel_events_registration_number
  on public.fuel_events (registration_number);

create index if not exists idx_fuel_events_event_type
  on public.fuel_events (event_type);

-- Keep report50 bulk RPC aligned with new table name.
create or replace function public.process_report50_details(
  p_raw_inbound_id uuid,
  p_temperature_report_id uuid,
  p_vehicle_id uuid,
  p_imei_number text,
  p_client_name text,
  p_registration_number text,
  p_report_timestamp timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := '{}'::jsonb;
  v_data jsonb := '{}'::jsonb;
  v_sensor_count integer := 0;
  v_refuel_count integer := 0;
begin
  select payload_json
  into v_payload
  from public.raw_telemetry_inbound
  where id = p_raw_inbound_id;

  if v_payload is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'raw_inbound_not_found',
      'raw_inbound_id', p_raw_inbound_id
    );
  end if;

  v_data := coalesce(v_payload -> 'data', '{}'::jsonb);

  insert into public.raw_sensor_data (
    temperature_report_id,
    raw_inbound_id,
    vehicle_id,
    imei_number,
    client_name,
    registration_number,
    af,
    telemetry_id,
    rf,
    alt,
    hrs,
    ign,
    odo,
    rpm,
    date,
    spid,
    payload
  )
  select
    p_temperature_report_id,
    p_raw_inbound_id,
    p_vehicle_id,
    p_imei_number,
    p_client_name,
    p_registration_number,
    public.try_numeric(elem ->> 'af'),
    public.try_numeric(elem ->> 'id')::int,
    coalesce(public.try_numeric(elem ->> 'rf'), public.try_numeric(elem ->> 'af')),
    public.try_numeric(elem ->> 'alt'),
    public.try_numeric(elem ->> 'hrs'),
    public.try_numeric(elem ->> 'ign')::int,
    public.try_numeric(elem ->> 'odo'),
    public.try_numeric(elem ->> 'rpm'),
    coalesce(
      nullif(elem ->> 'date', ''),
      to_char(p_report_timestamp at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS')
    ),
    public.try_numeric(elem ->> 'spid'),
    elem
  from jsonb_array_elements(coalesce(v_data -> 'telemetry', '[]'::jsonb)) as src(elem);

  get diagnostics v_sensor_count = row_count;

  insert into public.fuel_events (
    temperature_report_id,
    raw_inbound_id,
    vehicle_id,
    imei_number,
    client_name,
    registration_number,
    event_type,
    event_time,
    refilled,
    initial_fuel,
    final_fuel,
    location,
    latitude,
    longitude,
    payload
  )
  select
    p_temperature_report_id,
    p_raw_inbound_id,
    p_vehicle_id,
    p_imei_number,
    p_client_name,
    p_registration_number,
    event_type,
    coalesce(public.try_timestamp(elem ->> 'timestamp'), p_report_timestamp::timestamp),
    signed_volume,
    public.try_numeric(elem ->> 'initial_fuel'),
    public.try_numeric(elem ->> 'final_fuel'),
    nullif(elem ->> 'location', ''),
    public.try_numeric(elem ->> 'lat'),
    public.try_numeric(elem ->> 'lon'),
    jsonb_build_object('event_type', event_type) || elem
  from (
    select
      'refill'::text as event_type,
      elem,
      abs(coalesce(public.try_numeric(elem ->> 'refill'), public.try_numeric(elem ->> 'refilled'))) as signed_volume
    from jsonb_array_elements(coalesce(v_data #> '{refill_details,refills}', '[]'::jsonb)) as refill(elem)
    union all
    select
      'drain'::text as event_type,
      elem,
      -abs(coalesce(public.try_numeric(elem ->> 'drain'), public.try_numeric(elem ->> 'drained'))) as signed_volume
    from jsonb_array_elements(coalesce(v_data #> '{drain_details,drains}', '[]'::jsonb)) as drain(elem)
  ) t
  where signed_volume is not null;

  get diagnostics v_refuel_count = row_count;

  return jsonb_build_object(
    'status', 'ok',
    'raw_inbound_id', p_raw_inbound_id,
    'sensor_rows', v_sensor_count,
    'refuel_rows', v_refuel_count
  );
end;
$$;

-- <<< END 20260225003000_rename_refuel_events_to_fuel_events.sql

