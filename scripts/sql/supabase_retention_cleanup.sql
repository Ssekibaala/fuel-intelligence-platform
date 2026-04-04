-- Supabase retention cleanup playbook
-- Use this after archiving old public telemetry rows out of Postgres.
--
-- Recommended order:
-- 1. Run the archive script first for public.raw_telemetry_inbound and public.raw_sensor_data
-- 2. Execute the preview queries below
-- 3. Run the matching DELETE statements
-- 4. Vacuum the affected tables

-- ============================================================================
-- 1. Preview current largest tables
-- ============================================================================
select
  n.nspname as schemaname,
  c.relname as table_name,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
  pg_total_relation_size(c.oid) as total_size_bytes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc
limit 25;

-- ============================================================================
-- 2. Preview rows eligible for cleanup in public tables
-- Adjust the intervals before deleting.
-- ============================================================================
select count(*) as raw_telemetry_inbound_rows_to_delete
from public.raw_telemetry_inbound
where status = 'processed'
  and processed_at < now() - interval '7 days';

select count(*) as raw_sensor_data_rows_to_delete
from public.raw_sensor_data
where created_at < now() - interval '7 days';

select count(*) as ingestion_processing_runs_rows_to_delete
from public.ingestion_processing_runs
where created_at < now() - interval '7 days';

select count(*) as ingestion_processing_failures_rows_to_delete
from public.ingestion_processing_failures
where created_at < now() - interval '7 days';

-- ============================================================================
-- 3. Preview likely cleanup candidates in Supabase-managed/system tables
-- Run the column inspection queries first if you are unsure of timestamp names.
-- ============================================================================
select column_name
from information_schema.columns
where table_schema = 'net'
  and table_name = '_http_response'
order by ordinal_position;

select column_name
from information_schema.columns
where table_schema = 'cron'
  and table_name = 'job_run_details'
order by ordinal_position;

-- If these tables have the expected timestamp columns in your project:
select count(*) as http_response_rows_to_delete
from net._http_response
where created < now() - interval '7 days';

select count(*) as cron_job_run_details_rows_to_delete
from cron.job_run_details
where start_time < now() - interval '30 days';

-- ============================================================================
-- 4. Delete old public telemetry/staging data
-- Execute only after backup/archive is confirmed.
-- ============================================================================
delete from public.raw_telemetry_inbound
where status = 'processed'
  and processed_at < now() - interval '7 days';

delete from public.raw_sensor_data
where created_at < now() - interval '7 days';

delete from public.ingestion_processing_runs
where created_at < now() - interval '7 days';

delete from public.ingestion_processing_failures
where created_at < now() - interval '7 days';

-- ============================================================================
-- 5. Delete old managed/system log tables
-- Keep retention short here because they are operational logs, not source data.
-- ============================================================================
delete from net._http_response
where created < now() - interval '7 days';

delete from cron.job_run_details
where start_time < now() - interval '30 days';

-- ============================================================================
-- 6. Verify remaining row counts
-- ============================================================================
select status, count(*)
from public.raw_telemetry_inbound
group by status
order by status;

select count(*) as raw_sensor_data_remaining
from public.raw_sensor_data;

-- ============================================================================
-- 7. Reclaim space statistics
-- Note: DELETE frees rows for reuse, but space reclamation may lag.
-- VACUUM is safe. VACUUM FULL is heavier and takes stronger locks.
-- ============================================================================
vacuum analyze public.raw_telemetry_inbound;
vacuum analyze public.raw_sensor_data;
vacuum analyze public.ingestion_processing_runs;
vacuum analyze public.ingestion_processing_failures;

vacuum analyze net._http_response;
vacuum analyze cron.job_run_details;
