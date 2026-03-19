-- Harden report_type=50 processing around IMEI as the primary mapping key.
-- This migration is additive and idempotent.

create extension if not exists pgcrypto;
create or replace function public.normalize_imei(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  if p_value is null then
    return null;
  end if;

  v_digits := regexp_replace(trim(p_value), '[^0-9]', '', 'g');
  if v_digits = '' then
    return null;
  end if;

  return v_digits;
end;
$$;
create or replace function public.extract_imei_from_report_name(p_report_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_parts text[];
  v_part text;
  v_key text;
  v_val text;
begin
  if p_report_name is null or btrim(p_report_name) = '' then
    return null;
  end if;

  v_parts := string_to_array(p_report_name, '|');
  foreach v_part in array v_parts loop
    if strpos(v_part, '=') > 0 then
      v_key := lower(regexp_replace(split_part(v_part, '=', 1), '[^a-z0-9]', '', 'g'));
      v_val := btrim(split_part(v_part, '=', 2));
      if v_key in ('imei', 'imeinumber', 'imeino') then
        return public.normalize_imei(v_val);
      end if;
    elsif strpos(v_part, ':') > 0 then
      v_key := lower(regexp_replace(split_part(v_part, ':', 1), '[^a-z0-9]', '', 'g'));
      v_val := btrim(split_part(v_part, ':', 2));
      if v_key in ('imei', 'imeinumber', 'imeino') then
        return public.normalize_imei(v_val);
      end if;
    end if;
  end loop;

  return public.normalize_imei(split_part(p_report_name, '|', 1));
end;
$$;
create or replace function public.extract_client_from_report_name(p_report_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_parts text[];
  v_part text;
  v_key text;
  v_val text;
begin
  if p_report_name is null or btrim(p_report_name) = '' then
    return null;
  end if;

  v_parts := string_to_array(p_report_name, '|');
  foreach v_part in array v_parts loop
    if strpos(v_part, '=') > 0 then
      v_key := lower(regexp_replace(split_part(v_part, '=', 1), '[^a-z0-9]', '', 'g'));
      v_val := btrim(split_part(v_part, '=', 2));
      if v_key in ('client', 'clientname', 'customer', 'company') and v_val <> '' then
        return v_val;
      end if;
    elsif strpos(v_part, ':') > 0 then
      v_key := lower(regexp_replace(split_part(v_part, ':', 1), '[^a-z0-9]', '', 'g'));
      v_val := btrim(split_part(v_part, ':', 2));
      if v_key in ('client', 'clientname', 'customer', 'company') and v_val <> '' then
        return v_val;
      end if;
    end if;
  end loop;

  if array_length(v_parts, 1) >= 2 and btrim(v_parts[2]) <> '' then
    return btrim(v_parts[2]);
  end if;

  return null;
end;
$$;
create or replace function public.extract_asset_from_report_name(p_report_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_parts text[];
  v_part text;
  v_key text;
  v_val text;
begin
  if p_report_name is null or btrim(p_report_name) = '' then
    return null;
  end if;

  v_parts := string_to_array(p_report_name, '|');
  foreach v_part in array v_parts loop
    if strpos(v_part, '=') > 0 then
      v_key := lower(regexp_replace(split_part(v_part, '=', 1), '[^a-z0-9]', '', 'g'));
      v_val := btrim(split_part(v_part, '=', 2));
      if v_key in ('asset', 'assignedasset', 'assignedassetstatic', 'registration', 'registrationnumber', 'reg', 'regnumber') and v_val <> '' then
        return v_val;
      end if;
    elsif strpos(v_part, ':') > 0 then
      v_key := lower(regexp_replace(split_part(v_part, ':', 1), '[^a-z0-9]', '', 'g'));
      v_val := btrim(split_part(v_part, ':', 2));
      if v_key in ('asset', 'assignedasset', 'assignedassetstatic', 'registration', 'registrationnumber', 'reg', 'regnumber') and v_val <> '' then
        return v_val;
      end if;
    end if;
  end loop;

  if array_length(v_parts, 1) >= 3 and btrim(v_parts[3]) <> '' then
    return btrim(v_parts[3]);
  end if;

  return null;
end;
$$;
create or replace function public.extract_imei_from_payload(p_payload jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_imei text;
begin
  if p_payload is null then
    return null;
  end if;

  v_imei := coalesce(
    p_payload ->> 'imei',
    p_payload ->> 'imei_number',
    p_payload ->> 'imeiNumber',
    p_payload #>> '{device,imei}',
    p_payload #>> '{data,0,imei}',
    p_payload #>> '{data,0,imei_number}',
    p_payload #>> '{data,0,imeiNumber}'
  );

  return public.normalize_imei(v_imei);
end;
$$;
alter table if exists public.raw_telemetry_inbound
  add column if not exists source_imei text;
create index if not exists idx_raw_telemetry_inbound_source_imei
  on public.raw_telemetry_inbound(source_imei);
create index if not exists idx_raw_telemetry_inbound_payload_hash
  on public.raw_telemetry_inbound(payload_hash);
update public.raw_telemetry_inbound r
set source_imei = coalesce(
  r.source_imei,
  public.extract_imei_from_payload(r.payload_json),
  public.extract_imei_from_report_name(r.report_name),
  public.extract_imei_from_report_name(r.payload_json ->> 'report_name')
)
where r.source_imei is null;
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vehicles'
  ) then
    alter table public.vehicles add column if not exists imei text;
  end if;
end $$;
do $$
declare
  v_has_asset_id boolean;
  v_has_vehicle_plate boolean;
begin
  if to_regclass('public.vehicles') is null or to_regclass('public.fuel_report_asset_registry') is null then
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'asset_id'
  ) into v_has_asset_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'vehicle_plate'
  ) into v_has_vehicle_plate;

  if v_has_asset_id then
    update public.vehicles v
    set imei = public.normalize_imei(fr.imei_number)
    from public.fuel_report_asset_registry fr
    where v.imei is null
      and fr.imei_number is not null
      and fr.assigned_asset is not null
      and v.asset_id = fr.assigned_asset;
  end if;

  if v_has_vehicle_plate then
    update public.vehicles v
    set imei = public.normalize_imei(fr.imei_number)
    from public.fuel_report_asset_registry fr
    where v.imei is null
      and fr.imei_number is not null
      and fr.assigned_asset is not null
      and v.vehicle_plate = fr.assigned_asset;
  end if;
end $$;
do $$
declare
  v_has_dups boolean := false;
begin
  if to_regclass('public.vehicles') is null then
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'imei'
  ) then
    return;
  end if;

  select exists (
    select 1
    from (
      select public.normalize_imei(imei) as normalized_imei, count(*) as c
      from public.vehicles
      where imei is not null and btrim(imei) <> ''
      group by public.normalize_imei(imei)
      having count(*) > 1
    ) d
  ) into v_has_dups;

  if v_has_dups then
    if to_regclass('public.idx_vehicles_imei_lookup') is null then
      execute $sql$create index idx_vehicles_imei_lookup on public.vehicles ((public.normalize_imei(imei))) where imei is not null and btrim(imei) <> ''$sql$;
    end if;
  else
    if to_regclass('public.idx_vehicles_imei_unique') is null then
      execute $sql$create unique index idx_vehicles_imei_unique on public.vehicles ((public.normalize_imei(imei))) where imei is not null and btrim(imei) <> ''$sql$;
    end if;
  end if;
end $$;
create index if not exists idx_fuel_report_asset_registry_imei_number
  on public.fuel_report_asset_registry((public.normalize_imei(imei_number)));
do $$
declare
  v_vehicle_id_type text := 'text';
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicles'
      and column_name = 'id'
  ) then
    select format_type(a.atttypid, a.atttypmod)
    into v_vehicle_id_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'vehicles'
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;
  end if;

  execute format(
    'create table if not exists public.fuel_temperature_reports (
      id uuid primary key default gen_random_uuid(),
      raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null,
      vehicle_id %s,
      imei_number text,
      client_name text,
      registration_number text,
      report_name text,
      report_type text not null default ''50'',
      report_timestamp timestamptz,
      source_payload jsonb not null default ''{}''::jsonb,
      created_at timestamptz not null default now(),
      unique(raw_inbound_id)
    )',
    v_vehicle_id_type
  );

  execute format(
    'create table if not exists public.refuel_events (
      id uuid primary key default gen_random_uuid(),
      temperature_report_id text,
      raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null,
      vehicle_id %s,
      event_timestamp timestamptz,
      fuel_volume_litres numeric,
      odometer_km numeric,
      location text,
      payload jsonb not null default ''{}''::jsonb,
      created_at timestamptz not null default now()
    )',
    v_vehicle_id_type
  );

  execute format(
    'create table if not exists public.raw_sensor_data (
      id uuid primary key default gen_random_uuid(),
      temperature_report_id text,
      raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null,
      vehicle_id %s,
      sensor_name text not null,
      sensor_value text,
      sensor_unit text,
      sensor_timestamp timestamptz,
      payload jsonb not null default ''{}''::jsonb,
      created_at timestamptz not null default now()
    )',
    v_vehicle_id_type
  );
