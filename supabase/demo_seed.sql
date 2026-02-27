-- Demo seed data for Fuel Intelligence Platform
-- Run this in Supabase SQL Editor to populate useful sample data.

create extension if not exists "pgcrypto";

-- Optional cleanup (uncomment if you want to re-seed demo data)
-- delete from daily_metrics where vehicle_id in (select id from vehicles where asset_id like 'DEMO-TRK-%');
-- delete from fuel_events where vehicle_id in (select id from vehicles where asset_id like 'DEMO-TRK-%');
-- delete from vehicles where asset_id like 'DEMO-TRK-%';

-- Ensure demo client exists
insert into clients (name)
select 'Demo Logistics'
where not exists (select 1 from clients where name = 'Demo Logistics');

-- Assign first admin to demo client (no-op if no admin exists)
insert into client_users (client_id, user_id)
select c.id, p.id
from clients c
join lateral (
  select id from profiles where role = 'admin' order by created_at limit 1
) p on true
where c.name = 'Demo Logistics'
on conflict do nothing;

-- Insert demo vehicles
insert into vehicles (
  id,
  client_id,
  asset_id,
  vehicle_plate,
  driver_name,
  status,
  current_fuel_level,
  tank_capacity,
  fuel_efficiency,
  efficiency_rating,
  total_distance,
  total_engine_hours,
  total_fuel_used,
  working_days,
  parking_days,
  last_maintenance_date,
  maintenance_status,
  theft_incidents,
  cost_per_km,
  system_reliability
)
select
  gen_random_uuid()::text,
  c.id,
  v.asset_id,
  v.vehicle_plate,
  v.driver_name,
  v.status,
  v.current_fuel_level,
  v.tank_capacity,
  v.fuel_efficiency,
  v.efficiency_rating,
  v.total_distance,
  v.total_engine_hours,
  v.total_fuel_used,
  v.working_days,
  v.parking_days,
  v.last_maintenance_date,
  v.maintenance_status,
  v.theft_incidents,
  v.cost_per_km,
  v.system_reliability
from clients c
cross join (values
  ('DEMO-TRK-001', 'KCF-234M', 'Alex Kato', 'Active', 180::real, 300::real, 25::real, 'Good', 2847::real, 156::real, 342::real, 22, 8, now() - interval '12 days', 'Next week', 0, 15.5::real, 'Excellent'),
  ('DEMO-TRK-002', 'NAR-567B', 'Brian Okello', 'Idle', 95::real, 280::real, 28::real, 'Good', 2210::real, 140::real, 410::real, 18, 12, now() - interval '20 days', 'Next week', 0, 16.2::real, 'Good'),
  ('DEMO-TRK-003', 'SEM-346L', 'John Wambua', 'Maintenance', 60::real, 300::real, 32::real, 'Poor', 1990::real, 190::real, 520::real, 16, 14, now() - interval '35 days', 'Overdue', 1, 17.1::real, 'Warning'),
  ('DEMO-TRK-004', 'UBG-003K', 'Sarah Achieng', 'Active', 210::real, 320::real, 22::real, 'Excellent', 3150::real, 170::real, 460::real, 24, 6, now() - interval '8 days', 'Next week', 0, 14.8::real, 'Excellent'),
  ('DEMO-TRK-005', 'KDA-886X', 'Peter Mwangi', 'Out of Service', 40::real, 260::real, 35::real, 'Poor', 1020::real, 90::real, 300::real, 10, 20, now() - interval '60 days', 'Overdue', 2, 18.6::real, 'Critical'),
  ('HOWO-UBG002K', 'UR6000X', 'Kasoona Hakim', 'Active', 220::real, 600::real, 28::real, 'Good', 1450::real, 90::real, 220::real, 12, 6, now() - interval '5 days', 'Next week', 0, 16.0::real, 'Good'),
  ('HOWO-UBG003K', 'UR6001X', 'Juma Alfred', 'Active', 210::real, 600::real, 27::real, 'Good', 1330::real, 85::real, 210::real, 12, 6, now() - interval '5 days', 'Next week', 0, 16.2::real, 'Good'),
  ('FAW-UBL433L', 'UG9090Q', 'Sarah Achieng', 'Idle', 190::real, 520::real, 30::real, 'Good', 1200::real, 70::real, 190::real, 10, 8, now() - interval '15 days', 'Next week', 0, 15.8::real, 'Good')
) as v(
  asset_id,
  vehicle_plate,
  driver_name,
  status,
  current_fuel_level,
  tank_capacity,
  fuel_efficiency,
  efficiency_rating,
  total_distance,
  total_engine_hours,
  total_fuel_used,
  working_days,
  parking_days,
  last_maintenance_date,
  maintenance_status,
  theft_incidents,
  cost_per_km,
  system_reliability
)
where c.name = 'Demo Logistics'
on conflict (asset_id) do nothing;

