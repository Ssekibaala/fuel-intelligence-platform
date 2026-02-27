# Deploy Guide (Handoff-Clean)

This guide matches the files that actually exist in this package.

## Included deploy artifacts
- `supabase/migrations/0001_all_in_one.sql`
- `supabase/functions/ingest-telemetry/index.ts`
- `supabase/functions/process-telemetry/index.ts`
- `supabase/functions/public-api/index.ts`
- `supabase/functions/import_map.json`
- `supabase/config.toml`

## 1) Database migration
Run this single SQL file in Supabase SQL Editor:

`supabase/migrations/0001_all_in_one.sql`

## 2) Deploy functions
From the extracted `handoff-clean/` directory:

```powershell
npx supabase login
npx supabase link --project-ref pkduhowdqvymmvboyivt
npx supabase functions deploy ingest-telemetry --project-ref pkduhowdqvymmvboyivt
npx supabase functions deploy process-telemetry --project-ref pkduhowdqvymmvboyivt
npx supabase functions deploy public-api --project-ref pkduhowdqvymmvboyivt
```

## 3) Set required secrets
Set secrets on the target Supabase project:

```powershell
npx supabase secrets set WEBHOOK_SECRET="set_a_strong_webhook_secret" --project-ref pkduhowdqvymmvboyivt
npx supabase secrets set PROCESS_SECRET="set_a_strong_process_secret" --project-ref pkduhowdqvymmvboyivt
```

Optional for browser-auth API behavior (`public-api`):
- Ensure project has valid `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in function runtime.

## 4) Function behavior summary
- `ingest-telemetry`:
  - Receives inbound webhook payloads.
  - Stores rows in `raw_telemetry_inbound`.
- `process-telemetry`:
  - Reads pending rows from `raw_telemetry_inbound`.
  - Normalizes into `vehicles`, `daily_metrics`, `daily_movement_reports`, `fuel_temperature_reports`, `fuel_events`, `raw_sensor_data`, etc.
- `public-api`:
  - Frontend-facing API host.
  - Supports auth via Supabase Bearer access token.
  - Supports report preview and CSV export (`format=preview`, `format=csv`).

## 5) Public endpoints
Base URL:

`https://pkduhowdqvymmvboyivt.supabase.co/functions/v1/public-api`

Common routes:
- `GET /health`
- `GET /api/me`
- `GET /api/vehicles`
- `GET /api/dashboard/kpis`
- `GET /api/reports/generate`

## 6) Notes
- This package intentionally uses one migration file (`0001_all_in_one.sql`).
- Do not look for timestamped migration files in this handoff; they were consolidated.
- Use `START_HERE.md` for team handoff flow and `README_SHARE.md` for package contents.
