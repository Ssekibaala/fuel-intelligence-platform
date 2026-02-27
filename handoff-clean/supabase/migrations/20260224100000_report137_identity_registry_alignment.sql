-- report_type 137 payloads carry many assets per row.
-- Keep raw_telemetry_inbound.source_imei null for this report type.

update public.raw_telemetry_inbound
set source_imei = null
where report_type = '137'
  and source_imei is not null;
