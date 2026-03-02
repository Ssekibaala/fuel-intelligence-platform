-- Database Migration for Fuel Summary Metrics
-- Copy and paste this ENTIRE file into the Supabase SQL Editor

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS refill_count INT NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS total_refill_volume REAL NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS drain_count INT NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS total_drain_volume REAL NOT NULL DEFAULT 0;
ALTER TABLE vehicles RENAME COLUMN fuel_efficiency TO consumption_kml;
