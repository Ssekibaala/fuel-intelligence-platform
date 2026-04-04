-- Monitor the effect of usage-reduction changes.
-- Run these in Supabase SQL Editor after deploying the frontend and cron changes.

-- 1. Confirm the live worker schedule.
select
  jobid,
  jobname,
  schedule,
  active,
  command
from cron.job
where jobname = 'process-telemetry-cron'
order by jobid desc;

-- 2. Worker runs per day.
select
  date_trunc('day', started_at) as day,
  count(*) as total_runs,
  count(*) filter (where status = 'completed') as completed_runs,
  count(*) filter (where status = 'failed') as failed_runs,
  count(*) filter (where status = 'running') as still_running
from public.ingestion_processing_runs
where started_at >= now() - interval '14 days'
group by 1
order by 1 desc;

-- 3. Inbound telemetry per day.
select
  date_trunc('day', received_at) as day,
  count(*) as inbound_rows,
  count(*) filter (where status = 'pending') as pending_rows,
  count(*) filter (where status = 'processed') as processed_rows,
  count(*) filter (where status = 'failed') as failed_rows
from public.raw_telemetry_inbound
where received_at >= now() - interval '14 days'
group by 1
order by 1 desc;

-- 4. Backlog health right now.
select
  status,
  count(*) as rows
from public.raw_telemetry_inbound
group by status
order by status;

-- 5. Rows that have been pending too long.
select
  count(*) as pending_over_15_min
from public.raw_telemetry_inbound
where status = 'pending'
  and received_at < now() - interval '15 minutes';

-- 6. Recent processing failures.
select
  created_at,
  source,
  report_type,
  attempt_count,
  error_message
from public.ingestion_processing_failures
where created_at >= now() - interval '7 days'
order by created_at desc
limit 100;

-- 7. Report type 0 volume by hour.
select
  date_trunc('hour', received_at) as hour,
  count(*) as report0_rows
from public.raw_telemetry_inbound
where report_type = '0'
  and received_at >= now() - interval '48 hours'
group by 1
order by 1 desc;

-- 8. Report type 0 backlog by status.
select
  status,
  count(*) as report0_rows
from public.raw_telemetry_inbound
where report_type = '0'
group by status
order by status;

-- 9. Latest worker throughput snapshots.
select
  started_at,
  claimed_count,
  processed_count,
  failed_count,
  skipped_count,
  status
from public.ingestion_processing_runs
order by started_at desc
limit 50;

-- 10. True incoming traffic by report type, preserved even after raw row cleanup.
select
  minute_bucket,
  source,
  report_type,
  sum(request_count) as request_count,
  sum(accepted_count) as accepted_count,
  sum(duplicate_count) as duplicate_count
from public.ingestion_request_metrics
where minute_bucket >= now() - interval '24 hours'
group by 1, 2, 3
order by minute_bucket desc, report_type, source;

-- 11. Report type 0 ingress rate by vehicle/IMEI.
select
  minute_bucket,
  source_imei,
  sum(request_count) as request_count,
  sum(accepted_count) as accepted_count
from public.ingestion_request_metrics
where report_type = '0'
  and source_imei_key <> '__none__'
  and minute_bucket >= now() - interval '6 hours'
group by 1, 2
order by minute_bucket desc, request_count desc
limit 500;
