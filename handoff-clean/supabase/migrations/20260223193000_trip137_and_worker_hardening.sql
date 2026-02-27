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
