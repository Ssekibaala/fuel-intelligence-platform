-- Remove legacy/duplicate columns that are no longer used by ingestion.
-- Keep canonical UUID/FK columns and report identity columns.

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
      to_char(p_report_timestamp at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS')
    ),
    public.try_numeric(elem ->> 'spid'),
    elem
  from jsonb_array_elements(coalesce(v_data -> 'telemetry', '[]'::jsonb)) as src(elem);

  get diagnostics v_sensor_count = row_count;

  insert into public.refuel_events (
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
    select
      'refill'::text as event_type,
      elem,
      abs(coalesce(public.try_numeric(elem ->> 'refill'), public.try_numeric(elem ->> 'refilled'))) as signed_volume
    from jsonb_array_elements(coalesce(v_data #> '{refill_details,refills}', '[]'::jsonb)) as refill(elem)
    union all
    select
      'drain'::text as event_type,
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
do $$
declare
  r record;
  v_roles text;
  v_cmd text;
  v_qual text;
  v_with_check text;
  v_sql text;
begin
  for r in
    select *
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%vehicle_id_legacy%'
        or coalesce(with_check, '') like '%vehicle_id_legacy%'
        or coalesce(qual, '') like '%fuel_report_id_legacy%'
        or coalesce(with_check, '') like '%fuel_report_id_legacy%'
        or coalesce(qual, '') like '%temperature_report_id_legacy%'
        or coalesce(with_check, '') like '%temperature_report_id_legacy%'
        or coalesce(qual, '') like '%number_of_refills%'
        or coalesce(with_check, '') like '%number_of_refills%'
        or coalesce(qual, '') like '%number_of_thefts%'
        or coalesce(with_check, '') like '%number_of_thefts%'
        or coalesce(qual, '') like '%metric_date%'
        or coalesce(with_check, '') like '%metric_date%'
      )
  loop
    select string_agg(quote_ident(x), ', ')
    into v_roles
    from unnest(r.roles) as t(x);
    v_roles := coalesce(v_roles, 'public');

    v_cmd := case when r.cmd = 'ALL' then '' else ' for ' || r.cmd end;

    v_qual := replace(coalesce(r.qual, ''), 'vehicle_id_legacy', 'vehicle_id');
    v_qual := replace(v_qual, 'fuel_report_id_legacy', 'temperature_report_id');
    v_qual := replace(v_qual, 'temperature_report_id_legacy', 'temperature_report_id');
    v_qual := replace(v_qual, 'number_of_refills', 'refill_count');
    v_qual := replace(v_qual, 'number_of_thefts', 'drain_count');
    v_qual := replace(v_qual, 'metric_date', 'metric_day');
    if btrim(v_qual) = '' then v_qual := null; end if;

    v_with_check := replace(coalesce(r.with_check, ''), 'vehicle_id_legacy', 'vehicle_id');
    v_with_check := replace(v_with_check, 'fuel_report_id_legacy', 'temperature_report_id');
    v_with_check := replace(v_with_check, 'temperature_report_id_legacy', 'temperature_report_id');
    v_with_check := replace(v_with_check, 'number_of_refills', 'refill_count');
    v_with_check := replace(v_with_check, 'number_of_thefts', 'drain_count');
    v_with_check := replace(v_with_check, 'metric_date', 'metric_day');
    if btrim(v_with_check) = '' then v_with_check := null; end if;

    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);

    v_sql := format(
      'create policy %I on %I.%I as %s%s to %s',
      r.policyname,
      r.schemaname,
      r.tablename,
      r.permissive,
      v_cmd,
      v_roles
    );

    if v_qual is not null then
      v_sql := v_sql || ' using (' || v_qual || ')';
    end if;

    if v_with_check is not null then
      v_sql := v_sql || ' with check (' || v_with_check || ')';
    end if;

    execute v_sql;
  end loop;
end $$;
alter table if exists public.raw_sensor_data
  drop column if exists fuel_report_id;
alter table if exists public.refuel_events
  drop column if exists fuel_report_id,
  drop column if exists fuel_report_id_legacy,
  drop column if exists temperature_report_id_legacy,
  drop column if exists vehicle_id_legacy;
alter table if exists public.daily_movement_reports
  drop column if exists vehicle_id_legacy;
alter table if exists public.daily_metrics
  drop column if exists vehicle_id_legacy,
  drop column if exists metric_date,
  drop column if exists number_of_refills,
  drop column if exists number_of_thefts;
alter table if exists public.telemetry_alerts
  drop column if exists vehicle_id_legacy;
alter table if exists public.fuel_temperature_reports
  drop column if exists vehicle_id_legacy;