-- Insert daily metrics for last 14 days
insert into daily_metrics (
  id,
  vehicle_id,
  metric_date,
  total_fuel_consumed,
  total_distance_traveled,
  total_engine_hours,
  idle_time_hours,
  number_of_refills,
  number_of_thefts,
  operating_cost_kes,
  operating_cost_ugx
)
select
  gen_random_uuid()::text,
  v.id,
  (current_date - gs.day)::timestamp + time '08:00',
  round((stats.distance * v.fuel_efficiency / 100)::numeric, 2)::real,
  stats.distance,
  round((stats.distance / stats.avg_speed)::numeric, 2)::real,
  round((random() * 2)::numeric, 2)::real,
  case when random() > 0.85 then 1 else 0 end,
  case when random() > 0.95 then 1 else 0 end,
  round(((stats.distance * v.fuel_efficiency / 100) * 145)::numeric, 2)::real,
  round(((stats.distance * v.fuel_efficiency / 100) * 4000)::numeric, 2)::real
from vehicles v
cross join generate_series(0, 13) as gs(day)
cross join lateral (
  select
    round((80 + random() * 90)::numeric, 2)::real as distance,
    round((30 + random() * 20)::numeric, 2)::real as avg_speed
) stats
where v.asset_id like 'DEMO-TRK-%';

-- Insert fuel events (refills + thefts)
insert into fuel_events (
  id,
  vehicle_id,
  event_type,
  volume_liters,
  cost_kes,
  cost_ugx,
  location,
  notes,
  event_timestamp
)
select
  gen_random_uuid()::text,
  v.id,
  'refill',
  round((40 + random() * 30)::numeric, 2)::real,
  round(((40 + random() * 30) * 145)::numeric, 2)::real,
  round(((40 + random() * 30) * 4000)::numeric, 2)::real,
  'Nairobi Depot',
  'seed:demo',
  now() - interval '3 days'
from vehicles v
where v.asset_id like 'DEMO-TRK-%';

insert into fuel_events (
  id,
  vehicle_id,
  event_type,
  volume_liters,
  location,
  notes,
  event_timestamp
)
select
  gen_random_uuid()::text,
  v.id,
  'theft',
  round((12 + random() * 8)::numeric, 2)::real,
  'Route A-3',
  'seed:demo',
  now() - interval '2 days'
from vehicles v
where v.asset_id in ('DEMO-TRK-003', 'DEMO-TRK-005');

-- Refresh vehicle totals based on daily metrics
update vehicles v
set
  total_distance = m.total_distance,
  total_engine_hours = m.total_engine_hours,
  total_fuel_used = m.total_fuel_used,
  updated_at = now()
from (
  select
    vehicle_id,
    sum(total_distance_traveled) as total_distance,
    sum(total_engine_hours) as total_engine_hours,
    sum(total_fuel_consumed) as total_fuel_used
  from daily_metrics
  where vehicle_id in (select id from vehicles where asset_id like 'DEMO-TRK-%')
  group by vehicle_id
) m
where v.id = m.vehicle_id;

-- Set current fuel level to a realistic % of tank capacity
update vehicles
set
  current_fuel_level = round((tank_capacity * (0.2 + random() * 0.7))::numeric, 2)::real,
  updated_at = now()
where asset_id like 'DEMO-TRK-%';

