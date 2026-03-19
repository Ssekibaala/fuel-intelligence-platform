-- Backfill missing vehicles.imei from derived telemetry tables, then
-- repair asset_id when it still equals vehicle_plate.
-- Safe to run multiple times.

do $$
begin
  if to_regclass('public.vehicles') is null then
    return;
  end if;

  if to_regclass('public.fuel_events') is not null then
    update public.vehicles v
    set imei = public.normalize_imei(src.imei_number)
    from (
      select
        registration_number,
        max(imei_number) as imei_number
      from public.fuel_events
      where registration_number is not null
        and btrim(registration_number) <> ''
        and imei_number is not null
        and btrim(imei_number) <> ''
      group by registration_number
    ) src
    where (v.imei is null or btrim(v.imei) = '')
      and v.vehicle_plate = src.registration_number
      and not exists (
        select 1
        from public.vehicles v2
        where v2.id <> v.id
          and v2.imei is not null
          and btrim(v2.imei) <> ''
          and public.normalize_imei(v2.imei) = public.normalize_imei(src.imei_number)
      );
  end if;

  if to_regclass('public.trip_reports') is not null then
    update public.vehicles v
    set imei = public.normalize_imei(src.source_imei)
    from (
      select
        source_assigned_asset,
        max(source_imei) as source_imei
      from public.trip_reports
      where source_assigned_asset is not null
        and btrim(source_assigned_asset) <> ''
        and source_imei is not null
        and btrim(source_imei) <> ''
      group by source_assigned_asset
    ) src
    where (v.imei is null or btrim(v.imei) = '')
      and v.vehicle_plate = src.source_assigned_asset
      and not exists (
        select 1
        from public.vehicles v2
        where v2.id <> v.id
          and v2.imei is not null
          and btrim(v2.imei) <> ''
          and public.normalize_imei(v2.imei) = public.normalize_imei(src.source_imei)
      );
  end if;

  if to_regclass('public.daily_movement_reports') is not null then
    update public.vehicles v
    set imei = public.normalize_imei(src.source_imei)
    from (
      select
        source_assigned_asset,
        max(source_imei) as source_imei
      from public.daily_movement_reports
      where source_assigned_asset is not null
        and btrim(source_assigned_asset) <> ''
        and source_imei is not null
        and btrim(source_imei) <> ''
      group by source_assigned_asset
    ) src
    where (v.imei is null or btrim(v.imei) = '')
      and v.vehicle_plate = src.source_assigned_asset
      and not exists (
        select 1
        from public.vehicles v2
        where v2.id <> v.id
          and v2.imei is not null
          and btrim(v2.imei) <> ''
          and public.normalize_imei(v2.imei) = public.normalize_imei(src.source_imei)
      );
  end if;
end $$;
do $$
declare
  v_fixed integer := 0;
  v_unresolved integer := 0;
begin
  if to_regclass('public.vehicles') is null then
    return;
  end if;

  update public.vehicles
  set asset_id = public.normalize_imei(imei)
  where asset_id is not null
    and vehicle_plate is not null
    and asset_id = vehicle_plate
    and imei is not null
    and btrim(imei) <> '';

  get diagnostics v_fixed = row_count;

  select count(*)
  into v_unresolved
  from public.vehicles
  where asset_id is not null
    and vehicle_plate is not null
    and asset_id = vehicle_plate
    and (imei is null or btrim(imei) = '');

  raise notice 'vehicle IMEI backfill done. asset_id repaired=% unresolved_missing_imei=%', v_fixed, v_unresolved;
end $$;
