-- Remove obviously false trip rows and align historical data with the
-- report_type=137 processing rule that skips trips shorter than 0.1 km.

delete from public.trip_reports
where coalesce(distance_km, 0) < 0.1;
