-- Ensure daily_movement_reports.raw_inbound_id can be used as an UPSERT conflict target.
-- Postgres unique constraints allow multiple NULLs, so this remains safe for older rows.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'daily_movement_reports'
  ) then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'daily_movement_reports_raw_inbound_id_key'
        and conrelid = 'public.daily_movement_reports'::regclass
    ) then
      alter table public.daily_movement_reports
        add constraint daily_movement_reports_raw_inbound_id_key unique (raw_inbound_id);
    end if;
  end if;
end $$;
