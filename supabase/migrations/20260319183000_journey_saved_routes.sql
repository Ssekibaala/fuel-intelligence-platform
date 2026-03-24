create extension if not exists pgcrypto;

create table if not exists public.journey_saved_routes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  departure_location text not null,
  destination_location text not null,
  filters_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_archived boolean not null default false,
  constraint journey_saved_routes_name_nonempty check (char_length(btrim(name)) > 0),
  constraint journey_saved_routes_departure_nonempty check (char_length(btrim(departure_location)) > 0),
  constraint journey_saved_routes_destination_nonempty check (char_length(btrim(destination_location)) > 0)
);

create index if not exists idx_journey_saved_routes_created_by
  on public.journey_saved_routes (created_by, is_archived, updated_at desc);

create index if not exists idx_journey_saved_routes_client_id
  on public.journey_saved_routes (client_id, is_archived, updated_at desc);

create index if not exists idx_journey_saved_routes_pair
  on public.journey_saved_routes (departure_location, destination_location, is_archived);

alter table public.journey_saved_routes enable row level security;