end $$;
do $$
declare
  v_vehicle_id_type text := 'text';
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicles'
      and column_name = 'id'
  ) then
    select format_type(a.atttypid, a.atttypmod)
    into v_vehicle_id_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'vehicles'
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;
  end if;

  if to_regclass('public.fuel_temperature_reports') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'raw_inbound_id'
    ) then
      alter table public.fuel_temperature_reports
        add column raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'vehicle_id'
    ) then
      execute format('alter table public.fuel_temperature_reports add column vehicle_id %s', v_vehicle_id_type);
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'imei_number'
    ) then
      alter table public.fuel_temperature_reports add column imei_number text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'client_name'
    ) then
      alter table public.fuel_temperature_reports add column client_name text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'registration_number'
    ) then
      alter table public.fuel_temperature_reports add column registration_number text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'report_name'
    ) then
      alter table public.fuel_temperature_reports add column report_name text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'report_type'
    ) then
      alter table public.fuel_temperature_reports add column report_type text default '50';
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'report_timestamp'
    ) then
      alter table public.fuel_temperature_reports add column report_timestamp timestamptz;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'source_payload'
    ) then
      alter table public.fuel_temperature_reports add column source_payload jsonb not null default '{}'::jsonb;
    end if;

    if not exists (
      select 1 from pg_constraint
      where conname = 'fuel_temperature_reports_raw_inbound_id_key'
        and conrelid = 'public.fuel_temperature_reports'::regclass
    ) then
      begin
        alter table public.fuel_temperature_reports
          add constraint fuel_temperature_reports_raw_inbound_id_key unique (raw_inbound_id);
      exception
        when others then null;
      end;
    end if;
  end if;

  if to_regclass('public.refuel_events') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'refuel_events' and column_name = 'temperature_report_id'
    ) then
      alter table public.refuel_events
        add column temperature_report_id text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'refuel_events' and column_name = 'raw_inbound_id'
    ) then
      alter table public.refuel_events
        add column raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'refuel_events' and column_name = 'vehicle_id'
    ) then
      execute format('alter table public.refuel_events add column vehicle_id %s', v_vehicle_id_type);
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'refuel_events' and column_name = 'payload'
    ) then
      alter table public.refuel_events add column payload jsonb not null default '{}'::jsonb;
    end if;
  end if;

  if to_regclass('public.raw_sensor_data') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'raw_sensor_data' and column_name = 'temperature_report_id'
    ) then
      alter table public.raw_sensor_data
        add column temperature_report_id text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'raw_sensor_data' and column_name = 'raw_inbound_id'
    ) then
      alter table public.raw_sensor_data
        add column raw_inbound_id uuid references public.raw_telemetry_inbound(id) on delete set null;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'raw_sensor_data' and column_name = 'vehicle_id'
    ) then
      execute format('alter table public.raw_sensor_data add column vehicle_id %s', v_vehicle_id_type);
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'raw_sensor_data' and column_name = 'payload'
    ) then
      alter table public.raw_sensor_data add column payload jsonb not null default '{}'::jsonb;
    end if;
  end if;
