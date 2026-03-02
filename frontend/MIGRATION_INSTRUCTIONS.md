# Database Migration Required

I have implemented all the requested changes for the Fuel Summary Report (Type 147) integration:
1. Updated the **`vehicles` API schema** to include `refill_count`, `total_refill_volume`, `drain_count`, `total_drain_volume`.
2. Renamed `fuelEfficiency` to `consumptionKml` (or `consumption_kml`) across the Drizzle models, Supabase Edge Functions, and Next.js React frontend.
3. Updated the **Supabase `process-telemetry`** payload mapping so that "Today" reports correctly cache these summary values down to the `vehicles` table.
4. Refactored **`Dashboard.tsx`** and **`VehiclesPage.tsx`** to query these live summary fields directly from the `vehicles` response when the "Today" date filter is active.

## Action Required

The direct database push via `npm run db:push` is failing due to a DNS resolution block (`ENOTFOUND db.pkduhowdqvymmvboyivt...`) which typically means IPv4 is disabled for this Supabase project's direct connection string, and Docker is disabled locally.

Please execute the following SQL script directly in your **Supabase Dashboard SQL Editor** to complete the integration:

```sql
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS refill_count INT NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS total_refill_volume REAL NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS drain_count INT NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS total_drain_volume REAL NOT NULL DEFAULT 0;
ALTER TABLE vehicles RENAME COLUMN fuel_efficiency TO consumption_kml;
```

Once executed, restart your local application server (`npm run dev`) and test the ingestion trigger using your sample payload!