-- ---------------------------------------------------------------------------
-- Reports: Daily Movement (sample rows)
-- ---------------------------------------------------------------------------
insert into trip_reports (
  id,
  report_date,
  client_id,
  vehicle_id,
  asset_description,
  registration_number,
  asset_id,
  site_name,
  departure_date,
  driver,
  departure_time,
  departed_from,
  driving_time,
  standing_time,
  distance_km,
  max_speed_kmh,
  arrival_time,
  arrived_at,
  next_departure,
  standing_time_at_location,
  fuel_used_litres
)
values
  (
    gen_random_uuid()::text,
    now() - interval '2 days',
    (select v.client_id from vehicles v where v.asset_id = 'HOWO-UBG002K' limit 1),
    (select v.id from vehicles v where v.asset_id = 'HOWO-UBG002K' limit 1),
    'HOWO-UBG002K',
    'UR6000X',
    1,
    'AOT Africa Ltd.',
    now() - interval '2 days' + interval '04:06:23',
    'Kasoona Hakim',
    now() - interval '2 days' + interval '04:06:23',
    'AT04, Kenya',
    '00:08:28',
    '00:00:00',
    2.41,
    55,
    now() - interval '2 days' + interval '04:14:51',
    'AT04, Kenya',
    now() - interval '2 days' + interval '04:22:00',
    '00027AR',
    0.37
  ),
  (
    gen_random_uuid()::text,
    now() - interval '2 days',
    (select v.client_id from vehicles v where v.asset_id = 'HOWO-UBG002K' limit 1),
    (select v.id from vehicles v where v.asset_id = 'HOWO-UBG002K' limit 1),
    'HOWO-UBG002K',
    'UR6000X',
    1,
    'AOT Africa Ltd.',
    now() - interval '2 days' + interval '04:30:12',
    'Kasoona Hakim',
    now() - interval '2 days' + interval '04:30:12',
    'JBN-JOF, AT04, Kenya',
    '00:02:29',
    '00:00:00',
    2.10,
    34,
    now() - interval '2 days' + interval '04:32:39',
    'JBN-JOF, AT04, Kenya',
    now() - interval '2 days' + interval '05:02:00',
    '00637-42',
    0.44
  ),
  (
    gen_random_uuid()::text,
    now() - interval '1 days',
    (select v.client_id from vehicles v where v.asset_id = 'HOWO-UBG003K' limit 1),
    (select v.id from vehicles v where v.asset_id = 'HOWO-UBG003K' limit 1),
    'HOWO-UBG003K',
    'UR6001X',
    2,
    'AOT Africa Ltd.',
    now() - interval '1 days' + interval '05:00:00',
    'Juma Alfred',
    now() - interval '1 days' + interval '05:00:00',
    'Nairobi Depot',
    '01:15:30',
    '00:10:00',
    15.50,
    65,
    now() - interval '1 days' + interval '06:15:30',
    'Kampala Hub',
    now() - interval '1 days' + interval '07:00:00',
    '00125AR',
    2.80
  ),
  (
    gen_random_uuid()::text,
    now() - interval '1 days',
    (select v.client_id from vehicles v where v.asset_id = 'FAW-UBL433L' limit 1),
    (select v.id from vehicles v where v.asset_id = 'FAW-UBL433L' limit 1),
    'FAW-UBL433L',
    'UG9090Q',
    3,
    'AOT Africa Ltd.',
    now() - interval '1 days' + interval '08:10:00',
    'Sarah Achieng',
    now() - interval '1 days' + interval '08:10:00',
    'Mombasa Yard',
    '00:48:10',
    '00:05:00',
    9.85,
    58,
    now() - interval '1 days' + interval '08:58:10',
    'Nairobi Hub',
    now() - interval '1 days' + interval '09:20:00',
    '00015AR',
    1.45
  );

-- ---------------------------------------------------------------------------
-- Reports: Fuel & Temperature (sample row + events + raw points)
-- ---------------------------------------------------------------------------
with report_vehicle as (
  select id, client_id
  from vehicles
  where asset_id = 'HOWO-UBG002K'
  limit 1
),
report_row as (
  insert into fuel_temperature_reports (
    id,
    report_date,
    client_id,
    vehicle_id,
    report_title,
    asset_name,
    from_datetime,
    to_datetime,
    generated_on,
    total_distance_km,
    total_refills_l,
    total_drains_l,
    fuel_used_l,
    fuel_consumption_km_l,
    data_points
  )
  select
    gen_random_uuid()::text,
    now() - interval '1 days',
    report_vehicle.client_id,
    report_vehicle.id,
    'Sensor / Fuel / Temperature',
    'HOWO-UBG002K',
    now() - interval '1 days' + interval '08:00',
    now() - interval '1 days' + interval '18:00',
    now() - interval '1 days' + interval '18:05',
    18.59,
    556.80,
    0.00,
    31.20,
    0.60,
    '[{"time":"08:00","fuel":540},{"time":"10:00","fuel":520},{"time":"12:00","fuel":597},{"time":"14:00","fuel":575},{"time":"16:00","fuel":560},{"time":"18:00","fuel":540}]'::json
  from report_vehicle
  returning id
)
insert into refuel_events (
  id,
  fuel_report_id,
  event_time,
  initial_fuel,
  final_fuel,
  refilled,
  location,
  latitude,
  longitude
)
select
  gen_random_uuid()::text,
  report_row.id,
  now() - interval '1 days' + interval '12:30:05',
  544.80,
  597.60,
  52.80,
  'Factory Close, Nitrida Industrial Area, Nakawa, Kampala',
  0.33567000,
  32.61635500
from report_row;

with report_row as (
  select id
  from fuel_temperature_reports
  order by created_at desc
  limit 1
)
insert into raw_sensor_data (
  id,
  fuel_report_id,
  timestamp,
  fuel,
  altitude,
  odometer,
  speed,
  temperature
)
select
  gen_random_uuid()::text,
  report_row.id,
  now() - interval '1 days' + (gs.minute || ' minutes')::interval,
  560 - (gs.minute * 0.8),
  1200 + (gs.minute * 0.5),
  18200 + (gs.minute * 0.3),
  45 + (random() * 10),
  28 + (random() * 4)
from report_row
cross join generate_series(0, 50, 10) as gs(minute);



