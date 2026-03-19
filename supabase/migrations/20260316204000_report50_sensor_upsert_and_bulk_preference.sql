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

  with telemetry_source as (
    select
      elem,
      ordinality,
      public.try_numeric(elem ->> 'af') as af,
      public.try_numeric(elem ->> 'id')::int as telemetry_id,
      coalesce(public.try_numeric(elem ->> 'rf'), public.try_numeric(elem ->> 'af')) as rf,
      public.try_numeric(elem ->> 'alt') as alt,
      public.try_numeric(elem ->> 'hrs') as hrs,
      public.try_numeric(elem ->> 'ign')::int as ign,
      public.try_numeric(elem ->> 'odo') as odo,
      public.try_numeric(elem ->> 'rpm') as rpm,
      coalesce(
        nullif(elem ->> 'date', ''),
        to_char(p_report_timestamp at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS')
      ) as date_value,
      public.try_numeric(elem ->> 'spid') as spid
    from jsonb_array_elements(coalesce(v_data -> 'telemetry', '[]'::jsonb)) with ordinality as src(elem, ordinality)
  ),
  telemetry_deduped as (
    select distinct on (date_value)
      p_temperature_report_id as temperature_report_id,
      p_raw_inbound_id as raw_inbound_id,
      p_vehicle_id as vehicle_id,
      p_imei_number as imei_number,
      p_client_name as client_name,
      p_registration_number as registration_number,
      af,
      telemetry_id,
      rf,
      alt,
      hrs,
      ign,
      odo,
      rpm,
      date_value as date,
      spid,
      elem as payload
    from telemetry_source
    order by date_value, ordinality desc
  )
  insert into public.raw_sensor_data (
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
  from telemetry_deduped
  on conflict (imei_number, date)
  where imei_number is not null and date is not null
  do update set
    temperature_report_id = excluded.temperature_report_id,
    raw_inbound_id = excluded.raw_inbound_id,
    vehicle_id = excluded.vehicle_id,
    client_name = excluded.client_name,
    registration_number = excluded.registration_number,
    af = excluded.af,
    telemetry_id = excluded.telemetry_id,
    rf = excluded.rf,
    alt = excluded.alt,
    hrs = excluded.hrs,
    ign = excluded.ign,
    odo = excluded.odo,
    rpm = excluded.rpm,
    spid = excluded.spid,
    payload = excluded.payload;

  get diagnostics v_sensor_count = row_count;

  insert into public.fuel_events (
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
  where signed_volume is not null
  on conflict do nothing;

  get diagnostics v_refuel_count = row_count;

  return jsonb_build_object(
    'status', 'ok',
    'raw_inbound_id', p_raw_inbound_id,
    'sensor_rows', v_sensor_count,
    'refuel_rows', v_refuel_count
  );
end;
$$;
