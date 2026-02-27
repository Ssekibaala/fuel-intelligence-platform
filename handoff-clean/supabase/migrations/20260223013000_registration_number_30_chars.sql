-- Standardize registration number capacity to 30 characters.
-- Applies to report-related tables that expose/store registration_number.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_movement_reports'
      and column_name = 'registration_number'
  ) then
    alter table public.daily_movement_reports
      alter column registration_number type varchar(30)
      using case when registration_number is null then null else left(registration_number::text, 30) end;
  end if;
end $$;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fuel_temperature_reports'
      and column_name = 'registration_number'
  ) then
    alter table public.fuel_temperature_reports
      alter column registration_number type varchar(30)
      using case when registration_number is null then null else left(registration_number::text, 30) end;
  end if;
end $$;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'refuel_events'
      and column_name = 'registration_number'
  ) then
    alter table public.refuel_events
      alter column registration_number type varchar(30)
      using case when registration_number is null then null else left(registration_number::text, 30) end;
  end if;
end $$;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'raw_sensor_data'
      and column_name = 'registration_number'
  ) then
    alter table public.raw_sensor_data
      alter column registration_number type varchar(30)
      using case when registration_number is null then null else left(registration_number::text, 30) end;
  end if;
end $$;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_metrics'
      and column_name = 'registration_number'
  ) then
    alter table public.daily_metrics
      alter column registration_number type varchar(30)
      using case when registration_number is null then null else left(registration_number::text, 30) end;
  end if;
end $$;
