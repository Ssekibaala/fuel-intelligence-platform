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
