-- Final safe backfill of vehicles.imei from raw_telemetry_inbound identity hints.
-- Only applies when a vehicle plate maps to exactly one unique IMEI candidate.
-- Safe to run multiple times.

do $$
begin
  if to_regclass('public.vehicles') is null or to_regclass('public.raw_telemetry_inbound') is null then
    return;
  end if;

  with raw_candidates as (
    select
      nullif(trim(split_part(coalesce(r.report_name, ''), '|', 3)), '') as assigned_asset,
      public.normalize_imei(
        coalesce(
          nullif(trim(r.source_imei), ''),
          nullif(trim(split_part(coalesce(r.report_name, ''), '|', 1)), '')
        )
      ) as inferred_imei
    from public.raw_telemetry_inbound r
    where (
      r.source_imei is not null and btrim(r.source_imei) <> ''
    )
    or (
      r.report_name is not null
      and r.report_name like '%|%|%'
    )
  ),
  unique_plate_imei as (
    select
      assigned_asset,
      min(inferred_imei) as inferred_imei
    from raw_candidates
    where assigned_asset is not null
      and inferred_imei is not null
      and btrim(inferred_imei) <> ''
    group by assigned_asset
    having count(distinct inferred_imei) = 1
  )
  update public.vehicles v
  set imei = u.inferred_imei
  from unique_plate_imei u
  where (v.imei is null or btrim(v.imei) = '')
    and v.vehicle_plate = u.assigned_asset
    and not exists (
      select 1
      from public.vehicles v2
      where v2.id <> v.id
        and v2.imei is not null
        and btrim(v2.imei) <> ''
        and public.normalize_imei(v2.imei) = u.inferred_imei
    );
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

  raise notice 'raw identity backfill done. asset_id repaired=% unresolved_missing_imei=%', v_fixed, v_unresolved;
end $$;
