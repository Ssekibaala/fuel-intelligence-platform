-- Ensure telemetry worker cron exists and points to process-telemetry edge function.

create extension if not exists pg_net;
create extension if not exists pg_cron;
-- Remove existing schedule with same name to keep this migration idempotent.
do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'process-telemetry-cron' loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;
select cron.schedule(
  'process-telemetry-cron',
  '* * * * *',
  $$ select net.http_post('https://pkduhowdqvymmvboyivt.supabase.co/functions/v1/process-telemetry', '{}', '{}') $$
);
