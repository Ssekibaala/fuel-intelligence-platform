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
  v_resolved_ignition boolean;
  v_resolved_speed numeric;
begin
  if p_imei is null or btrim(p_imei) = '' then
    return jsonb_build_object('status', 'skipped', 'reason', 'missing_imei');
  end if;

  v_asset := nullif(btrim(p_assigned_asset), '');
  if v_asset is null then
    v_asset := p_imei;
  end if;

  v_client := nullif(btrim(p_client_name), '');
  v_resolved_ignition := p_is_ignition_on;
  v_resolved_speed := p_vehicle_speed;

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
    asset_id = case
      when p_imei is null or btrim(p_imei) = '' then asset_id
      when asset_id is null then p_imei
      when nullif(btrim(vehicle_plate), '') is not null and asset_id = vehicle_plate then p_imei
      when asset_id = v_asset and v_asset <> p_imei then p_imei
      else asset_id
    end,
    vehicle_plate = case
      when v_asset is null or btrim(v_asset) = '' then vehicle_plate
      when vehicle_plate is null then v_asset
      when public.normalize_imei(vehicle_plate) = public.normalize_imei(coalesce(imei, asset_id, p_imei)) then v_asset
      when vehicle_plate <> v_asset then v_asset
      else vehicle_plate
    end,
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
    status = case
      when coalesce(v_resolved_ignition, last_ignition_on) = false then 'Parked'
      when coalesce(v_resolved_ignition, last_ignition_on) = true
        and coalesce(v_resolved_speed, last_speed_kmh, 0) > 0
        then 'Moving'
      when coalesce(v_resolved_ignition, last_ignition_on) = true
        and coalesce(v_resolved_speed, last_speed_kmh, 0) <= 0
        and status = 'Idling'
        then 'Idling'
      when coalesce(v_resolved_ignition, last_ignition_on) = true
        and coalesce(v_resolved_speed, last_speed_kmh, 0) <= 0
        and p_gps_at is not null
        and last_gps_at is not null
        and p_gps_at >= last_gps_at + interval '5 minutes'
        then 'Idling'
      when coalesce(v_resolved_ignition, last_ignition_on) = true then 'Moving'
      else coalesce(status, 'Parked')
    end,
    source_last_raw_inbound_id = coalesce(p_raw_inbound_id, source_last_raw_inbound_id),
    updated_at = now()
  where id = v_vehicle_id
    and (
      p_gps_at is null
      or last_gps_at is null
      or last_gps_at > now() + interval '1 day'
      or p_gps_at >= last_gps_at
    );

  if found then
    return jsonb_build_object('status', 'updated', 'vehicle_id', v_vehicle_id);
  end if;

  return jsonb_build_object('status', 'stale_ignored', 'vehicle_id', v_vehicle_id);
end;
$$;
