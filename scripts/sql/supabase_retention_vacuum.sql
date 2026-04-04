-- Supabase retention cleanup: VACUUM phase
-- Run each statement below separately in Supabase SQL Editor.
-- Do not run this whole file as one transaction batch.

vacuum analyze public.raw_telemetry_inbound;

vacuum analyze public.raw_sensor_data;

vacuum analyze public.ingestion_processing_runs;

vacuum analyze public.ingestion_processing_failures;

vacuum analyze net._http_response;

vacuum analyze cron.job_run_details;
