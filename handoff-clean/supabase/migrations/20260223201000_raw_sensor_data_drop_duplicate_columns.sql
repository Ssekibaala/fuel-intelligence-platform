-- Clean raw_sensor_data by removing duplicated generic sensor columns.
-- Keep telemetry-native columns (af/rf/alt/hrs/ign/odo/rpm/date/spid) and identity/FK columns.

alter table if exists public.raw_sensor_data
  drop column if exists timestamp,
  drop column if exists fuel,
  drop column if exists altitude,
  drop column if exists odometer,
  drop column if exists speed,
  drop column if exists temperature,
  drop column if exists sensor_name,
  drop column if exists sensor_value,
  drop column if exists sensor_unit,
  drop column if exists sensor_timestamp;
create index if not exists idx_raw_sensor_data_date
  on public.raw_sensor_data(date);
create or replace function public.process_report50_details(
  p_raw_inbound_id uuid,
  p_temperature_report_id uuid,
  p_vehicle_id uuid,
  p_imei_number text,
  p_client_name text,
  p_registration_number text,
  p_report_timestamp timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := '{}'::jsonb;
  v_data jsonb := '{}'::jsonb;
  v_sensor_count integer := 0;
  v_refuel_count integer := 0;
begin
  select payload_json
  into v_payload
  from public.raw_telemetry_inbound
  where id = p_raw_inbound_id;

  if v_payload is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'raw_inbound_not_found',
      'raw_inbound_id', p_raw_inbound_id
    );
  end if;

  v_data := coalesce(v_payload -> 'data', '{}'::jsonb);

  insert into public.raw_sensor_data (
    fuel_report_id,
    temperature_report_id,
    raw_inbound_id,
    vehicle_id,
    imei_number,
    client_name,
    registration_number,
    af,
    telemetry_id,
    rf,
    alt,
    hrs,
    ign,
    odo,
    rpm,
    date,
    spid,
    payload
  )
  select
    p_temperature_report_id,
    p_temperature_report_id,
    p_raw_inbound_id,
    p_vehicle_id,
    p_imei_number,
    p_client_name,
    p_registration_number,
    public.try_numeric(elem ->> 'af'),
    public.try_numeric(elem ->> 'id')::int,
    coalesce(public.try_numeric(elem ->> 'rf'), public.try_numeric(elem ->> 'af')),
    public.try_numeric(elem ->> 'alt'),
    public.try_numeric(elem ->> 'hrs'),
    public.try_numeric(elem ->> 'ign')::int,
    public.try_numeric(elem ->> 'odo'),
    public.try_numeric(elem ->> 'rpm'),
    coalesce(
      nullif(elem ->> 'date', ''),
      to_char(p_report_timestamp at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS')
    ),
    public.try_numeric(elem ->> 'spid'),
    elem
  from jsonb_array_elements(coalesce(v_data -> 'telemetry', '[]'::jsonb)) as src(elem);

  get diagnostics v_sensor_count = row_count;

  insert into public.refuel_events (
    fuel_report_id,
    temperature_report_id,
    raw_inbound_id,
    vehicle_id,
    imei_number,
    client_name,
    registration_number,
    event_type,
    event_time,
    refilled,
    initial_fuel,
    final_fuel,
    location,
    latitude,
    longitude,
    payload
  )
  select
    p_temperature_report_id,
    p_temperature_report_id,
    p_raw_inbound_id,
    p_vehicle_id,
    p_imei_number,
    p_client_name,
    p_registration_number,
    event_type,
    coalesce(public.try_timestamp(elem ->> 'timestamp'), p_report_timestamp::timestamp),
    signed_volume,
    public.try_numeric(elem ->> 'initial_fuel'),
    public.try_numeric(elem ->> 'final_fuel'),
    nullif(elem ->> 'location', ''),
    public.try_numeric(elem ->> 'lat'),
    public.try_numeric(elem ->> 'lon'),
    jsonb_build_object('event_type', event_type) || elem
  from (
    select 'refill'::text as event_type,
           elem,
           abs(coalesce(public.try_numeric(elem ->> 'refill'), public.try_numeric(elem ->> 'refilled'))) as signed_volume
    from jsonb_array_elements(coalesce(v_data #> '{refill_details,refills}', '[]'::jsonb)) as refill(elem)
    union all
    select 'drain'::text as event_type,
           elem,
           -abs(coalesce(public.try_numeric(elem ->> 'drain'), public.try_numeric(elem ->> 'drained'))) as signed_volume
    from jsonb_array_elements(coalesce(v_data #> '{drain_details,drains}', '[]'::jsonb)) as drain(elem)
  ) t
  where signed_volume is not null;

  get diagnostics v_refuel_count = row_count;

  return jsonb_build_object(
    'status', 'ok',
    'raw_inbound_id', p_raw_inbound_id,
    'sensor_rows', v_sensor_count,
    'refuel_rows', v_refuel_count
  );
end;
$$;
