-- One-time duplicate cleanup + permanent uniqueness guards.
-- Run in Supabase SQL editor on production.
-- This script is defensive: it checks table/column existence before each action.

-- ============================================================================
-- trip_reports: keep newest row per (vehicle_id, source_trip_key[, report_type])
-- ============================================================================
DO $$
DECLARE
  has_report_type boolean;
BEGIN
  IF to_regclass('public.trip_reports') IS NULL THEN
    RAISE NOTICE 'trip_reports not found, skipping.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trip_reports' AND column_name = 'source_trip_key'
  ) THEN
    RAISE NOTICE 'trip_reports.source_trip_key not found, skipping.';
    RETURN;
  END IF;

  has_report_type := EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trip_reports' AND column_name = 'report_type'
  );

  IF has_report_type THEN
    EXECUTE $sql$
      WITH ranked AS (
        SELECT
          ctid,
          row_number() OVER (
            PARTITION BY vehicle_id, source_trip_key, report_type
            ORDER BY created_at DESC NULLS LAST, ctid DESC
          ) AS rn
        FROM public.trip_reports
        WHERE vehicle_id IS NOT NULL
          AND source_trip_key IS NOT NULL
      )
      DELETE FROM public.trip_reports t
      USING ranked r
      WHERE t.ctid = r.ctid
        AND r.rn > 1
    $sql$;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'ux_trip_reports_vehicle_source_trip_key_report_type'
    ) THEN
      EXECUTE $sql$
        CREATE UNIQUE INDEX ux_trip_reports_vehicle_source_trip_key_report_type
        ON public.trip_reports (vehicle_id, source_trip_key, report_type)
        WHERE vehicle_id IS NOT NULL AND source_trip_key IS NOT NULL
      $sql$;
    END IF;
  ELSE
    EXECUTE $sql$
      WITH ranked AS (
        SELECT
          ctid,
          row_number() OVER (
            PARTITION BY vehicle_id, source_trip_key
            ORDER BY created_at DESC NULLS LAST, ctid DESC
          ) AS rn
        FROM public.trip_reports
        WHERE vehicle_id IS NOT NULL
          AND source_trip_key IS NOT NULL
      )
      DELETE FROM public.trip_reports t
      USING ranked r
      WHERE t.ctid = r.ctid
        AND r.rn > 1
    $sql$;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'ux_trip_reports_vehicle_source_trip_key'
    ) THEN
      EXECUTE $sql$
        CREATE UNIQUE INDEX ux_trip_reports_vehicle_source_trip_key
        ON public.trip_reports (vehicle_id, source_trip_key)
        WHERE vehicle_id IS NOT NULL AND source_trip_key IS NOT NULL
      $sql$;
    END IF;
  END IF;
END $$;
-- ============================================================================
-- daily_metrics: keep newest per vehicle/day (optionally by report_type)
-- ============================================================================
DO $$
DECLARE
  has_report_type boolean;
  has_metric_day boolean;
  has_metric_date boolean;
