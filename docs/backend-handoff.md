# Backend Handoff Pack (Frontend Contract)

This document is what you can share directly with anyone building the backend for this project.

## 1) Source Of Truth Files To Share

- `docs/openapi.frontend-contract.yaml` (contract spec)
- `docs/postman.frontend-contract.collection.json` (import directly into Postman)
- `docs/fixtures/*` (example request/response payloads per endpoint method)
- `docs/frontend-contract-checklist.md` (QA checklist)
- `frontend/server/routes.ts` (API behavior)
- `frontend/server/reports.ts` (report generation/preview behavior)
- `frontend/server/storage.ts` (DB-to-API field mapping)
- `frontend/server/auth.ts` (token auth + role checks)
- `supabase/schema.sql` (tables, indexes, RLS policies)
- `supabase/seed.sql` (first admin bootstrap helper)
- `supabase/demo_seed.sql` (optional sample data)
- `README.md` (active architecture notes)

Regenerate Postman + fixtures anytime with:

```bash
python scripts/generate_postman_and_fixtures.py
```

## 2) Architecture (Current Expected Shape)

- Active backend is `frontend/server` (not `backend/`).
- Frontend uses Supabase Auth access token in `Authorization: Bearer <token>`.
- API returns mostly `camelCase` objects to frontend.
- Database columns are `snake_case`.
- Tenant scope is enforced by user-to-client assignments in `client_users`.
- Admin-only routes are protected by role check (`profiles.role = "admin"`).

