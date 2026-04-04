-- Supabase retention cleanup: DELETE phase
-- Run this file first in Supabase SQL Editor.

-- ============================================================================
-- Preview largest tables
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
-- Preview counts for 7-day retention
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

-- Inspect managed/system table columns before deleting from them
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

-- If your columns match these names, these preview counts are safe:
select count(*) as http_response_rows_to_delete
from net._http_response
where created < now() - interval '7 days';

select count(*) as cron_job_run_details_rows_to_delete
from cron.job_run_details
where start_time < now() - interval '30 days';

-- ============================================================================
-- DELETE public tables
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
-- DELETE managed/system log tables
-- ============================================================================
delete from net._http_response
where created < now() - interval '7 days';

delete from cron.job_run_details
where start_time < now() - interval '30 days';

-- ============================================================================
-- Verify remaining counts
-- ============================================================================
select status, count(*)
from public.raw_telemetry_inbound
group by status
order by status;

select count(*) as raw_sensor_data_remaining
from public.raw_sensor_data;

select count(*) as ingestion_processing_runs_remaining
from public.ingestion_processing_runs;

select count(*) as ingestion_processing_failures_remaining
from public.ingestion_processing_failures;
