-- Remove legacy asset registry table.
-- Vehicles table is now the single source of truth for identity resolution.

do $$
begin
  if to_regclass('public.fuel_report_asset_registry') is not null then
    execute 'drop policy if exists "admin_select_fuel_report_asset_registry" on public.fuel_report_asset_registry';
  end if;
end $$;
drop index if exists public.idx_fuel_report_asset_registry_last_seen;
drop index if exists public.idx_fuel_report_asset_registry_assigned_asset;
drop index if exists public.idx_fuel_report_asset_registry_imei_number;
drop index if exists public.idx_fuel_report_asset_registry_imei_last_seen;
drop index if exists public.idx_fuel_report_asset_registry_asset_last_seen;
drop table if exists public.fuel_report_asset_registry cascade;