end $$;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'raw_inbound_id'
  ) then
    create index if not exists idx_fuel_temperature_reports_raw_inbound
      on public.fuel_temperature_reports(raw_inbound_id);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'vehicle_id'
  ) then
    create index if not exists idx_fuel_temperature_reports_vehicle_id
      on public.fuel_temperature_reports(vehicle_id);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fuel_temperature_reports' and column_name = 'imei_number'
  ) then
    create index if not exists idx_fuel_temperature_reports_imei_number
      on public.fuel_temperature_reports((public.normalize_imei(imei_number)));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'refuel_events' and column_name = 'temperature_report_id'
  ) then
    create index if not exists idx_refuel_events_temperature_report_id
      on public.refuel_events(temperature_report_id);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'refuel_events' and column_name = 'vehicle_id'
  ) then
    create index if not exists idx_refuel_events_vehicle_id
      on public.refuel_events(vehicle_id);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'raw_sensor_data' and column_name = 'temperature_report_id'
  ) then
    create index if not exists idx_raw_sensor_data_temperature_report_id
      on public.raw_sensor_data(temperature_report_id);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'raw_sensor_data' and column_name = 'vehicle_id'
  ) then
    create index if not exists idx_raw_sensor_data_vehicle_id
      on public.raw_sensor_data(vehicle_id);
  end if;
