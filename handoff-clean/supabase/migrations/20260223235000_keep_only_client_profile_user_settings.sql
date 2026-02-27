-- Keep only client/account setup data and clear telemetry/vehicle/report data.
-- Preserved data tables:
--   - clients
--   - profiles
--   - user_settings
--   - client_users
--   - ingestion_mappings (config)

do $$
declare
  v_targets text[] := array[
    'raw_sensor_data',
    'refuel_events',
    'fuel_temperature_reports',
    'daily_movement_reports',
    'daily_metrics',
    'fuel_events',
    'telemetry_alerts',
    'fuel_report_asset_registry',
    'kpi_aggregates',
    'vehicles',
    'raw_telemetry_inbound',
    'ingestion_processing_failures',
    'ingestion_processing_runs'
  ];
  v_existing text[];
begin
  select array_agg(format('public.%I', t))
  into v_existing
  from unnest(v_targets) as t
  where to_regclass(format('public.%I', t)) is not null;

  if coalesce(array_length(v_existing, 1), 0) = 0 then
    raise notice 'No telemetry/report tables found to truncate.';
    return;
  end if;

  execute 'truncate table ' || array_to_string(v_existing, ', ') || ' restart identity cascade';
  raise notice 'Kept client/account tables only. Truncated % tables.', array_length(v_existing, 1);
end $$;
