# Telemetry Ingestion Platform V1 (100% Supabase)

This deployment uses Supabase Edge Functions + Postgres staging to ingest Teletrac payloads and process them into application tables.

## Step-by-Step Deployment Guide

#### Part 1: Database (Supabase SQL Editor)
1. Run `supabase/migrations/20260222000000_telemetry_ingestion.sql`.
2. Run `supabase/migrations/20260222000001_seed_mappings.sql`.
3. Run `supabase/migrations/20260222133000_fix_dmr_raw_inbound_upsert_conflict.sql`.
4. Run `supabase/migrations/20260222174000_fuel_report_name_and_vehicle_sync.sql`.
5. Run `supabase/migrations/20260222191000_imei_key_and_fuel_normalized_tables.sql`.
6. Run `supabase/migrations/20260222200000_strict_uuid_unification_and_assetid_strategy.sql`.
7. Run `supabase/migrations/20260223193000_trip137_and_worker_hardening.sql`.

#### Part 2: Functions (Terminal)
1. Run `npx supabase login`.
2. Ensure function JWT verification is disabled for webhook/cron access by keeping this in `supabase/config.toml`:
   ```toml
   [functions.ingest-telemetry]
   verify_jwt = false

   [functions.process-telemetry]
   verify_jwt = false
   ```
3. Deploy both functions:
   ```powershell
   npx supabase functions deploy ingest-telemetry --project-ref pkduhowdqvymmvboyivt
   npx supabase functions deploy process-telemetry --project-ref pkduhowdqvymmvboyivt
   ```

#### Part 3: Secrets and Automation
1. Set webhook secret:
   ```powershell
   npx supabase secrets set WEBHOOK_SECRET="teletrac_super_secret_2026" --project-ref pkduhowdqvymmvboyivt
   ```
2. Set processor secret (recommended for production):
   ```powershell
   npx supabase secrets set PROCESS_SECRET="set_a_long_random_secret_here" --project-ref pkduhowdqvymmvboyivt
   ```
   If you set `PROCESS_SECRET`, update the cron URL to include `?secret=...` (otherwise cron calls will be rejected).
3. Run `supabase/migrations/20260222122000_schedule_process_telemetry_cron.sql` in SQL Editor.
4. If you prefer manual SQL instead of the migration, enable heartbeat worker (every minute):
   ```sql
   create extension if not exists pg_net;

   select cron.schedule(
     'process-telemetry-cron',
     '* * * * *',
     $$ select net.http_post('https://pkduhowdqvymmvboyivt.supabase.co/functions/v1/process-telemetry?secret=set_a_long_random_secret_here', '{}', '{}') $$
   );
   ```

#### Part 4: Run Processor Immediately (Optional)
If ingestion is already receiving data, trigger one processing run now:
```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://pkduhowdqvymmvboyivt.supabase.co/functions/v1/process-telemetry?secret=set_a_long_random_secret_here" `
  -Headers @{ "X-Process-Secret" = "set_a_long_random_secret_here" } `
  -ContentType "application/json" `
  -Body "{}"
```

Check pipeline state in SQL Editor:
```sql
select status, count(*) from raw_telemetry_inbound group by status order by status;

select id, source, report_type, attempt_count, last_error
from raw_telemetry_inbound
where status in ('pending', 'processing', 'failed', 'dead_letter')
order by received_at desc
limit 20;
```

## Reset Derived Tables And Rebuild From Raw
This keeps `raw_telemetry_inbound` as source of truth, clears derived tables, resets raw rows to `pending`, then replays processing.

```powershell
python .\reset_rebuild_from_raw.py
```

Optional (keep existing vehicles):

```powershell
python .\reset_rebuild_from_raw.py --keep-vehicles
```

## Ingest Vehicle Profile CSV Into Raw Telemetry
If vehicle profile payloads are not yet arriving in raw staging, load your CSV with the same JSON field names:

```powershell
python .\ingest_vehicle_profiles_csv.py --csv .\vehicle_profiles.csv --process
```

This posts one payload to `ingest-telemetry`:
- `source = teletrac`
- `report_type = 50`
- `data = [<csv rows>]`

## Final Connection Details
- Teletrac webhook URL (URL-only setup): `https://pkduhowdqvymmvboyivt.supabase.co/functions/v1/ingest-telemetry?secret=teletrac_super_secret_2026`
- Optional header mode (for custom clients): `X-Webhook-Secret: teletrac_super_secret_2026`

