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
