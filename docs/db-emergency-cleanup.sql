-- ============================================================================
-- Supabase free-tier quota recovery: raw_telemetry_inbound / raw_sensor_data
-- ============================================================================
--
-- Context: database size is over the 0.5 GB free-tier limit, so requests are
-- being rejected with HTTP 402. The two growth drivers are:
--
--   raw_telemetry_inbound  - one row per inbound webhook payload, kept forever.
--                            report0 rows additionally carry a `RawData` hex
--                            blob (the raw Teltonika codec packet) that nothing
--                            in this codebase ever reads.
--   raw_sensor_data        - report50 exploded into ~1000 rows per vehicle/day.
--
-- RUN THE STEPS IN ORDER. Step 1 is read-only; run it first and use the numbers
-- to decide the retention cutoffs in step 2 before deleting anything.
--
-- IMPORTANT — why this order:
--   * DELETE frees rows logically but does NOT shrink the database on disk.
--     Only VACUUM FULL (step 3) returns space to the filesystem.
--   * Do the DELETEs BEFORE stripping RawData. Stripping is an UPDATE, and in
--     Postgres every UPDATE writes a new row version — running it across the
--     whole table would temporarily roughly DOUBLE space usage, which is the
--     last thing you want while already over quota. Delete first, reclaim, then
--     strip only what remains.
--   * VACUUM FULL takes an ACCESS EXCLUSIVE lock (table unreadable while it
--     runs) and needs free space roughly equal to the table it is rewriting.
--     Do one table at a time.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 — MEASURE (read-only, safe to run any time)
-- ----------------------------------------------------------------------------

-- 1a. Biggest relations, so you can confirm the two suspects really are the problem.
select
  n.nspname                                          as schema,
  c.relname                                          as table_name,
  pg_size_pretty(pg_total_relation_size(c.oid))      as total_size,
  pg_size_pretty(pg_relation_size(c.oid))            as heap_size,
  pg_size_pretty(pg_indexes_size(c.oid))             as index_size,
  c.reltuples::bigint                                as approx_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname not in ('pg_catalog', 'information_schema')
order by pg_total_relation_size(c.oid) desc
limit 15;

-- 1b. How raw_telemetry_inbound breaks down by report type and age.
--     `payload_bytes` is the dominant cost - note how much of it is report0.
select
  report_type,
  count(*)                                                   as rows,
  pg_size_pretty(sum(pg_column_size(payload_json))::bigint)  as payload_bytes,
  min(received_at)                                           as oldest,
  max(received_at)                                           as newest
from raw_telemetry_inbound
group by report_type
order by sum(pg_column_size(payload_json)) desc nulls last;

-- 1c. How much of that is the never-read RawData blob.
--     If this comes back large, it is pure waste.
select
  count(*)                                                                as report0_rows,
  pg_size_pretty(sum(pg_column_size(payload_json))::bigint)               as total_payload,
  pg_size_pretty(sum(pg_column_size(payload_json -> 'RawData'))::bigint)  as rawdata_only
from raw_telemetry_inbound
where report_type = '0'
  and payload_json ? 'RawData';

-- 1d. raw_sensor_data volume by month, to pick a retention cutoff.
select
  date_trunc('month', recorded_at) as month,
  count(*)                         as rows
from raw_sensor_data
group by 1
order by 1;


-- ----------------------------------------------------------------------------
-- STEP 2 — DELETE (destructive; review cutoffs against step 1 output first)
-- ----------------------------------------------------------------------------
--
-- If you want a downloadable backup before deleting, stop here and instead run:
--     npm run archive:telemetry
-- from frontend/ - it gzip-exports both tables and can delete after archiving
-- (defaults: 30 days inbound, 90 days sensor data).
--
-- Delete in batches rather than one huge statement: a single multi-million-row
-- DELETE builds an enormous transaction and can time out or exhaust WAL space.

-- 2a. report0 staging rows. These are the biggest win and the safest to drop:
--     report0 is only ever used to refresh vehicle_live_state, and the pipeline
--     already purges them on its own (see purgeOldReport0Rows in
--     supabase/functions/process-telemetry/index.ts). Nothing reads old ones.
--     Repeat until it reports 0 rows deleted.
with doomed as (
  select id
  from raw_telemetry_inbound
  where report_type = '0'
    and received_at < now() - interval '3 days'
  limit 50000
)
delete from raw_telemetry_inbound t
using doomed d
where t.id = d.id;

-- 2b. Remaining report payloads (50/137/147) beyond your retention window.
--     These are far fewer rows, but report50 payloads are individually fat
--     (~1000 telemetry samples each), so they still add up.
--     Adjust '30 days' to taste based on step 1b.
with doomed as (
  select id
  from raw_telemetry_inbound
  where report_type <> '0'
    and received_at < now() - interval '30 days'
  limit 20000
)
delete from raw_telemetry_inbound t
using doomed d
where t.id = d.id;

-- 2c. Exploded sensor rows beyond retention. Adjust '90 days' based on step 1d
--     and on how far back your fuel charts actually need to go.
with doomed as (
  select id
  from raw_sensor_data
  where recorded_at < now() - interval '90 days'
  limit 50000
)
delete from raw_sensor_data t
using doomed d
where t.id = d.id;


-- ----------------------------------------------------------------------------
-- STEP 3 — RECLAIM (this is the step that actually shrinks the database)
-- ----------------------------------------------------------------------------
--
-- Run these ONE AT A TIME, not inside a transaction, and not during a traffic
-- peak - each locks its table completely for the duration.
-- Supabase's reported database size can lag by up to an hour afterwards.

vacuum full analyze raw_telemetry_inbound;

vacuum full analyze raw_sensor_data;


-- ----------------------------------------------------------------------------
-- STEP 4 — STRIP THE DEAD BLOB (only after steps 2-3 have freed space)
-- ----------------------------------------------------------------------------
--
-- `RawData` is the raw Teltonika codec packet. Verified by grep: it is not read
-- anywhere in frontend/server or supabase/functions. Removing it is invisible
-- to the application.
--
-- Batched, because each UPDATE writes a new row version. Repeat until it
-- reports 0 rows, then VACUUM again to reclaim what the rewrite left behind.
with target as (
  select id
  from raw_telemetry_inbound
  where payload_json ? 'RawData'
  limit 20000
)
update raw_telemetry_inbound t
set payload_json = t.payload_json - 'RawData'
from target
where t.id = target.id;

vacuum full analyze raw_telemetry_inbound;


-- ----------------------------------------------------------------------------
-- STEP 5 — VERIFY
-- ----------------------------------------------------------------------------
select pg_size_pretty(pg_database_size(current_database())) as database_size;

-- Re-run step 1a to confirm the two tables have actually shrunk on disk.