## Fuel Report Naming Convention (`report_type = 50`)
Use `payload_json.report_name` in compact positional format (recommended):

`<imei_number>|<client_name>|<assigned_asset_static>`

Example:

`359744090123456|Acme Transport|KDA123A`

Alternative (also supported):

`IMEI=359744090123456|CLIENT=Acme Transport|ASSET=KDA123A`

Processing behavior:
- Extracts details from `payload_json.report_name`.
- Uses IMEI as the primary vehicle-mapping key.
- For Teletrac (`report_type = 50`), maps `asset_id` to IMEI.
- For other sources, keep using their provided source `asset_id` strategy.
- Saves the full value to `trip_reports.report_name`.
- Saves extracted parts to:
  - `trip_reports.source_imei`
  - `trip_reports.client_name`
  - `trip_reports.source_assigned_asset`
- Backfills `registration_number`, `asset_description`, and `client_name` when missing.
- Auto-creates/links a `vehicles` row using IMEI first, then assigned asset fallback.
- Identity source of truth is `vehicles` (no separate asset-registry table).
- Writes normalized rows to:
  - `fuel_temperature_reports`
  - `fuel_events`
  - `raw_sensor_data`

## Fuel Summary Report (`report_type = 147`)
- `payload_json.data[]` is treated as per-vehicle summary rows.
- Vehicles are upserted/updated from this report (including new vehicles).
- IMEI and client are attached per vehicle from payload when present, with `vehicles` fallback by asset.
- Freshness gate:
  - updates are applied only when incoming `generated_date` is newer than `vehicles.last_summary_generated_at`
  - older report rows are ignored and do not overwrite newer vehicle state.
- For report 50 payloads with nested details:
  - `raw_sensor_data` is populated from `payload_json.data.telemetry`
  - `fuel_events` is populated from `payload_json.data.refill_details.refills` and `payload_json.data.drain_details.drains`
  - both `fuel_events` and `raw_sensor_data` carry `imei_number`, `client_name`, `registration_number`, and `vehicle_id`
  - `raw_sensor_data` telemetry columns are preserved from source payload:
    - `af`, `telemetry_id` (source `id`), `rf`, `alt`, `hrs`, `ign`, `odo`, `rpm`, `date`, `spid`
  - `daily_metrics` is populated from `payload_json.data.summary`:
    - fuel used, distance, engine hours, refill count, drain count
  - plus identity fields: `raw_inbound_id`, `imei_number`, `client_name`, `registration_number`, `vehicle_id`
  - uniqueness rule: one row per `metric_day + imei_number` (fallback `metric_day + vehicle_id` when IMEI missing)
  - telemetry-derived daily columns populated:
    - fuel level open/close
    - odometer open/close
    - summary metrics: `fuel_economy_km_l`, `total_refilled_l`, `total_drained_l`
  - refill/drain detail fields are explicit:
    - counts: `refill_count`, `drain_count`
    - totals (litres): `total_refilled_l`, `total_drained_l`

## Fuel Trip Listing Report (`report_type = 137`)
- `payload_json.data[]` is treated as many trip rows.
- Each trip row is written to `trip_reports` (not collapsed into one row).
- Idempotency key for a trip row is `raw_inbound_id + source_trip_key`.
- For each trip row:
  - IMEI is extracted from item/payload
  - vehicle is linked or created through `sync_vehicle_from_fuel_report`
  - identity fields are stored: `source_imei`, `client_name`, `source_assigned_asset`, `vehicle_id`
  - movement fields are mapped: start/end time, duration, distance, speed, fuel used, start/end location

Trip table to query:
- `public.trip_reports`
- `report_type=137` rows are identified by `raw_inbound_id` linked to `raw_telemetry_inbound.report_type='137'`
- per-trip idempotency key is `source_trip_key`
- if older rows were processed before trip support, run migration `20260223212000_trip137_backfill_and_repair.sql` to rebuild trips from raw payloads