BEGIN
  IF to_regclass('public.daily_metrics') IS NULL THEN
    RAISE NOTICE 'daily_metrics not found, skipping.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_metrics' AND column_name = 'vehicle_id'
  ) THEN
    RAISE NOTICE 'daily_metrics.vehicle_id not found, skipping.';
    RETURN;
  END IF;

  has_report_type := EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_metrics' AND column_name = 'report_type'
  );
  has_metric_day := EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_metrics' AND column_name = 'metric_day'
  );
  has_metric_date := EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_metrics' AND column_name = 'metric_date'
  );

  IF has_metric_day THEN
    IF has_report_type THEN
      EXECUTE $sql$
        WITH ranked AS (
          SELECT
            ctid,
            row_number() OVER (
              PARTITION BY vehicle_id, metric_day, report_type
              ORDER BY created_at DESC NULLS LAST, ctid DESC
            ) AS rn
          FROM public.daily_metrics
          WHERE vehicle_id IS NOT NULL
            AND metric_day IS NOT NULL
        )
        DELETE FROM public.daily_metrics t
        USING ranked r
        WHERE t.ctid = r.ctid
          AND r.rn > 1
      $sql$;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'ux_daily_metrics_vehicle_metric_day_report_type'
      ) THEN
        EXECUTE $sql$
          CREATE UNIQUE INDEX ux_daily_metrics_vehicle_metric_day_report_type
          ON public.daily_metrics (vehicle_id, metric_day, report_type)
          WHERE vehicle_id IS NOT NULL AND metric_day IS NOT NULL
        $sql$;
      END IF;
    ELSE
      EXECUTE $sql$
        WITH ranked AS (
          SELECT
            ctid,
            row_number() OVER (
              PARTITION BY vehicle_id, metric_day
              ORDER BY created_at DESC NULLS LAST, ctid DESC
            ) AS rn
          FROM public.daily_metrics
          WHERE vehicle_id IS NOT NULL
            AND metric_day IS NOT NULL
        )
        DELETE FROM public.daily_metrics t
        USING ranked r
        WHERE t.ctid = r.ctid
          AND r.rn > 1
      $sql$;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'ux_daily_metrics_vehicle_metric_day'
      ) THEN
        EXECUTE $sql$
          CREATE UNIQUE INDEX ux_daily_metrics_vehicle_metric_day
          ON public.daily_metrics (vehicle_id, metric_day)
          WHERE vehicle_id IS NOT NULL AND metric_day IS NOT NULL
        $sql$;
      END IF;
    END IF;
    RETURN;
  END IF;

  IF has_metric_date THEN
    IF has_report_type THEN
      EXECUTE $sql$
        WITH ranked AS (
          SELECT
            ctid,
            row_number() OVER (
              PARTITION BY vehicle_id, (metric_date::date), report_type
              ORDER BY created_at DESC NULLS LAST, ctid DESC
            ) AS rn
          FROM public.daily_metrics
          WHERE vehicle_id IS NOT NULL
            AND metric_date IS NOT NULL
        )
        DELETE FROM public.daily_metrics t
        USING ranked r
        WHERE t.ctid = r.ctid
          AND r.rn > 1
      $sql$;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'ux_daily_metrics_vehicle_metric_date_day_report_type'
      ) THEN
        EXECUTE $sql$
          CREATE UNIQUE INDEX ux_daily_metrics_vehicle_metric_date_day_report_type
          ON public.daily_metrics (vehicle_id, (metric_date::date), report_type)
          WHERE vehicle_id IS NOT NULL AND metric_date IS NOT NULL
        $sql$;
      END IF;
    ELSE
      EXECUTE $sql$
        WITH ranked AS (
          SELECT
            ctid,
            row_number() OVER (
              PARTITION BY vehicle_id, (metric_date::date)
              ORDER BY created_at DESC NULLS LAST, ctid DESC
            ) AS rn
          FROM public.daily_metrics
          WHERE vehicle_id IS NOT NULL
            AND metric_date IS NOT NULL
        )
        DELETE FROM public.daily_metrics t
        USING ranked r
        WHERE t.ctid = r.ctid
          AND r.rn > 1
      $sql$;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'ux_daily_metrics_vehicle_metric_date_day'
      ) THEN
        EXECUTE $sql$
          CREATE UNIQUE INDEX ux_daily_metrics_vehicle_metric_date_day
          ON public.daily_metrics (vehicle_id, (metric_date::date))
          WHERE vehicle_id IS NOT NULL AND metric_date IS NOT NULL
        $sql$;
      END IF;
    END IF;
  ELSE
    RAISE NOTICE 'daily_metrics has neither metric_day nor metric_date, skipping.';
  END IF;
END $$;
-- ============================================================================
-- fuel_events: keep newest per natural event key
-- ============================================================================
DO $$
DECLARE
  ts_col text;
  vol_col text;
  has_location boolean;
