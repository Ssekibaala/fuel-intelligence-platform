# START HERE (Backend + Frontend Handoff)

Use this package as the single source for integration.

## 1) Frontend Team

1. Import `docs/postman.frontend-contract.collection.json` in Postman.
2. Review `docs/openapi.frontend-contract.yaml` for endpoint contracts.
3. Use `docs/frontend-contract-checklist.md` for QA validation.
4. Set your frontend API base URL to the backend URL shared by backend team.

## 2) Backend/Supabase Team

1. Apply DB schema:
   - Run `supabase/migrations/0001_all_in_one.sql` in Supabase SQL Editor.
   - Then run `supabase/migrations/20260226110000_drop_user_settings.sql`.
   - Then run `supabase/migrations/20260226123000_rename_daily_movement_reports_to_trip_reports.sql`.
   - Then run `supabase/migrations/20260226131000_trim_trip_reports_and_backfill_departure_date.sql`.

2. Deploy edge function:
   - `npx supabase link --project-ref pkduhowdqvymmvboyivt`
   - `npx supabase functions deploy process-telemetry --project-ref pkduhowdqvymmvboyivt`

3. Integrate API server code into your backend:
   - `api/routes.ts` + `auth.ts`, `storage.ts`, `reports.ts`, `supabase.ts`, `schema.ts`
   - These `.ts` files are source modules to integrate into an existing Node/Express backend; they are not a standalone runnable app by themselves.
   - Ensure dependencies exist (`express`, `exceljs`, `pdfkit`, `@supabase/supabase-js`, Node types).

4. Configure env vars:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`

5. Share final backend API base URL with frontend.

## 3) What Not To Share

- Never share production secrets or `.env` files in chat/email.
- Share only this handoff package zip.

## 4) Primary Reference Docs

- `README_SHARE.md` (handoff contents + simple setup)
- `README_DEPLOY.md` (detailed deployment/telemetry notes)
