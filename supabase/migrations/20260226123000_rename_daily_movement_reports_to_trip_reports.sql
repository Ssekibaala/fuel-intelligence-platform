-- Rename daily movement report storage to trip_reports.
-- Safe to run multiple times.

do $$
begin
  if to_regclass('public.trip_reports') is null
     and to_regclass('public.daily_movement_reports') is not null then
    alter table public.daily_movement_reports rename to trip_reports;
  end if;
end $$;

-- Keep ingestion mappings aligned with the new canonical table name.
do $$
begin
  if to_regclass('public.ingestion_mappings') is not null then
    update public.ingestion_mappings
    set target_table = 'trip_reports'
    where target_table = 'daily_movement_reports';
  end if;
end $$;
