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
