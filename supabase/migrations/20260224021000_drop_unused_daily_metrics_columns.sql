-- Drop no-longer-needed telemetry rollup columns from daily_metrics.

do $$
begin
  if to_regclass('public.daily_metrics') is null then
    return;
  end if;

  alter table public.daily_metrics
    drop column if exists telemetry_points,
    drop column if exists telemetry_first_at,
    drop column if exists telemetry_last_at,
    drop column if exists fuel_level_min_l,
    drop column if exists fuel_level_max_l,
    drop column if exists fuel_level_avg_l,
    drop column if exists odometer_delta_km,
    drop column if exists hours_counter_open,
    drop column if exists hours_counter_close,
    drop column if exists hours_counter_delta,
    drop column if exists ignition_on_points,
    drop column if exists avg_speed_kmh,
    drop column if exists max_speed_kmh,
    drop column if exists avg_rpm,
    drop column if exists max_rpm,
    drop column if exists avg_altitude,
    drop column if exists max_altitude;
end $$;
