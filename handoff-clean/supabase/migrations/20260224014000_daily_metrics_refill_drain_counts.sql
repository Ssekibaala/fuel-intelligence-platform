-- Add explicit refill/drain counts for daily_metrics and backfill from existing columns.

do $$
begin
  if to_regclass('public.daily_metrics') is null then
    return;
  end if;

  alter table public.daily_metrics
    add column if not exists refill_count integer,
    add column if not exists drain_count integer;

  update public.daily_metrics
  set
    refill_count = coalesce(refill_count, number_of_refills, 0),
    drain_count = coalesce(drain_count, number_of_thefts, 0)
  where refill_count is null
     or drain_count is null;
end $$;
create index if not exists idx_daily_metrics_refill_count
  on public.daily_metrics(refill_count);
create index if not exists idx_daily_metrics_drain_count
  on public.daily_metrics(drain_count);
