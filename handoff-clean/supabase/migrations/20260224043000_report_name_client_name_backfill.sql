-- Populate client names from report_name patterns like:
--   "<report title>|<client>"
-- and keep this available on derived tables.

do $$
begin
  if to_regclass('public.telemetry_alerts') is not null then
    alter table public.telemetry_alerts
      add column if not exists source_client_name text;

    create index if not exists idx_telemetry_alerts_source_client_name
      on public.telemetry_alerts(source_client_name);
  end if;
end $$;
-- Backfill telemetry alerts client name from raw report_name.
update public.telemetry_alerts ta
set source_client_name = coalesce(
  nullif(btrim(ta.source_client_name), ''),
  nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), ''),
  nullif(btrim(r.payload_json ->> 'client_name'), ''),
  nullif(btrim(r.payload_json ->> 'client'), '')
)
from public.raw_telemetry_inbound r
where ta.raw_inbound_id = r.id
  and (ta.source_client_name is null or btrim(ta.source_client_name) = '');
-- Backfill daily movement client/company name from report_name.
update public.daily_movement_reports dmr
set source_client_name = coalesce(
      nullif(btrim(dmr.source_client_name), ''),
      nullif(btrim(split_part(coalesce(dmr.report_name, ''), '|', 2)), ''),
      nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), '')
    ),
    company_name = coalesce(
      nullif(btrim(dmr.company_name), ''),
      nullif(btrim(dmr.source_client_name), ''),
      nullif(btrim(split_part(coalesce(dmr.report_name, ''), '|', 2)), ''),
      nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), ''),
      dmr.company_name
    )
from public.raw_telemetry_inbound r
where dmr.raw_inbound_id = r.id
  and (
    dmr.source_client_name is null
    or btrim(dmr.source_client_name) = ''
    or dmr.company_name is null
    or btrim(dmr.company_name) = ''
    or dmr.company_name = 'Teletrac Ingestion'
  );
-- Backfill report50-derived client name where historical rows missed it.
update public.daily_metrics dm
set client_name = coalesce(
  nullif(btrim(dm.client_name), ''),
  nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), '')
)
from public.raw_telemetry_inbound r
where dm.raw_inbound_id = r.id
  and (dm.client_name is null or btrim(dm.client_name) = '');
update public.fuel_temperature_reports fr
set client_name = coalesce(
  nullif(btrim(fr.client_name), ''),
  nullif(btrim(split_part(coalesce(fr.report_name, ''), '|', 2)), ''),
  nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), '')
)
from public.raw_telemetry_inbound r
where fr.raw_inbound_id = r.id
  and (fr.client_name is null or btrim(fr.client_name) = '');
update public.fuel_report_asset_registry far
set client_name = coalesce(
  nullif(btrim(far.client_name), ''),
  nullif(btrim(split_part(coalesce(far.report_name, ''), '|', 2)), '')
)
where far.report_name like '%|%'
  and (far.client_name is null or btrim(far.client_name) = '');