## 3) Environment Variables Required

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL` (optional when API is separate origin)

## 4) Supabase Setup Order

1. Run `supabase/schema.sql` in SQL Editor.
2. Create first admin user in Supabase Auth.
3. Run `supabase/seed.sql` (or use onboarding endpoint).
4. Optional: run `supabase/demo_seed.sql` to load sample fleet/report data.

## 5) Database Tables Frontend Depends On

- `clients`
- `profiles`
- `client_users`
- `vehicles`
- `fuel_events`
- `daily_metrics`
- `trip_reports`
- `fuel_temperature_reports`
- `refuel_events`
- `raw_sensor_data`

Optional-but-implemented API tables:

- `kpi_aggregates`

## 6) Exact API Data Expected By Frontend

## Auth + Onboarding

- `GET /api/onboarding/status`
  - Response:
  - `{ hasAdmin: boolean, hasClient: boolean, needsOnboarding: boolean }`

- `POST /api/onboarding/bootstrap`
  - Body:
  - `{ email, password, displayName?, clientName }`
  - Response:
  - `{ success: true, adminId, clientId, clientName }`

- `GET /api/me`
  - Response:
  - `{ user, profile, clientIds, clients }`
  - `profile` fields:
  - `{ id, role, display_name }` (note: `display_name` snake_case here is intentional and expected)

## Admin APIs

- `GET /api/admin/clients`
  - Response item:
  - `{ id, name, created_at }`

- `POST /api/admin/clients`
  - Response:
  - `405 Method Not Allowed`
  - Notes:
  - Manual client creation is disabled. Clients are auto-created from unique names in `vehicles.client_name` and only clients referenced by vehicles are returned.

- `GET /api/admin/users`
  - Response item:
  - `{ id, email, createdAt, role, displayName, clientIds }`

- `POST /api/admin/users`
  - Body:
  - `{ email, password, role, displayName?, clientIds? }`
  - Response:
  - `{ id, email }`

- `GET /api/admin/assignments`
  - Query:
  - `userId?`, `clientId?` (snake aliases also accepted)
  - Response item:
  - `{ id, user_id, client_id, clients?: { name } }`

- `POST /api/admin/assignments`
  - Body:
  - `{ userId, clientId }`
  - Response:
  - `{ id, user_id, client_id }`

- `DELETE /api/admin/assignments/:id`
  - Response: HTTP `204`

## Vehicles APIs

- `GET /api/vehicles`
  - Query:
  - `status?`, `efficiencyRating?`, `driverName?`, `clientId?`
  - Response item (`Vehicle`):
  - `{ id, clientId, assetId, vehiclePlate, driverName, status, currentFuelLevel, tankCapacity, fuelEfficiency, efficiencyRating, totalDistance, totalEngineHours, totalFuelUsed, workingDays, parkingDays, lastMaintenanceDate, maintenanceStatus, theftIncidents, costPerKm, systemReliability, createdAt, updatedAt }`

- `GET /api/vehicles/:id`
  - Response:
  - `Vehicle`

- `POST /api/vehicles`
  - Required body fields used by frontend:
  - `{ clientId, assetId, vehiclePlate, driverName, status, currentFuelLevel, tankCapacity, fuelEfficiency, efficiencyRating, systemReliability }`
  - Response:
  - `Vehicle`

- `PUT /api/vehicles/:id`
  - Body:
  - Partial `Vehicle` write payload
  - Response:
  - `Vehicle`

- `DELETE /api/vehicles/:id`
  - Response: HTTP `204`

## Fuel Events APIs

- `GET /api/fuel-events`
  - Query:
  - `vehicleId?`, `vehicleIds?` (comma list), `eventType?`, `startDate?`, `endDate?`, `clientId?`
  - Response item (`FuelEvent`):
  - `{ id, vehicleId, eventType, volumeLiters, costKES, costUGX, location, notes, eventTimestamp, createdAt }`

- `POST /api/fuel-events`
  - Required body fields used by frontend:
  - `{ vehicleId, eventType, volumeLiters }`
  - Optional:
  - `{ costKES, costUGX, location, notes, eventTimestamp }`
  - Response:
  - `FuelEvent`

- `PUT /api/fuel-events/:id`
  - Body:
  - Partial fuel event payload
  - Response:
  - `FuelEvent`

- `DELETE /api/fuel-events/:id`
  - Response: HTTP `204`

## Daily Metrics APIs

- `GET /api/daily-metrics`
  - Query:
  - `vehicleId?`, `vehicleIds?`, `startDate?`, `endDate?`
  - Response item (`DailyMetric`):
  - `{ id, vehicleId, metricDate, totalFuelConsumed, totalDistanceTraveled, totalEngineHours, idleTimeHours, numberOfRefills, numberOfThefts, operatingCostKES, operatingCostUGX, createdAt }`

- `POST /api/daily-metrics`
  - Body:
  - Daily metric payload matching fields above (minus `id`, `createdAt`)
  - Response:
  - `DailyMetric`

## Dashboard + Charts APIs

- `GET /api/dashboard/kpis`
  - Query:
  - `vehicleIds?`, `startDate?`, `endDate?`, `clientId?`
  - Response:
  - `{ totalVehicles, activeVehicles, totalRefills, totalThefts, totalFuelUsed, totalDistance, totalEngineHours, fleetUtilization, lastUpdated }`

- `POST /api/charts/fuel-consumption`
  - Body:
  - `{ vehicleIds?, dateRange? }`
  - Response:
  - `[{ date, value }]`

- `POST /api/charts/performance-metrics`
  - Body:
  - `{ vehicleIds?, dateRange? }`
  - Response:
  - `[{ date, value }]`

## Reports APIs

- `GET /api/reports/generate`
  - Required query:
  - `format`, `report_type`, `start_date`
  - Optional query:
  - `end_date`, `vehicle_id`, `vehicle_ids`, `client_id`, `asset_id`, `registration_number`, `asset_name`
  - Returns:
  - Preview JSON if `format=preview`
  - Binary file if `format=pdf|excel|csv`

- `GET /api/reports/preview-daily-movement/:date`
  - Response:
  - `{ date, companyName, reports[] }`
  - `reports[]` includes:
  - `{ assetDescription, registrationNumber, assetId, siteName, movements[], totals, averages }`

- `GET /api/reports/preview-fuel-temperature/:date`
  - Response:
  - `{ date, reportDate, reportTitle, assetName, fromDatetime, toDatetime, generatedOn, totalDistance, totalRefills, totalDrains, fuelUsed, fuelConsumption, refuelEvents[], rawSensorData[] }`

## 7) Naming Rules (Must Keep)

- Database column names: `snake_case`
- API response names to frontend: `camelCase` except admin assignments and `/api/me.profile.display_name` which are intentionally snake_case
- Support both query styles where already used:
  - `startDate` and `start_date`
  - `endDate` and `end_date`
  - `vehicleIds` and `vehicle_ids`
  - `clientId` and `client_id`

## 8) Auth + Access Rules (Must Keep)

- Any `/api/*` route requires Bearer token except:
  - `/api/onboarding/status`
  - `/api/onboarding/bootstrap`
- Non-admin users must only access their assigned clients’ data.
- Admin users may scope by `clientId/client_id`.

## 9) Common Breakages To Avoid

- Returning `snake_case` for vehicles/fuel_events/daily_metrics responses (frontend expects camelCase).
- Omitting `clientId` on vehicles (admin pages and reports filter by this).
- Returning empty `clientIds` in `/api/me` for users that are assigned in `client_users`.
- Report preview payload shape drift (`reports[]` object keys are used directly in report UI).

## 10) Acceptance Criteria

Use `docs/frontend-contract-checklist.md` as a pass/fail QA list before handing backend to frontend.

