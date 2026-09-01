-- Repoint country_context's metric key from managed_list_items to
-- measure_definitions (subgroup 221 "Country Context", ids 1..16), and rename the
-- column dl_def_id -> measure_def_id. The legacy dl_def_id FK'd managed_list_items,
-- which cannot represent 11 of the 14 country-context metrics (they live only as
-- measure_definitions in subgroup 221). country_context is EMPTY, so this is a
-- clean, data-free change. Applied to dev 2026-08-23. Run per environment. Idempotent.

-- 1) rename dl_def_id -> measure_def_id (indexes/constraints follow the rename)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'country_context' AND column_name = 'dl_def_id'
  ) THEN
    ALTER TABLE country_context RENAME COLUMN dl_def_id TO measure_def_id;
  END IF;
END $$;

-- 2) drop the legacy FK to managed_list_items (auto-generated name; find & drop)
DO $$
DECLARE fk text;
BEGIN
  SELECT tc.constraint_name INTO fk
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
  WHERE tc.table_name = 'country_context'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'managed_list_items';
  IF fk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE country_context DROP CONSTRAINT %I', fk);
  END IF;
END $$;

-- 3) add the correct FK to measure_definitions(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'country_context'
      AND constraint_name = 'country_context_measure_def_id_fk'
  ) THEN
    ALTER TABLE country_context
      ADD CONSTRAINT country_context_measure_def_id_fk
      FOREIGN KEY (measure_def_id) REFERENCES measure_definitions(id);
  END IF;
END $$;

-- Note: the unique key uq_country_context_metric_year (country_id, <metric>, period_year)
-- follows the column rename automatically and now reads (country_id, measure_def_id, period_year).
