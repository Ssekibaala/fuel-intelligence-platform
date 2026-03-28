-- report_type=137 trip payload times are already in EAT local time.
-- Older processing converted them to UTC-like stored values, which made
-- journey analysis appear three hours behind the platform.

update public.trip_reports tr
set
  report_date = tr.report_date + interval '3 hours',
  departure_time = tr.departure_time + interval '3 hours',
  arrival_time = tr.arrival_time + interval '3 hours',
  departure_date = date_trunc('day', tr.departure_time + interval '3 hours')
from public.raw_telemetry_inbound r
where r.id = tr.raw_inbound_id
  and r.report_type::text = '137';
