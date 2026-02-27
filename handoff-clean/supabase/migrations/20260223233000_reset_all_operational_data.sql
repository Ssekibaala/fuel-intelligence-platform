-- One-time operational data reset.
-- Keeps configuration/auth tables intact (e.g. ingestion_mappings, clients, profiles, client_users).

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
    raise notice 'No target tables found for operational reset.';
    return;
  end if;

  execute 'truncate table ' || array_to_string(v_existing, ', ') || ' restart identity cascade';
  raise notice 'Operational reset complete. Truncated % tables.', array_length(v_existing, 1);
end $$;
