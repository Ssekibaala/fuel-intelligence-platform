-- Fix report_type=137 trip ownership so client attribution comes from the report
-- name segment after "|" instead of the old Teletrac placeholder default.

update public.ingestion_mappings
set mapping_config = (mapping_config #- '{defaults,client_name}' #- '{defaults,company_name}'),
    updated_at = now()
where source = 'teletrac'
  and report_type = '137'
  and target_table in ('trip_reports', 'daily_movement_reports')
  and (
    mapping_config #> '{defaults,client_name}' is not null
    or mapping_config #> '{defaults,company_name}' is not null
  );

do $$
begin
  if to_regclass('public.trip_reports') is not null then
    alter table public.trip_reports
      add column if not exists client_name text;
  end if;
end $$;

with trip_candidates as (
  select
    tr.id,
    nullif(
      btrim(
        public.extract_client_from_report_name(
          coalesce(
            tr.report_name,
            r.report_name,
            r.payload_json ->> 'report_name'
          )
        )
      ),
      ''
    ) as parsed_client_name,
    vehicle_match.client_id as vehicle_client_id,
    vehicle_match.client_name as vehicle_client_name,
    client_match.client_id as parsed_client_id,
    client_match.client_name as parsed_client_match_name
  from public.trip_reports tr
  left join public.raw_telemetry_inbound r
    on r.id = tr.raw_inbound_id
  left join lateral (
    select
      v.client_id,
      nullif(btrim(v.client_name), '') as client_name
    from public.vehicles v
    where (
      tr.vehicle_id is not null
      and v.id::text = tr.vehicle_id::text
    ) or (
      tr.source_imei is not null
      and public.normalize_imei(v.imei) = public.normalize_imei(tr.source_imei)
    ) or (
      tr.source_assigned_asset is not null
      and (
        v.vehicle_plate = tr.source_assigned_asset
        or v.asset_id = tr.source_assigned_asset
      )
    ) or (
      tr.registration_number is not null
      and (
        v.vehicle_plate = tr.registration_number
        or v.asset_id = tr.registration_number
      )
    )
    order by
      case
        when tr.vehicle_id is not null and v.id::text = tr.vehicle_id::text then 0
        when tr.source_imei is not null and public.normalize_imei(v.imei) = public.normalize_imei(tr.source_imei) then 1
        when tr.source_assigned_asset is not null and v.vehicle_plate = tr.source_assigned_asset then 2
        when tr.source_assigned_asset is not null and v.asset_id = tr.source_assigned_asset then 3
        when tr.registration_number is not null and v.vehicle_plate = tr.registration_number then 4
        else 5
      end,
      v.updated_at desc nulls last,
      v.created_at desc nulls last
    limit 1
  ) vehicle_match on true
  left join lateral (
    select
      c.id as client_id,
      c.name as client_name
    from public.clients c
    where nullif(
      btrim(
        public.extract_client_from_report_name(
          coalesce(
            tr.report_name,
            r.report_name,
            r.payload_json ->> 'report_name'
          )
        )
      ),
      ''
    ) is not null
      and (
        lower(btrim(c.name)) = lower(
          btrim(
            public.extract_client_from_report_name(
              coalesce(
                tr.report_name,
                r.report_name,
                r.payload_json ->> 'report_name'
              )
            )
          )
        )
        or lower(btrim(c.name)) like '%' || lower(
          btrim(
            public.extract_client_from_report_name(
              coalesce(
                tr.report_name,
                r.report_name,
                r.payload_json ->> 'report_name'
              )
            )
          )
        ) || '%'
        or lower(
          btrim(
            public.extract_client_from_report_name(
              coalesce(
                tr.report_name,
                r.report_name,
                r.payload_json ->> 'report_name'
              )
            )
          )
        ) like '%' || lower(btrim(c.name)) || '%'
      )
    order by
      case
        when lower(btrim(c.name)) = lower(
          btrim(
            public.extract_client_from_report_name(
              coalesce(
                tr.report_name,
                r.report_name,
                r.payload_json ->> 'report_name'
              )
            )
          )
        ) then 0
        else 1
      end,
      char_length(c.name),
      c.created_at
    limit 1
  ) client_match on true
)
update public.trip_reports tr
set client_name = coalesce(
      trip_candidates.parsed_client_name,
      trip_candidates.vehicle_client_name,
      trip_candidates.parsed_client_match_name,
      case
        when lower(btrim(coalesce(tr.client_name, ''))) = 'teletrac ingestion' then null
        else nullif(btrim(tr.client_name), '')
      end
    ),
    client_id = coalesce(
      trip_candidates.vehicle_client_id,
      trip_candidates.parsed_client_id,
      tr.client_id
    )
from trip_candidates
where trip_candidates.id = tr.id
  and (
    tr.client_id is null
    or tr.client_name is null
    or btrim(tr.client_name) = ''
    or lower(btrim(tr.client_name)) = 'teletrac ingestion'
    or (
      trip_candidates.parsed_client_name is not null
      and trip_candidates.parsed_client_name is distinct from tr.client_name
    )
  );
