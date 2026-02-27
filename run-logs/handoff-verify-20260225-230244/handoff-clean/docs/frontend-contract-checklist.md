# Frontend Contract Checklist (Backend QA)

Mark each item as pass before connecting frontend.

## Setup

- [ ] Supabase schema applied from `supabase/schema.sql`
- [ ] First admin exists in `profiles` and is assigned in `client_users`
- [ ] Backend env vars are configured (`SUPABASE_URL`, service key, anon key)

## Auth + Onboarding

- [ ] `GET /api/onboarding/status` returns `hasAdmin`, `hasClient`, `needsOnboarding`
- [ ] `POST /api/onboarding/bootstrap` works only when no admin exists
- [ ] `GET /api/me` returns `user`, `profile`, `clientIds`, `clients`
- [ ] `/api/me.profile.display_name` is present (snake_case key)

## Admin APIs

- [ ] `GET /api/admin/clients` returns `{ id, name, created_at }[]`
- [ ] `POST /api/admin/clients` creates client
- [ ] `GET /api/admin/users` returns `{ id, email, createdAt, role, displayName, clientIds }[]`
- [ ] `POST /api/admin/users` creates auth user + profile
- [ ] `GET /api/admin/assignments` returns `client_id` and `clients.name`
- [ ] `POST /api/admin/assignments` creates assignment
- [ ] `DELETE /api/admin/assignments/:id` returns 204

## Vehicles

- [ ] `GET /api/vehicles` returns camelCase vehicle fields
- [ ] `GET /api/vehicles/:id` returns one vehicle with camelCase fields
- [ ] `POST /api/vehicles` accepts frontend payload shape
- [ ] `PUT /api/vehicles/:id` updates vehicle
- [ ] `DELETE /api/vehicles/:id` returns 204

Required vehicle response fields:

- [ ] `id`
- [ ] `clientId`
- [ ] `assetId`
- [ ] `vehiclePlate`
- [ ] `driverName`
- [ ] `status`
- [ ] `currentFuelLevel`
- [ ] `tankCapacity`
- [ ] `fuelEfficiency`
- [ ] `efficiencyRating`
- [ ] `totalDistance`
- [ ] `totalEngineHours`
- [ ] `totalFuelUsed`
- [ ] `workingDays`
- [ ] `parkingDays`
- [ ] `maintenanceStatus`
- [ ] `theftIncidents`
- [ ] `costPerKm`
- [ ] `systemReliability`
- [ ] `createdAt`
- [ ] `updatedAt`

## Fuel Events

- [ ] `GET /api/fuel-events` supports `vehicleId`, `vehicleIds`, `eventType`, `startDate`, `endDate`, `clientId`
- [ ] `POST /api/fuel-events` accepts frontend payload
- [ ] `PUT /api/fuel-events/:id` updates event
- [ ] `DELETE /api/fuel-events/:id` returns 204

Required fuel event response fields:

- [ ] `id`
- [ ] `vehicleId`
- [ ] `eventType`
- [ ] `volumeLiters`
- [ ] `costKES`
- [ ] `costUGX`
- [ ] `location`
- [ ] `notes`
- [ ] `eventTimestamp`
- [ ] `createdAt`

## Daily Metrics

- [ ] `GET /api/daily-metrics` supports date and vehicle filters
- [ ] `POST /api/daily-metrics` creates metric row
- [ ] Response uses camelCase metric fields

Required daily metric response fields:

- [ ] `id`
- [ ] `vehicleId`
- [ ] `metricDate`
- [ ] `totalFuelConsumed`
- [ ] `totalDistanceTraveled`
- [ ] `totalEngineHours`
- [ ] `idleTimeHours`
- [ ] `numberOfRefills`
- [ ] `numberOfThefts`
- [ ] `operatingCostKES`
- [ ] `operatingCostUGX`
- [ ] `createdAt`

## Dashboard + Charts

- [ ] `GET /api/dashboard/kpis` returns all KPI fields:
- [ ] `totalVehicles`, `activeVehicles`, `totalRefills`, `totalThefts`
- [ ] `totalFuelUsed`, `totalDistance`, `totalEngineHours`
- [ ] `fleetUtilization`, `lastUpdated`
- [ ] `POST /api/charts/fuel-consumption` returns `[{ date, value }]`
- [ ] `POST /api/charts/performance-metrics` returns `[{ date, value }]`

## Reports

- [ ] `GET /api/reports/generate` works for `daily-movement` and `fuel-temperature`
- [ ] `format=preview` returns JSON (not file)
- [ ] `format=excel|csv|pdf` returns downloadable binary
- [ ] Daily movement preview includes `reports[]` with `assetDescription`, `registrationNumber`, `movements`, `totals`, `averages`
- [ ] Fuel-temperature preview includes summary fields and `refuelEvents[]`, `rawSensorData[]`

## Access Control

- [ ] Non-admin can only see records for assigned `client_users.client_id`
- [ ] Admin can query by `clientId/client_id`
- [ ] Admin-only routes reject non-admin with 403

## Query Compatibility

- [ ] Endpoints accept camel query keys (`startDate`, `endDate`, `vehicleIds`, `clientId`)
- [ ] Endpoints also accept snake query keys (`start_date`, `end_date`, `vehicle_ids`, `client_id`)
