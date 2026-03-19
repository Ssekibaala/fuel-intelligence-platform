-- Trip reports cleanup + departure_date backfill.
-- Safe to run multiple times.

-- 1) Ensure canonical table name.
do $$
begin
  if to_regclass('public.trip_reports') is null
     and to_regclass('public.daily_movement_reports') is not null then
    alter table public.daily_movement_reports rename to trip_reports;
  end if;
end $$;

-- 2) Ensure ingestion mappings point to canonical table.
do $$
begin
  if to_regclass('public.ingestion_mappings') is not null then
    update public.ingestion_mappings
    set target_table = 'trip_reports'
    where target_table = 'daily_movement_reports';
  end if;
end $$;

-- 3) Backfill departure_date from departure_time/report_date when missing.
do $$
begin
  if to_regclass('public.trip_reports') is not null then
    update public.trip_reports
    set departure_date = date_trunc('day', coalesce(departure_time, report_date))
    where departure_date is null
      and coalesce(departure_time, report_date) is not null;
  end if;
end $$;

-- 4) Keep departure_date populated for future inserts/updates.
create or replace function public.trip_reports_set_departure_date()
returns trigger
language plpgsql
as $$
begin
  if new.departure_date is null then
    if new.departure_time is not null then
      new.departure_date := date_trunc('day', new.departure_time);
    elsif new.report_date is not null then
      new.departure_date := date_trunc('day', new.report_date);
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.trip_reports') is not null then
    drop trigger if exists trip_reports_departure_date_trigger on public.trip_reports;
    create trigger trip_reports_departure_date_trigger
    before insert or update on public.trip_reports
    for each row execute function public.trip_reports_set_departure_date();
  end if;
end $$;

-- 5) Remove unused columns from trip_reports.
alter table if exists public.trip_reports
  drop column if exists company_name,
  drop column if exists from_date,
  drop column if exists to_date,
  drop column if exists is_total_row,
  drop column if exists is_average_row;
