-- Persist per-minute ingestion request counts so traffic can be measured
-- even when raw_telemetry_inbound rows are purged or coalesced.

create table if not exists public.ingestion_request_metrics (
  minute_bucket timestamptz not null,
  source text not null,
  report_type text not null,
  source_imei_key text not null,
  source_imei text null,
  request_count bigint not null default 0,
  accepted_count bigint not null default 0,
  duplicate_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (minute_bucket, source, report_type, source_imei_key)
);

create index if not exists idx_ingestion_request_metrics_bucket
  on public.ingestion_request_metrics(minute_bucket desc);

create index if not exists idx_ingestion_request_metrics_report_type
  on public.ingestion_request_metrics(report_type, minute_bucket desc);

create or replace function public.record_ingestion_request_metric(
  p_received_at timestamptz default now(),
  p_source text default 'unknown',
  p_report_type text default 'unknown',
  p_source_imei text default null,
  p_outcome text default 'request'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minute_bucket timestamptz := date_trunc('minute', coalesce(p_received_at, now()));
  v_source text := coalesce(nullif(btrim(p_source), ''), 'unknown');
  v_report_type text := coalesce(nullif(btrim(p_report_type), ''), 'unknown');
  v_source_imei text := nullif(regexp_replace(coalesce(p_source_imei, ''), '\D', '', 'g'), '');
  v_source_imei_key text := coalesce(v_source_imei, '__none__');
  v_request_count bigint := case when lower(coalesce(p_outcome, 'request')) = 'request' then 1 else 0 end;
  v_accepted_count bigint := case when lower(coalesce(p_outcome, 'request')) = 'accepted' then 1 else 0 end;
  v_duplicate_count bigint := case when lower(coalesce(p_outcome, 'request')) = 'duplicate' then 1 else 0 end;
begin
  insert into public.ingestion_request_metrics (
    minute_bucket,
    source,
    report_type,
    source_imei_key,
    source_imei,
    request_count,
    accepted_count,
    duplicate_count
  )
  values (
    v_minute_bucket,
    v_source,
    v_report_type,
    v_source_imei_key,
    v_source_imei,
    v_request_count,
    v_accepted_count,
    v_duplicate_count
  )
  on conflict (minute_bucket, source, report_type, source_imei_key)
  do update set
    source_imei = coalesce(excluded.source_imei, ingestion_request_metrics.source_imei),
    request_count = ingestion_request_metrics.request_count + excluded.request_count,
    accepted_count = ingestion_request_metrics.accepted_count + excluded.accepted_count,
    duplicate_count = ingestion_request_metrics.duplicate_count + excluded.duplicate_count,
    updated_at = now();
end;
$$;
