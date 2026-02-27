-- Repair and backfill report_type=137 trips into daily_movement_reports.
-- This rebuilds all trip rows from raw_telemetry_inbound payload_json.data arrays.

do $$
begin
  if to_regclass('public.daily_movement_reports') is null then
    return;
  end if;

  alter table public.daily_movement_reports
    add column if not exists source_trip_key text;

  alter table public.daily_movement_reports
    drop constraint if exists daily_movement_reports_raw_inbound_id_key;
end $$;
create index if not exists idx_daily_movement_reports_raw_inbound
  on public.daily_movement_reports(raw_inbound_id);
create index if not exists idx_daily_movement_reports_source_trip_key
  on public.daily_movement_reports(source_trip_key);
create unique index if not exists uq_daily_movement_reports_raw_inbound_single
  on public.daily_movement_reports(raw_inbound_id)
  where raw_inbound_id is not null and source_trip_key is null;
drop index if exists public.uq_daily_movement_reports_raw_inbound_trip;
create unique index if not exists uq_daily_movement_reports_raw_inbound_trip
  on public.daily_movement_reports(raw_inbound_id, source_trip_key);
do $$
declare
  v_raw_rows integer := 0;
  v_upserted_rows integer := 0;
begin
  if to_regclass('public.raw_telemetry_inbound') is null
     or to_regclass('public.daily_movement_reports') is null
  then
    return;
  end if;

  select count(*)
  into v_raw_rows
  from public.raw_telemetry_inbound r
  where r.report_type = '137'
    and jsonb_typeof(r.payload_json -> 'data') = 'array';

  delete from public.daily_movement_reports dmr
  using public.raw_telemetry_inbound r
  where dmr.raw_inbound_id = r.id
    and r.report_type = '137';

  with src as (
    select
      r.id as raw_inbound_id,
      r.payload_json as payload,
      coalesce(r.payload_json ->> 'report_name', r.report_name) as report_name,
      r.source_imei as row_source_imei,
      elem as item
    from public.raw_telemetry_inbound r
    cross join lateral jsonb_array_elements(coalesce(r.payload_json -> 'data', '[]'::jsonb)) as item(elem)
    where r.report_type = '137'
  ),
  shaped as (
    select
      s.raw_inbound_id,
      s.report_name,
      coalesce(
        public.normalize_imei(s.item ->> 'imei'),
        public.normalize_imei(s.payload ->> 'imei'),
        public.normalize_imei(s.row_source_imei)
      ) as source_imei,
      coalesce(
        nullif(s.item ->> 'client_name', ''),
        nullif(s.item ->> 'client', ''),
        nullif(s.payload ->> 'client_name', ''),
        nullif(s.payload ->> 'client', '')
      ) as source_client_name,
      coalesce(
        nullif(s.item ->> 'asset', ''),
        nullif(s.item ->> 'registration_number', '')
      ) as source_assigned_asset,
      coalesce(
        public.try_timestamp(nullif(s.item ->> 'date', '')),
        public.try_timestamp(nullif(s.item ->> 'start_time', '')),
        public.try_timestamp(nullif(s.payload ->> 'generated_date', '')),
        now()::timestamp
      ) as report_date,
      public.try_timestamp(nullif(s.payload ->> 'start_date', '')) as from_date,
      public.try_timestamp(nullif(s.payload ->> 'end_date', '')) as to_date,
      coalesce(
        nullif(s.item ->> 'asset', ''),
        nullif(s.item ->> 'registration_number', '')
      ) as registration_number,
      nullif(s.item ->> 'asset', '') as asset_description,
      public.try_timestamp(nullif(s.item ->> 'start_time', '')) as departure_time,
      public.try_timestamp(nullif(s.item ->> 'end_time', '')) as arrival_time,
      coalesce(
        nullif(s.item ->> 'start_Location', ''),
        nullif(s.item ->> 'start_location', '')
      ) as departed_from,
      coalesce(
        nullif(s.item ->> 'endLocation', ''),
        nullif(s.item ->> 'end_location', '')
      ) as arrived_at,
      nullif(s.item ->> 'duration', '') as driving_time,
      public.try_numeric(s.item ->> 'kilometers') as distance_km,
      public.try_numeric(s.item ->> 'fuelUsed') as fuel_used_litres,
      public.try_numeric(s.item ->> 'max_Speed')::integer as max_speed_kmh,
      array_to_string(
        array[
          coalesce(
            public.normalize_imei(s.item ->> 'imei'),
            public.normalize_imei(s.payload ->> 'imei'),
            public.normalize_imei(s.row_source_imei),
            ''
          ),
          coalesce(nullif(s.item ->> 'asset', ''), ''),
          coalesce(nullif(s.item ->> 'start_time', ''), nullif(s.item ->> 'date', ''), ''),
          coalesce(nullif(s.item ->> 'end_time', ''), nullif(s.item ->> 'arrival_time', ''), nullif(s.item ->> 'date', ''), ''),
          coalesce(nullif(s.item ->> 'start_odometer', ''), ''),
          coalesce(nullif(s.item ->> 'end_odometer', ''), ''),
          coalesce(nullif(s.item ->> 'kilometers', ''), ''),
          coalesce(nullif(s.item ->> 'duration', ''), '')
        ],
        '|'
      ) as source_trip_key
    from src s
  )
  insert into public.daily_movement_reports (
    raw_inbound_id,
    applied_mapping_version,
    source_trip_key,
    report_name,
    source_imei,
    source_client_name,
    source_assigned_asset,
    report_date,
    from_date,
    to_date,
    registration_number,
    asset_description,
    departure_time,
    arrival_time,
    departed_from,
    arrived_at,
    driving_time,
    distance_km,
    fuel_used_litres,
    max_speed_kmh,
    company_name,
    vehicle_id
  )
  select
    sh.raw_inbound_id,
    2 as applied_mapping_version,
    sh.source_trip_key,
    sh.report_name,
    sh.source_imei,
    sh.source_client_name,
    sh.source_assigned_asset,
    sh.report_date,
    sh.from_date,
    sh.to_date,
    left(sh.registration_number, 30),
    sh.asset_description,
    sh.departure_time,
    sh.arrival_time,
    sh.departed_from,
    sh.arrived_at,
    sh.driving_time,
    sh.distance_km,
    sh.fuel_used_litres,
    sh.max_speed_kmh,
    coalesce(sh.source_client_name, 'Teletrac Ingestion') as company_name,
    v.id as vehicle_id
  from shaped sh
  left join public.vehicles v
    on (sh.source_imei is not null and public.normalize_imei(v.imei) = sh.source_imei)
    or (sh.source_assigned_asset is not null and v.vehicle_plate = sh.source_assigned_asset)
  where sh.source_trip_key is not null
    and btrim(sh.source_trip_key) <> ''
  on conflict (raw_inbound_id, source_trip_key) do update
  set
    report_name = excluded.report_name,
    source_imei = excluded.source_imei,
    source_client_name = excluded.source_client_name,
    source_assigned_asset = excluded.source_assigned_asset,
    report_date = excluded.report_date,
    from_date = excluded.from_date,
    to_date = excluded.to_date,
    registration_number = excluded.registration_number,
    asset_description = excluded.asset_description,
    departure_time = excluded.departure_time,
    arrival_time = excluded.arrival_time,
    departed_from = excluded.departed_from,
    arrived_at = excluded.arrived_at,
    driving_time = excluded.driving_time,
    distance_km = excluded.distance_km,
    fuel_used_litres = excluded.fuel_used_litres,
    max_speed_kmh = excluded.max_speed_kmh,
    company_name = excluded.company_name,
    vehicle_id = coalesce(excluded.vehicle_id, public.daily_movement_reports.vehicle_id);

  get diagnostics v_upserted_rows = row_count;
  raise notice 'Trip 137 repair completed: raw rows=% | upserted trips=%', v_raw_rows, v_upserted_rows;
end $$;
