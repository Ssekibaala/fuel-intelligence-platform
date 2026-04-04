-- Reduce telemetry worker frequency to cut Edge Function invocations.
-- This keeps the same job name and target but changes the cadence from every minute to every 5 minutes.

create extension if not exists pg_net;
create extension if not exists pg_cron;

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
  '*/5 * * * *',
  $$ select net.http_post('https://pkduhowdqvymmvboyivt.supabase.co/functions/v1/process-telemetry', '{}', '{}') $$
);
