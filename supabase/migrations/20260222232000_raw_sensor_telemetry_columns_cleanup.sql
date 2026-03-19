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