## Realtime Position Report (`report_type = 0`)
- This high-frequency stream is handled by a built-in fast path in `process-telemetry`.
- No mapping row is required for type `0`.
- For each inbound row:
  - IMEI is read from `payload_json.Imei`.
  - `GPSDate` (`DD/MM/YYYY HH:MM:SS`) is parsed and used as freshness gate.
  - Vehicle is resolved/created via `sync_vehicle_from_fuel_report`.
  - `vehicles` is updated only when incoming GPS timestamp is newer than current `last_gps_at`.
- Latest state columns maintained on `vehicles`:
  - `last_gps_at`, `last_engine_hours`, `last_ignition_on`, `last_speed_kmh`
  - `last_driver_id`, `last_latitude`, `last_longitude`, `last_odometer_km`
  - `last_road_name`, `last_event_name`, `last_event_id`
  - `source_last_raw_inbound_id`

## Processor Hardening
- `process-telemetry` now supports optional secret auth:
  - header: `X-Process-Secret`
  - query param: `?secret=...`
- If `PROCESS_SECRET` is set, calls without a valid secret are rejected with `401`.
- Worker run observability tables:
  - `ingestion_processing_runs`
  - `ingestion_processing_failures`
- Automatic cleanup of worker logs runs daily via `purge_old_ingestion_worker_logs(30)`.

## Raw Sensor Data (Clean Columns)
- `raw_sensor_data` now keeps telemetry-native values for report 50:
  - `af`, `telemetry_id`, `rf`, `alt`, `hrs`, `ign`, `odo`, `rpm`, `date`, `spid`
- Identity/links retained:
  - `temperature_report_id`, `raw_inbound_id`, `vehicle_id`
  - `imei_number`, `client_name`, `registration_number`, `payload`, `created_at`
- Removed duplicate generic columns:
  - `timestamp`, `fuel`, `altitude`, `odometer`, `speed`, `temperature`
  - `sensor_name`, `sensor_value`, `sensor_unit`, `sensor_timestamp`

## Diagnostics SQL (Recommended)
Missing IMEI in raw staging:
```sql
select
  id,
  report_type,
  report_name,
  source_imei,
  payload_json ->> 'imei' as imei_from_payload
from public.raw_telemetry_inbound
where coalesce(source_imei, '') = ''
order by received_at desc
limit 50;
```

Fuel rows where IMEI does not match a vehicle:
```sql
select
  r.id,
  r.report_name,
  r.source_imei
from public.raw_telemetry_inbound r
left join public.vehicles v
  on public.normalize_imei(v.imei) = public.normalize_imei(r.source_imei)
where r.report_type = '50'
  and coalesce(r.source_imei, '') <> ''
  and v.id is null
order by r.received_at desc
limit 100;
```

Orphan check for normalized fuel reports:
```sql
select ftr.*
from public.fuel_temperature_reports ftr
left join public.vehicles v on ftr.vehicle_id::text = v.id::text
where ftr.vehicle_id is not null
  and v.id is null
limit 50;
```

## Test (PowerShell)
```powershell
$body = @{
    source = "test"
    report_type = "1"
    data = @(
        @{
            alert_name = "Test Alert"
            asset = "VEHICLE-001"
            date = "2026-02-22T12:00:00Z"
        }
    )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post `
    -Uri "https://pkduhowdqvymmvboyivt.supabase.co/functions/v1/ingest-telemetry?secret=teletrac_super_secret_2026" `
    -ContentType "application/json" `
    -Body $body
```

## 401 Troubleshooting
- Response body `{"code":401,"message":"Missing authorization header"}`:
  function is still deployed with JWT verification enabled. Recheck `supabase/config.toml` and redeploy.
- Response body `{"error":"Unauthorized"}`:
  `WEBHOOK_SECRET` in Supabase project secrets does not match the incoming query/header secret.

## Architecture Details
- `raw_telemetry_inbound` is the staging buffer.
- Payload deduplication uses SHA-256 hash.
- Processor supports batched payloads via `data` array unstacking.

