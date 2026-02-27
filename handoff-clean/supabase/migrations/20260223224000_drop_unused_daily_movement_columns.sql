-- Remove unused columns from daily_movement_reports to keep schema clean.

alter table if exists public.daily_movement_reports
  drop column if exists site_name,
  drop column if exists asset_id,
  drop column if exists standing_time,
  drop column if exists next_departure,
  drop column if exists standing_time_at_location;
