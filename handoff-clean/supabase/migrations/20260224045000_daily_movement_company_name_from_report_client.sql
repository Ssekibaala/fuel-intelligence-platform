-- Replace default company label with parsed client where available.

update public.daily_movement_reports dmr
set company_name = coalesce(
      nullif(btrim(dmr.source_client_name), ''),
      nullif(btrim(split_part(coalesce(dmr.report_name, ''), '|', 2)), ''),
      nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), ''),
      dmr.company_name
    )
from public.raw_telemetry_inbound r
where dmr.raw_inbound_id = r.id
  and (
    dmr.company_name is null
    or btrim(dmr.company_name) = ''
    or lower(btrim(dmr.company_name)) = 'teletrac ingestion'
  );
