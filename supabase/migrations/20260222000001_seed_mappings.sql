-- Seed initial mapping for Teletrac Fuel Trip Report (Type 137)
insert into ingestion_mappings (source, report_type, target_table, upsert_target, mapping_config, notes)
values (
  'teletrac',
  '137',
  'daily_movement_reports',
  'raw_inbound_id', -- Using raw_inbound_id as a reliable conflict target for this implementation
  '{
    "fields": {
      "asset": "asset_description",
      "registration_number": "registration_number",
      "start_time": "departure_time",
      "end_time": "arrival_time",
      "kilometers": "distance_km",
      "fuelUsed": "fuel_used_litres",
      "start_Location": "departed_from",
      "endLocation": "arrived_at",
      "max_Speed": "max_speed_kmh",
      "duration": "driving_time"
    },
    "defaults": {
      "company_name": "Teletrac Ingestion"
    }
  }',
  'Initial mapping for Fuel Trip Listing reports'
)
on conflict (source, report_type, version) do nothing;
-- Seed initial mapping for Teletrac Alert (Type 1)
insert into ingestion_mappings (source, report_type, target_table, upsert_target, mapping_config, notes)
values (
  'teletrac',
  '1',
  'telemetry_alerts',
  'asset_id,alert_timestamp,alert_name',
  '{
    "fields": {
      "report_id": "report_id",
      "generated_date": "generated_date",
      "alert_name": "alert_name",
      "event": "alert_event",
      "date": "alert_timestamp",
      "asset": "asset_id",
      "location": "location",
      "speed": "speed",
      "battery": "battery",
      "priority": "priority",
      "lon": "lon",
      "lat": "lat"
    }
  }',
  'Initial mapping for Alert reports'
)
on conflict (source, report_type, version) do nothing;
