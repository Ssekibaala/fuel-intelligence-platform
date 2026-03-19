# Fuel Intelligence Platform

This repo contains a full-stack fleet intelligence platform with a Supabase backend and an integrated Express + Vite server.

## Architecture (Option 2)
- **API + App Server:** `frontend/server` (Express)  
- **Client:** `frontend/client` (React + Vite in middleware mode)  
- **Database/Auth:** Supabase  
- **Legacy folder:** `backend/` is no longer used

## Setup
1. **Create a Supabase project**
2. **Apply the full database setup**
   - Run `supabase/migrations/0001_all_in_one.sql` in Supabase SQL Editor
   - Then run:
     - `supabase/migrations/20260226110000_drop_user_settings.sql`
     - `supabase/migrations/20260226123000_rename_daily_movement_reports_to_trip_reports.sql`
     - `supabase/migrations/20260226131000_trim_trip_reports_and_backfill_departure_date.sql`
   - Do not use `supabase/schema.sql` for telemetry ingestion setup; that file is app-schema-only and does not install the ingestion worker pipeline
3. **Deploy the Supabase edge function**
   - `npx supabase link --project-ref <your-project-ref>`
   - `npx supabase functions deploy ingest-telemetry --project-ref <your-project-ref>`
   - `npx supabase functions deploy process-telemetry --project-ref <your-project-ref>`
4. **Create your first admin**
   - Create a user in Supabase Auth, then run `supabase/seed.sql` with your user ID
5. **Create environment file**
   - Copy `frontend/.env.example` to `frontend/.env`
   - Fill in your Supabase keys:
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `SUPABASE_ANON_KEY`
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`

## Run (Dev)
```bash
cd frontend
npm install
npm run dev


npm --prefix frontend install
npm --prefix frontend run dev

```

The app and API will run on the same port (default `3000`).

## Go Live Immediately (Free)
### Option A: Instant public URL (in 1-2 minutes)
Use a quick tunnel from your local machine while the app is running:

```bash
npm --prefix frontend run dev
npx cloudflared tunnel --url http://localhost:3000
```

This gives you a public URL instantly (great for demos/UAT).  
Keep your terminal running while sharing.

### Option B: Free hosted deployment (Render)
This repo includes `render.yaml` for one-click setup.

1. Push this repo to GitHub.
2. In Render, create a new Blueprint service from the repo.
3. Set these env vars in Render:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `DATABASE_URL`
4. Leave `VITE_API_BASE_URL` empty (same-domain API).
5. Deploy.

Render will build from `frontend/` and serve both API + frontend from one service.

## Admin Panel
Admins can:
- Create client accounts
- Create user accounts
- Assign users to clients
- Manage vehicles and fuel events

Client users will only see data for their assigned clients.

## Production Notes
- Keep the **service role key** server-side only.
- Use `VITE_API_BASE_URL` only if you deploy the API separately.
- Enable RLS in Supabase if you allow direct client queries.
  - The ingestion-ready setup is the consolidated migration at `supabase/migrations/0001_all_in_one.sql`.

## Duplicate Cleanup (Recommended)
If you already have duplicate telemetry rows, run:

`frontend/DEDUPE_AND_UNIQUES.sql`

in Supabase SQL Editor. It does two things:
- Removes existing duplicates in `trip_reports`, `daily_metrics`, `fuel_events`, and `raw_sensor_data`
- Adds uniqueness indexes so duplicates are blocked going forward
