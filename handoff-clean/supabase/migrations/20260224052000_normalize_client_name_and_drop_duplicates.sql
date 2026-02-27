-- Normalize client naming across derived telemetry tables.
-- Canonical column name is client_name.

do $$
begin
  if to_regclass('public.daily_movement_reports') is not null then
    alter table public.daily_movement_reports
      add column if not exists client_name text;
  end if;

  if to_regclass('public.telemetry_alerts') is not null then
    alter table public.telemetry_alerts
      add column if not exists client_name text;
  end if;
end $$;
-- Backfill daily movement client_name from existing duplicate columns and report_name.
update public.daily_movement_reports dmr
set client_name = coalesce(
      nullif(btrim(dmr.client_name), ''),
      nullif(btrim(dmr.source_client_name), ''),
      nullif(btrim(dmr.company_name), ''),
      nullif(btrim(split_part(coalesce(dmr.report_name, ''), '|', 2)), ''),
      nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), '')
    )
from public.raw_telemetry_inbound r
where dmr.raw_inbound_id = r.id
  and (dmr.client_name is null or btrim(dmr.client_name) = '');
update public.daily_movement_reports dmr
set client_name = nullif(btrim(split_part(coalesce(dmr.report_name, ''), '|', 2)), '')
where (dmr.client_name is null or btrim(dmr.client_name) = '')
  and coalesce(dmr.report_name, '') like '%|%';
-- Backfill telemetry alerts client_name from existing duplicate columns and raw report_name.
update public.telemetry_alerts ta
set client_name = coalesce(
      nullif(btrim(ta.client_name), ''),
      nullif(btrim(ta.source_client_name), ''),
      nullif(btrim(split_part(coalesce(r.report_name, r.payload_json ->> 'report_name', ''), '|', 2)), ''),
      nullif(btrim(r.payload_json ->> 'client_name'), ''),
      nullif(btrim(r.payload_json ->> 'client'), '')
    )
from public.raw_telemetry_inbound r
where ta.raw_inbound_id = r.id
  and (ta.client_name is null or btrim(ta.client_name) = '');
-- Keep mappings aligned with canonical target name.
update public.ingestion_mappings im
set mapping_config = (
  with rewritten_fields as (
    select
      jsonb_set(
        im.mapping_config,
        '{fields}',
        (
          select coalesce(
            jsonb_object_agg(k, to_jsonb(case when v = 'company_name' then 'client_name' else v end)),
            '{}'::jsonb
          )
          from jsonb_each_text(coalesce(im.mapping_config -> 'fields', '{}'::jsonb)) as e(k, v)
        ),
        true
      ) as cfg
  ),
  normalized_defaults as (
    select
      jsonb_set(
        cfg #- '{defaults,company_name}',
        '{defaults,client_name}',
        coalesce(cfg #> '{defaults,client_name}', cfg #> '{defaults,company_name}', to_jsonb('Teletrac Ingestion'::text)),
        true
      ) as final_cfg
    from rewritten_fields
  )
  select final_cfg from normalized_defaults
)
where im.target_table = 'daily_movement_reports';
-- Rewrite policies that still reference duplicate column names.
do $$
declare
  r record;
  v_roles text;
  v_cmd text;
  v_qual text;
  v_with_check text;
  v_sql text;
begin
  for r in
    select *
    from pg_policies
    where schemaname = 'public'
      and tablename in ('daily_movement_reports', 'telemetry_alerts')
      and (
        coalesce(qual, '') like '%source_client_name%'
        or coalesce(with_check, '') like '%source_client_name%'
        or coalesce(qual, '') like '%company_name%'
        or coalesce(with_check, '') like '%company_name%'
      )
  loop
    select string_agg(quote_ident(x), ', ')
    into v_roles
    from unnest(r.roles) as t(x);
    v_roles := coalesce(v_roles, 'public');

    v_cmd := case when r.cmd = 'ALL' then '' else ' for ' || r.cmd end;

    v_qual := replace(coalesce(r.qual, ''), 'source_client_name', 'client_name');
    v_qual := replace(v_qual, 'company_name', 'client_name');
    if btrim(v_qual) = '' then v_qual := null; end if;

    v_with_check := replace(coalesce(r.with_check, ''), 'source_client_name', 'client_name');
    v_with_check := replace(v_with_check, 'company_name', 'client_name');
    if btrim(v_with_check) = '' then v_with_check := null; end if;

    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);

    v_sql := format(
      'create policy %I on %I.%I as %s%s to %s',
      r.policyname,
      r.schemaname,
      r.tablename,
      r.permissive,
      v_cmd,
      v_roles
    );

    if v_qual is not null then
      v_sql := v_sql || ' using (' || v_qual || ')';
    end if;

    if v_with_check is not null then
      v_sql := v_sql || ' with check (' || v_with_check || ')';
    end if;

    execute v_sql;
  end loop;
end $$;
drop index if exists public.idx_telemetry_alerts_source_client_name;
alter table if exists public.daily_movement_reports
  drop column if exists source_client_name,
  drop column if exists company_name;
alter table if exists public.telemetry_alerts
  drop column if exists source_client_name;
create index if not exists idx_daily_movement_reports_client_name
  on public.daily_movement_reports(client_name);
create index if not exists idx_telemetry_alerts_client_name
  on public.telemetry_alerts(client_name);
