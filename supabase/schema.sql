-- Supabase schema for Fuel Platform
-- Run this in the Supabase SQL Editor for a fresh project

create extension if not exists "pgcrypto";

-- Clients (tenants)
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamp not null default now()
);

-- User profiles (linked to auth.users)
create table if not exists profiles (
  id uuid primary key,
  role text not null default 'client',
  display_name text,
  created_at timestamp not null default now()
);

-- Client-user assignments
create table if not exists client_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  user_id uuid not null,
  created_at timestamp not null default now(),
  unique (client_id, user_id)
);

-- Core vehicles table
create table if not exists vehicles (
  id varchar primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  asset_id text not null unique,
  vehicle_plate text not null,
  driver_name text not null,
  status text not null,
  current_fuel_level real not null,
  tank_capacity real,
  fuel_efficiency real,
  efficiency_rating text not null,
  total_distance real,
  total_engine_hours real,
  total_fuel_used real,
  working_days integer not null default 0,
  parking_days integer not null default 0,
  last_maintenance_date timestamp,
  maintenance_status text not null default 'Next week',
  theft_incidents integer not null default 0,
  cost_per_km real not null default 15.5,
  system_reliability text not null default 'Excellent',
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

-- Fuel events
create table if not exists fuel_events (
  id varchar primary key default gen_random_uuid(),
  vehicle_id varchar not null references vehicles(id) on delete cascade,
  event_type text not null,
  volume_liters real not null,
  cost_kes real,
  cost_ugx real,
  location text,
  notes text,
  event_timestamp timestamp not null default now(),
  created_at timestamp not null default now()
);

-- Daily metrics
create table if not exists daily_metrics (
  id varchar primary key default gen_random_uuid(),
  vehicle_id varchar references vehicles(id) on delete set null,
  metric_date timestamp not null,
  total_fuel_consumed real not null default 0,
  total_distance_traveled real not null default 0,
  total_engine_hours real not null default 0,
  idle_time_hours real not null default 0,
  number_of_refills integer not null default 0,
  number_of_thefts integer not null default 0,
  operating_cost_kes real not null default 0,
  operating_cost_ugx real not null default 0,
  created_at timestamp not null default now()
);

-- KPI aggregates
create table if not exists kpi_aggregates (
  id varchar primary key default gen_random_uuid(),
  vehicle_id varchar references vehicles(id) on delete set null,
  range_start timestamp not null,
  range_end timestamp not null,
  aggregate_scope text not null,
  total_engine_hours real not null default 0,
  total_distance real not null default 0,
  total_fuel_used real not null default 0,
  system_reliability_score real not null default 85.2,
  total_refills integer not null default 0,
  total_refill_volume real not null default 0,
  total_fuel_thefts integer not null default 0,
  total_theft_volume real not null default 0,
  average_efficiency real not null default 0,
  fleet_utilization real not null default 0,
  total_operating_cost_kes real not null default 0,
  total_operating_cost_ugx real not null default 0,
  created_at timestamp not null default now()
);

-- Report tables
create table if not exists trip_reports (
  id varchar primary key default gen_random_uuid(),
  report_date timestamp not null,
  client_id uuid references clients(id),
  vehicle_id varchar references vehicles(id),
  asset_description varchar(100),
  registration_number varchar(20),
  asset_id integer,
  site_name varchar(100) default 'ADT Africa Ltd.',
  departure_date timestamp,
  driver varchar(100),
  departure_time timestamp,
  departed_from text,
  driving_time text,
  standing_time text,
  distance_km decimal(10,6),
  max_speed_kmh integer,
  arrival_time timestamp,
  arrived_at text,
  next_departure timestamp,
  standing_time_at_location text,
  fuel_used_litres decimal(10,2),
  created_at timestamp not null default now()
);

create table if not exists fuel_temperature_reports (
  id varchar primary key default gen_random_uuid(),
  report_date timestamp not null,
  client_id uuid references clients(id),
  vehicle_id varchar references vehicles(id),
  report_title varchar(255) default 'Sensor / Fuel / Temperature',
  asset_name varchar(100) default 'Howo Demo',
  from_datetime timestamp,
  to_datetime timestamp,
  generated_on timestamp,
  total_distance_km decimal(10,2),
  total_refills_l decimal(10,2),
  total_drains_l decimal(10,2),
  fuel_used_l decimal(10,2),
  fuel_consumption_km_l decimal(10,2),
  data_points json,
  created_at timestamp not null default now()
);

create table if not exists refuel_events (
  id varchar primary key default gen_random_uuid(),
  fuel_report_id varchar references fuel_temperature_reports(id) on delete set null,
  event_time timestamp,
  initial_fuel decimal(10,2),
  final_fuel decimal(10,2),
  refilled decimal(10,2),
  location text,
  latitude decimal(10,8),
  longitude decimal(11,8),
  created_at timestamp not null default now()
);

create table if not exists raw_sensor_data (
  id varchar primary key default gen_random_uuid(),
  fuel_report_id varchar references fuel_temperature_reports(id) on delete set null,
  timestamp timestamp,
  fuel decimal(10,2),
  altitude decimal(10,2),
  odometer decimal(10,2),
  speed decimal(10,2),
  temperature decimal(5,2),
  created_at timestamp not null default now()
);

-- Recommended indexes
create index if not exists idx_vehicles_client_id on vehicles(client_id);
create index if not exists idx_fuel_events_vehicle_id on fuel_events(vehicle_id);
create index if not exists idx_daily_metrics_vehicle_id on daily_metrics(vehicle_id);
create index if not exists idx_client_users_user_id on client_users(user_id);
create index if not exists idx_client_users_client_id on client_users(client_id);
create index if not exists idx_trip_reports_client_id on trip_reports(client_id);
create index if not exists idx_trip_reports_vehicle_id on trip_reports(vehicle_id);
create index if not exists idx_fuel_temperature_reports_client_id on fuel_temperature_reports(client_id);
create index if not exists idx_fuel_temperature_reports_vehicle_id on fuel_temperature_reports(vehicle_id);

-- Diagnostics view for missing report links
create or replace view report_link_gaps as
select
  'daily_movement'::text as report_type,
  id as report_id,
  report_date,
  asset_description as asset_label,
  registration_number,
  vehicle_id,
  client_id
from trip_reports
where vehicle_id is null or client_id is null
union all
select
  'fuel_temperature'::text as report_type,
  id as report_id,
  report_date,
  asset_name as asset_label,
  null::varchar as registration_number,
  vehicle_id,
  client_id
from fuel_temperature_reports
where vehicle_id is null or client_id is null;

-- Auto-populate report links on insert/update
create or replace function public.populate_daily_movement_links()
returns trigger
language plpgsql
as $$
begin
  if new.vehicle_id is null or new.client_id is null then
    select v.id, v.client_id
    into new.vehicle_id, new.client_id
    from vehicles v
    where (new.registration_number is not null and v.vehicle_plate = new.registration_number)
       or (new.asset_description is not null and v.asset_id = new.asset_description)
    limit 1;
  end if;

  if new.client_id is null and new.vehicle_id is not null then
    select v.client_id
    into new.client_id
    from vehicles v
    where v.id = new.vehicle_id;
  end if;

  return new;
end;
$$;

create or replace function public.populate_fuel_temperature_links()
returns trigger
language plpgsql
as $$
begin
  if new.vehicle_id is null or new.client_id is null then
    select v.id, v.client_id
    into new.vehicle_id, new.client_id
    from vehicles v
    where (new.asset_name is not null and v.asset_id = new.asset_name)
       or (new.asset_name is not null and v.vehicle_plate = new.asset_name)
    limit 1;
  end if;

  if new.client_id is null and new.vehicle_id is not null then
    select v.client_id
    into new.client_id
    from vehicles v
    where v.id = new.vehicle_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trip_reports_link_trigger on trip_reports;
create trigger trip_reports_link_trigger
before insert or update on trip_reports
for each row execute function public.populate_daily_movement_links();

drop trigger if exists fuel_temperature_reports_link_trigger on fuel_temperature_reports;
create trigger fuel_temperature_reports_link_trigger
before insert or update on fuel_temperature_reports
for each row execute function public.populate_fuel_temperature_links();

-- Optional: enable RLS and deny direct anon access (service role bypasses RLS)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

alter table clients enable row level security;
alter table vehicles enable row level security;
alter table fuel_events enable row level security;
alter table daily_metrics enable row level security;
alter table kpi_aggregates enable row level security;
alter table client_users enable row level security;
alter table profiles enable row level security;
alter table trip_reports enable row level security;
alter table fuel_temperature_reports enable row level security;
alter table refuel_events enable row level security;
alter table raw_sensor_data enable row level security;

-- Profiles
create policy "profiles_select" on profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_insert" on profiles
  for insert with check (id = auth.uid() or public.is_admin());
create policy "profiles_update" on profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Clients
create policy "clients_select" on clients
  for select using (
    public.is_admin()
    or exists (
      select 1 from client_users cu
      where cu.client_id = clients.id and cu.user_id = auth.uid()
    )
  );
create policy "clients_admin_write" on clients
  for all using (public.is_admin()) with check (public.is_admin());

-- Client users
create policy "client_users_select" on client_users
  for select using (public.is_admin() or user_id = auth.uid());
create policy "client_users_admin_write" on client_users
  for all using (public.is_admin()) with check (public.is_admin());

-- Vehicles
create policy "vehicles_select" on vehicles
  for select using (
    public.is_admin()
    or exists (
      select 1 from client_users cu
      where cu.client_id = vehicles.client_id and cu.user_id = auth.uid()
    )
  );
create policy "vehicles_admin_write" on vehicles
  for all using (public.is_admin()) with check (public.is_admin());

-- Fuel events
create policy "fuel_events_select" on fuel_events
  for select using (
    public.is_admin()
    or exists (
      select 1
      from vehicles v
      join client_users cu on cu.client_id = v.client_id
      where v.id = fuel_events.vehicle_id and cu.user_id = auth.uid()
    )
  );
create policy "fuel_events_admin_write" on fuel_events
  for all using (public.is_admin()) with check (public.is_admin());

-- Daily metrics
create policy "daily_metrics_select" on daily_metrics
  for select using (
    public.is_admin()
    or exists (
      select 1
      from vehicles v
      join client_users cu on cu.client_id = v.client_id
      where v.id = daily_metrics.vehicle_id and cu.user_id = auth.uid()
    )
  );
create policy "daily_metrics_admin_write" on daily_metrics
  for all using (public.is_admin()) with check (public.is_admin());

-- KPI aggregates
create policy "kpi_aggregates_select" on kpi_aggregates
  for select using (
    public.is_admin()
    or exists (
      select 1
      from vehicles v
      join client_users cu on cu.client_id = v.client_id
      where v.id = kpi_aggregates.vehicle_id and cu.user_id = auth.uid()
    )
  );
create policy "kpi_aggregates_admin_write" on kpi_aggregates
  for all using (public.is_admin()) with check (public.is_admin());

-- Reports (client-aware selects, admin writes)
create policy "trip_reports_select" on trip_reports
  for select using (
    public.is_admin()
    or exists (
      select 1 from client_users cu
      where cu.client_id = trip_reports.client_id and cu.user_id = auth.uid()
    )
  );
create policy "trip_reports_admin" on trip_reports
  for all using (public.is_admin()) with check (public.is_admin());

create policy "fuel_temperature_reports_select" on fuel_temperature_reports
  for select using (
    public.is_admin()
    or exists (
      select 1 from client_users cu
      where cu.client_id = fuel_temperature_reports.client_id and cu.user_id = auth.uid()
    )
  );
create policy "fuel_temperature_reports_admin" on fuel_temperature_reports
  for all using (public.is_admin()) with check (public.is_admin());

create policy "refuel_events_select" on refuel_events
  for select using (
    public.is_admin()
    or exists (
      select 1
      from fuel_temperature_reports fr
      join client_users cu on cu.client_id = fr.client_id
      where fr.id = refuel_events.fuel_report_id and cu.user_id = auth.uid()
    )
  );
create policy "refuel_events_admin" on refuel_events
  for all using (public.is_admin()) with check (public.is_admin());

create policy "raw_sensor_data_select" on raw_sensor_data
  for select using (
    public.is_admin()
    or exists (
      select 1
      from fuel_temperature_reports fr
      join client_users cu on cu.client_id = fr.client_id
      where fr.id = raw_sensor_data.fuel_report_id and cu.user_id = auth.uid()
    )
  );
create policy "raw_sensor_data_admin" on raw_sensor_data
  for all using (public.is_admin()) with check (public.is_admin());