BEGIN
  IF to_regclass('public.fuel_events') IS NULL THEN
    RAISE NOTICE 'fuel_events not found, skipping.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fuel_events' AND column_name = 'vehicle_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fuel_events' AND column_name = 'event_type'
  ) THEN
    RAISE NOTICE 'fuel_events key columns missing, skipping.';
    RETURN;
  END IF;

  SELECT column_name INTO ts_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'fuel_events'
    AND column_name IN ('event_timestamp', 'event_time')
  ORDER BY CASE column_name WHEN 'event_timestamp' THEN 1 ELSE 2 END
  LIMIT 1;

  SELECT column_name INTO vol_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'fuel_events'
    AND column_name IN ('volume_liters', 'fuel_volume_litres', 'refilled')
  ORDER BY CASE column_name
    WHEN 'volume_liters' THEN 1
    WHEN 'fuel_volume_litres' THEN 2
    ELSE 3
  END
  LIMIT 1;

  has_location := EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fuel_events' AND column_name = 'location'
  );

  IF ts_col IS NULL OR vol_col IS NULL THEN
    RAISE NOTICE 'fuel_events timestamp/volume columns missing, skipping.';
    RETURN;
  END IF;

  EXECUTE format(
    'WITH ranked AS (
      SELECT ctid,
             row_number() OVER (
               PARTITION BY vehicle_id, event_type, %1$I, round(abs(coalesce(%2$I,0)::numeric),3)%3$s
               ORDER BY created_at DESC NULLS LAST, ctid DESC
             ) AS rn
      FROM public.fuel_events
      WHERE vehicle_id IS NOT NULL
        AND %1$I IS NOT NULL
    )
    DELETE FROM public.fuel_events t
    USING ranked r
    WHERE t.ctid = r.ctid
      AND r.rn > 1',
    ts_col,
    vol_col,
    CASE WHEN has_location THEN ', coalesce(location, '''')' ELSE '' END
  );

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'ux_fuel_events_natural_key'
  ) THEN
    EXECUTE format(
      'CREATE UNIQUE INDEX ux_fuel_events_natural_key
       ON public.fuel_events (vehicle_id, event_type, %1$I, round(abs(coalesce(%2$I,0)::numeric),3)%3$s)
       WHERE vehicle_id IS NOT NULL AND %1$I IS NOT NULL',
      ts_col,
      vol_col,
      CASE WHEN has_location THEN ', coalesce(location, '''')' ELSE '' END
    );
  END IF;
END $$;
-- ============================================================================
-- raw_sensor_data: keep newest per (imei_number, timestamp/date)
-- ============================================================================
DO $$
DECLARE
  ts_col text;
BEGIN
  IF to_regclass('public.raw_sensor_data') IS NULL THEN
    RAISE NOTICE 'raw_sensor_data not found, skipping.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'raw_sensor_data' AND column_name = 'imei_number'
  ) THEN
    RAISE NOTICE 'raw_sensor_data.imei_number not found, skipping.';
    RETURN;
  END IF;

  SELECT column_name INTO ts_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'raw_sensor_data'
    AND column_name IN ('date', 'timestamp')
  ORDER BY CASE column_name WHEN 'date' THEN 1 ELSE 2 END
  LIMIT 1;

  IF ts_col IS NULL THEN
    RAISE NOTICE 'raw_sensor_data timestamp/date column missing, skipping.';
    RETURN;
  END IF;

  EXECUTE format(
    'WITH ranked AS (
      SELECT ctid,
             row_number() OVER (
               PARTITION BY imei_number, %1$I
               ORDER BY created_at DESC NULLS LAST, ctid DESC
             ) AS rn
      FROM public.raw_sensor_data
      WHERE imei_number IS NOT NULL
        AND %1$I IS NOT NULL
    )
    DELETE FROM public.raw_sensor_data t
    USING ranked r
    WHERE t.ctid = r.ctid
      AND r.rn > 1',
    ts_col
  );

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'ux_raw_sensor_data_imei_ts'
  ) THEN
    EXECUTE format(
      'CREATE UNIQUE INDEX ux_raw_sensor_data_imei_ts
       ON public.raw_sensor_data (imei_number, %1$I)
       WHERE imei_number IS NOT NULL AND %1$I IS NOT NULL',
      ts_col
    );
  END IF;
END $$;