end $$;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'id'
      and data_type = 'uuid'
  ) then
    execute 'alter table public.profiles alter column id set default gen_random_uuid()';
  end if;
exception
  when undefined_table then null;
end $$;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'client_users'
      and column_name = 'id'
      and data_type = 'uuid'
  ) then
    execute 'alter table public.client_users alter column id set default gen_random_uuid()';
  end if;
exception
  when undefined_table then null;
end $$;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'telemetry_alerts'
      and column_name = 'report_id'
      and data_type = 'bigint'
  ) then
    create sequence if not exists public.telemetry_alerts_report_id_seq;
    alter table public.telemetry_alerts
      alter column report_id set default nextval('public.telemetry_alerts_report_id_seq');

    perform setval(
      'public.telemetry_alerts_report_id_seq',
      coalesce((select max(report_id) from public.telemetry_alerts where report_id is not null), 0) + 1,
      false
    );
  end if;
exception
  when undefined_table then null;
end $$;
create or replace function public.sync_vehicle_from_fuel_report(
  p_assigned_asset text,
  p_client_name text default null,
  p_imei_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset text := nullif(trim(p_assigned_asset), '');
  v_client text := nullif(trim(p_client_name), '');
  v_imei text := public.normalize_imei(p_imei_number);
  v_vehicle_id text;
  v_has_id boolean;
  v_has_imei boolean;
  v_has_asset_id boolean;
  v_has_vehicle_plate boolean;
  v_has_client_name boolean;
  v_has_company_name boolean;
  v_cols text[] := array[]::text[];
  v_vals text[] := array[]::text[];
  v_missing_required text[];
  v_col record;
  v_sql text;
begin
  if to_regclass('public.vehicles') is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'vehicles_table_missing');
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'id'
  ) into v_has_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'imei'
  ) into v_has_imei;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'asset_id'
  ) into v_has_asset_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'vehicle_plate'
  ) into v_has_vehicle_plate;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'client_name'
  ) into v_has_client_name;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'company_name'
  ) into v_has_company_name;

  if v_has_id and v_has_imei and v_imei is not null then
    execute 'select id::text from public.vehicles where public.normalize_imei(imei) = $1 limit 1'
      into v_vehicle_id
      using v_imei;
  end if;

  if v_vehicle_id is null and v_has_id and v_has_asset_id and v_asset is not null then
    execute 'select id::text from public.vehicles where asset_id = $1 limit 1'
      into v_vehicle_id
      using v_asset;
  end if;

  if v_vehicle_id is null and v_has_id and v_has_vehicle_plate and v_asset is not null then
    execute 'select id::text from public.vehicles where vehicle_plate = $1 limit 1'
      into v_vehicle_id
      using v_asset;
  end if;

  if v_vehicle_id is not null then
    if v_has_imei and v_imei is not null then
      execute 'update public.vehicles set imei = coalesce(imei, $1) where id::text = $2'
        using v_imei, v_vehicle_id;
    end if;

    if v_client is not null then
      if v_has_client_name then
        execute 'update public.vehicles set client_name = coalesce(client_name, $1) where id::text = $2'
          using v_client, v_vehicle_id;
      end if;
      if v_has_company_name then
        execute 'update public.vehicles set company_name = coalesce(company_name, $1) where id::text = $2'
          using v_client, v_vehicle_id;
      end if;
    end if;

    return jsonb_build_object('status', 'existing', 'vehicle_id', v_vehicle_id);
  end if;

  if v_asset is null and v_imei is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'missing_imei_and_asset');
  end if;

  for v_col in
    select column_name, udt_name, column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicles'
      and column_name in (
        'id',
        'asset_id',
        'vehicle_plate',
        'client_name',
        'company_name',
        'imei_number',
        'imei',
        'name',
        'vehicle_name'
      )
  loop
    if v_col.column_name = 'id' then
      if v_col.column_default is null then
        if v_col.udt_name = 'uuid' then
          v_cols := array_append(v_cols, 'id');
          v_vals := array_append(v_vals, 'gen_random_uuid()');
        else
          v_cols := array_append(v_cols, 'id');
          v_vals := array_append(v_vals, format('%L', coalesce(v_asset, v_imei)));
        end if;
      end if;
    elsif v_col.column_name = 'asset_id' and v_asset is not null then
      v_cols := array_append(v_cols, 'asset_id');
      v_vals := array_append(v_vals, format('%L', v_asset));
    elsif v_col.column_name = 'vehicle_plate' and v_asset is not null then
      v_cols := array_append(v_cols, 'vehicle_plate');
      v_vals := array_append(v_vals, format('%L', v_asset));
    elsif v_col.column_name = 'client_name' and v_client is not null then
      v_cols := array_append(v_cols, 'client_name');
      v_vals := array_append(v_vals, format('%L', v_client));
    elsif v_col.column_name = 'company_name' and v_client is not null then
      v_cols := array_append(v_cols, 'company_name');
      v_vals := array_append(v_vals, format('%L', v_client));
    elsif v_col.column_name = 'imei_number' and v_imei is not null then
      v_cols := array_append(v_cols, 'imei_number');
      v_vals := array_append(v_vals, format('%L', v_imei));
    elsif v_col.column_name = 'imei' and v_imei is not null then
      v_cols := array_append(v_cols, 'imei');
      v_vals := array_append(v_vals, format('%L', v_imei));
    elsif v_col.column_name = 'name' then
      v_cols := array_append(v_cols, 'name');
      v_vals := array_append(v_vals, format('%L', coalesce(v_asset, v_imei)));
    elsif v_col.column_name = 'vehicle_name' then
      v_cols := array_append(v_cols, 'vehicle_name');
      v_vals := array_append(v_vals, format('%L', coalesce(v_asset, v_imei)));
    end if;
  end loop;

  select array_agg(c.column_name order by c.ordinal_position)
  into v_missing_required
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'vehicles'
    and c.is_nullable = 'NO'
    and c.is_generated = 'NEVER'
    and coalesce(c.is_identity, 'NO') = 'NO'
    and c.column_default is null
    and not (c.column_name = any(v_cols));

  if coalesce(array_length(v_missing_required, 1), 0) > 0 then
    return jsonb_build_object(
      'status',
      'skipped',
      'reason',
      'vehicles_required_columns_missing',
      'columns',
      v_missing_required
    );
  end if;

  if coalesce(array_length(v_cols, 1), 0) = 0 then
    return jsonb_build_object('status', 'skipped', 'reason', 'vehicles_insert_columns_unavailable');
  end if;

  if v_has_id then
    v_sql := format(
      'insert into public.vehicles (%s) values (%s) returning id::text',
      array_to_string(v_cols, ','),
      array_to_string(v_vals, ',')
    );
    execute v_sql into v_vehicle_id;
  else
    v_sql := format(
      'insert into public.vehicles (%s) values (%s)',
      array_to_string(v_cols, ','),
      array_to_string(v_vals, ',')
    );
    execute v_sql;
    v_vehicle_id := null;
  end if;

  return jsonb_build_object('status', 'inserted', 'vehicle_id', v_vehicle_id);
exception
  when others then
    return jsonb_build_object('status', 'error', 'error', sqlerrm);
end;
$$;
