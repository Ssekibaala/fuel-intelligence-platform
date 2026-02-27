# START HERE (Backend + Frontend Handoff)

This package is ready for sharing.

## What this package contains
- `api/` server integration files
- `docs/` API contract and Postman collection
- `supabase/migrations/0001_all_in_one.sql` (single SQL file)
- `supabase/functions/ingest-telemetry/index.ts`
- `supabase/functions/process-telemetry/index.ts`
- `supabase/functions/public-api/index.ts`

## Important note
There is **no** top-level `index.ts` in `handoff-clean/`.
That is expected. Included `index.ts` files are Supabase Edge Functions at:
- `supabase/functions/ingest-telemetry/index.ts`
- `supabase/functions/process-telemetry/index.ts`
- `supabase/functions/public-api/index.ts`

## Share instructions
1. Unzip `frontend-backend-handoff-clean.zip`.
2. Frontend team uses:
   - `docs/openapi.frontend-contract.yaml`
   - `docs/postman.frontend-contract.collection.json`
3. Backend/Supabase team:
   - Runs `supabase/migrations/0001_all_in_one.sql`
   - Deploys `ingest-telemetry`
   - Deploys `process-telemetry`
   - Deploys `public-api`
   - Shares API base URL with frontend team
4. Frontend sets API base URL to that backend URL.
