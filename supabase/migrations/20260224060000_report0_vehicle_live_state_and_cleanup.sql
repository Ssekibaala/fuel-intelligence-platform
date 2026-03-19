-- Handle high-frequency report_type=0 updates by maintaining a latest-state snapshot per vehicle.
-- Also remove non-essential legacy columns from vehicles.

do $$
begin
  if to_regclass('public.vehicles') is null then
    return;
  end if;

  alter table public.vehicles
    add column if not exists client_name text,
    add column if not exists source_last_raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null,
    add column if not exists last_gps_at timestamptz,
    add column if not exists last_engine_hours numeric(14, 3),
    add column if not exists last_ignition_on boolean,
    add column if not exists last_speed_kmh numeric(10, 3),
    add column if not exists last_driver_id text,
    add column if not exists last_latitude numeric(11, 6),
    add column if not exists last_longitude numeric(11, 6),
    add column if not exists last_odometer_km numeric(14, 3),
    add column if not exists last_road_name text,
    add column if not exists last_event_name text,
    add column if not exists last_event_id text;
end $$;
create index if not exists idx_vehicles_imei on public.vehicles(imei);
create index if not exists idx_vehicles_last_gps_at on public.vehicles(last_gps_at desc);
create or replace function public.upsert_vehicle_live_state(
  p_imei text,
  p_assigned_asset text default null,
  p_client_name text default null,
  p_gps_at timestamptz default null,
  p_engine_hours numeric default null,
  p_is_ignition_on boolean default null,
  p_vehicle_speed numeric default null,
  p_driver_id text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_odometer numeric default null,
  p_road_name text default null,
  p_event_name text default null,
  p_event_id text default null,
  p_raw_inbound_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sync jsonb;
  v_vehicle_id uuid;
  v_asset text;
  v_client text;
begin
  if p_imei is null or btrim(p_imei) = '' then
    return jsonb_build_object('status', 'skipped', 'reason', 'missing_imei');
  end if;

  v_asset := nullif(btrim(p_assigned_asset), '');
  if v_asset is null then
    v_asset := p_imei;
  end if;

  v_client := nullif(btrim(p_client_name), '');

  select public.sync_vehicle_from_fuel_report(v_asset, v_client, p_imei) into v_sync;
  v_vehicle_id := nullif(v_sync ->> 'vehicle_id', '')::uuid;

  if v_vehicle_id is null then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', coalesce(v_sync ->> 'reason', 'vehicle_sync_failed')
    );
  end if;

  update public.vehicles
  set
    imei = coalesce(imei, p_imei),
    asset_id = coalesce(asset_id, v_asset),
    vehicle_plate = coalesce(vehicle_plate, v_asset),
    client_name = coalesce(client_name, v_client),
    last_gps_at = coalesce(p_gps_at, last_gps_at),
    last_engine_hours = coalesce(p_engine_hours, last_engine_hours),
    last_ignition_on = coalesce(p_is_ignition_on, last_ignition_on),
    last_speed_kmh = coalesce(p_vehicle_speed, last_speed_kmh),
    last_driver_id = coalesce(nullif(btrim(p_driver_id), ''), last_driver_id),
    last_latitude = coalesce(p_latitude, last_latitude),
    last_longitude = coalesce(p_longitude, last_longitude),
    last_odometer_km = coalesce(p_odometer, last_odometer_km),
    last_road_name = coalesce(nullif(btrim(p_road_name), ''), last_road_name),
    last_event_name = coalesce(nullif(btrim(p_event_name), ''), last_event_name),
    last_event_id = coalesce(nullif(btrim(p_event_id), ''), last_event_id),
    total_engine_hours = case
      when p_engine_hours is null then total_engine_hours
      else greatest(coalesce(total_engine_hours, p_engine_hours), p_engine_hours)
    end,
    total_distance = case
      when p_odometer is null then total_distance
      else greatest(coalesce(total_distance, p_odometer), p_odometer)
    end,
    source_last_raw_inbound_id = coalesce(p_raw_inbound_id, source_last_raw_inbound_id),
    updated_at = now()
  where id = v_vehicle_id
    and (
      p_gps_at is null
      or last_gps_at is null
      or p_gps_at >= last_gps_at
    );

  if found then
    return jsonb_build_object('status', 'updated', 'vehicle_id', v_vehicle_id);
  end if;

  return jsonb_build_object('status', 'stale_ignored', 'vehicle_id', v_vehicle_id);
end;
$$;
alter table if exists public.vehicles
  drop column if exists driver_name,
  drop column if exists efficiency_rating,
  drop column if exists working_days,
  drop column if exists parking_days,
  drop column if exists last_maintenance_date,
  drop column if exists maintenance_status,
  drop column if exists theft_incidents,
  drop column if exists cost_per_km,
  drop column if exists system_reliability;
