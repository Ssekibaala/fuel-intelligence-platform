-- Track freshness for report_type=147 vehicle summary updates.

do $$
begin
  if to_regclass('public.vehicles') is null then
    return;
  end if;

  alter table public.vehicles
    add column if not exists last_summary_generated_at timestamptz,
    add column if not exists source_summary_report_id bigint,
    add column if not exists source_summary_payload jsonb;
end $$;
create index if not exists idx_vehicles_last_summary_generated_at
  on public.vehicles(last_summary_generated_at desc);
