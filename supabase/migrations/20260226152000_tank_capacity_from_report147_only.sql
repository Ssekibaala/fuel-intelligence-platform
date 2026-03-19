-- Ensure vehicles.tank_capacity is only populated from report_type 147 payloads.
-- Removes the legacy placeholder default (300) and clears placeholder-only values.

DO $$
BEGIN
  IF to_regclass('public.vehicles') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicles'
      AND column_name = 'tank_capacity'
  ) THEN
    ALTER TABLE public.vehicles
      ALTER COLUMN tank_capacity DROP DEFAULT,
      ALTER COLUMN tank_capacity DROP NOT NULL;
  END IF;
END $$;
DO $$
DECLARE
  v_has_tank_capacity boolean;
  v_has_summary_payload boolean;
BEGIN
  IF to_regclass('public.vehicles') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicles'
      AND column_name = 'tank_capacity'
  ) INTO v_has_tank_capacity;

  IF NOT v_has_tank_capacity THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicles'
      AND column_name = 'source_summary_payload'
  ) INTO v_has_summary_payload;

  IF v_has_summary_payload THEN
    UPDATE public.vehicles
    SET tank_capacity = NULL
    WHERE tank_capacity = 300
      AND (
        source_summary_payload IS NULL
        OR NOT (
          source_summary_payload ? 'fuel_capacity'
          OR source_summary_payload ? 'fuelCapacity'
          OR source_summary_payload ? 'tank_capacity'
          OR source_summary_payload ? 'tankCapacity'
        )
      );
  ELSE
    UPDATE public.vehicles
    SET tank_capacity = NULL
    WHERE tank_capacity = 300;
  END IF;
END $$;
