-- Backfill report tables with vehicle_id and client_id
-- Run in Supabase SQL Editor with a role that can update report tables.
-- This script is idempotent and safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- Ensure columns exist (safe to re-run)
-- ---------------------------------------------------------------------------
alter table trip_reports
  add column if not exists client_id uuid,
  add column if not exists vehicle_id varchar;

alter table fuel_temperature_reports
  add column if not exists client_id uuid,
  add column if not exists vehicle_id varchar;

create index if not exists idx_trip_reports_client_id on trip_reports(client_id);
create index if not exists idx_trip_reports_vehicle_id on trip_reports(vehicle_id);
create index if not exists idx_fuel_temperature_reports_client_id on fuel_temperature_reports(client_id);
create index if not exists idx_fuel_temperature_reports_vehicle_id on fuel_temperature_reports(vehicle_id);

-- ---------------------------------------------------------------------------
-- Pre-check counts (before)
-- ---------------------------------------------------------------------------
select
  count(*) filter (where vehicle_id is null) as daily_missing_vehicle_id,
  count(*) filter (where client_id is null) as daily_missing_client_id
from trip_reports;

select
  count(*) filter (where vehicle_id is null) as fuel_missing_vehicle_id,
  count(*) filter (where client_id is null) as fuel_missing_client_id
from fuel_temperature_reports;

-- ---------------------------------------------------------------------------
-- Daily Movement: match by registration number -> vehicle_plate
-- ---------------------------------------------------------------------------
update trip_reports d
set vehicle_id = v.id,
    client_id = v.client_id
from vehicles v
where (d.vehicle_id is null or d.client_id is null)
  and d.registration_number is not null
  and v.vehicle_plate = d.registration_number;

-- Daily Movement: match by asset description -> asset_id
update trip_reports d
set vehicle_id = v.id,
    client_id = v.client_id
from vehicles v
where (d.vehicle_id is null or d.client_id is null)
  and d.asset_description is not null
  and v.asset_id = d.asset_description;

-- Daily Movement: fill missing client_id when vehicle_id already set
update trip_reports d
set client_id = v.client_id
from vehicles v
where d.client_id is null
  and d.vehicle_id = v.id;

-- ---------------------------------------------------------------------------
-- Fuel & Temperature: match by asset_name -> asset_id
-- ---------------------------------------------------------------------------
update fuel_temperature_reports f
set vehicle_id = v.id,
    client_id = v.client_id
from vehicles v
where (f.vehicle_id is null or f.client_id is null)
  and f.asset_name is not null
  and v.asset_id = f.asset_name;

-- Fuel & Temperature: match by asset_name -> vehicle_plate
update fuel_temperature_reports f
set vehicle_id = v.id,
    client_id = v.client_id
from vehicles v
where (f.vehicle_id is null or f.client_id is null)
  and f.asset_name is not null
  and v.vehicle_plate = f.asset_name;

-- Fuel & Temperature: fill missing client_id when vehicle_id already set
update fuel_temperature_reports f
set client_id = v.client_id
from vehicles v
where f.client_id is null
  and f.vehicle_id = v.id;

-- ---------------------------------------------------------------------------
-- Post-check counts (after)
-- ---------------------------------------------------------------------------
select
  count(*) filter (where vehicle_id is null) as daily_missing_vehicle_id,
  count(*) filter (where client_id is null) as daily_missing_client_id
from trip_reports;

select
  count(*) filter (where vehicle_id is null) as fuel_missing_vehicle_id,
  count(*) filter (where client_id is null) as fuel_missing_client_id
from fuel_temperature_reports;

commit;

