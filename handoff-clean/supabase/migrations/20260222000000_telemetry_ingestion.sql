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
