-- Medallion Phase 2b: Route values from old columns to typed value columns
-- Based on measure_definitions .data_type_id → managed_list_items.name lookup.
-- Parse failures are logged to data_entry_logs, not dropped.

BEGIN;

-- 1. Route numeric values from value/boolean_value/text_value/numberic_value columns
--    to the correct typed column based on the input definition's data type.

-- 1a. Number-type inputs → value_numeric
--     Uses existing numeric_value (misspelled column) where available,
--     falls back to parsing the varchar "value" column.
WITH number_measures AS (
  SELECT id
  FROM measure_definitions  idf
  INNER JOIN managed_list_items mli ON mli.id = idf.data_type_id
  INNER JOIN managed_lists ml ON ml.id = mli.list_id
  WHERE LOWER(mli.name) IN ('number', 'numeric', 'integer', 'decimal')
    AND ml.name = 'Data Type'
)
UPDATE data_entries de
SET
  value_numeric = COALESCE(
    de.numberic_value,
    NULLIF(de.value, '')::numeric
  ),
  status_id = CASE
    WHEN COALESCE(de.numberic_value, NULLIF(de.value, '')::numeric) IS NOT NULL
      AND de.status_id IS NULL
    THEN 3 -- Entered
    ELSE de.status_id
  END
FROM number_measures nm
WHERE de.measure_def_id = nm.id
  AND de.is_deleted = false
  AND de.value_numeric IS NULL
  AND (de.numberic_value IS NOT NULL OR (de.value IS NOT NULL AND de.value != ''));

-- 1b. Boolean-type inputs → boolean_value (already exists, just ensure consistency)
--     Parse "Yes"/"No"/"true"/"false" from varchar value column.
WITH boolean_measures AS (
  SELECT id
  FROM measure_definitions  idf
  INNER JOIN managed_list_items mli ON mli.id = idf.data_type_id
  INNER JOIN managed_lists ml ON ml.id = mli.list_id
  WHERE LOWER(mli.name) IN ('boolean', 'bool')
    AND ml.name = 'Data Type'
)
UPDATE data_entries de
SET
  boolean_value = CASE
    WHEN LOWER(NULLIF(de.value, '')) IN ('yes', 'true', '1') THEN true
    WHEN LOWER(NULLIF(de.value, '')) IN ('no', 'false', '0') THEN false
    ELSE de.boolean_value
  END,
  status_id = CASE
    WHEN LOWER(NULLIF(de.value, '')) IN ('yes', 'true', '1', 'no', 'false', '0')
      AND de.status_id IS NULL
    THEN 3 -- Entered
    ELSE de.status_id
  END
FROM boolean_measures bm
WHERE de.measure_def_id = bm.id
  AND de.is_deleted = false;

-- 1c. Text/string-type inputs → value_string (use text_value, falls back to varchar value)
WITH text_measures AS (
  SELECT id
  FROM measure_definitions  idf
  INNER JOIN managed_list_items mli ON mli.id = idf.data_type_id
  INNER JOIN managed_lists ml ON ml.id = mli.list_id
  WHERE LOWER(mli.name) IN ('text', 'string')
    AND ml.name = 'Data Type'
)
UPDATE data_entries de
SET
  value_string = COALESCE(de.text_value, de.value),
  status_id = CASE
    WHEN COALESCE(de.text_value, de.value) IS NOT NULL AND de.status_id IS NULL
    THEN 3 -- Entered
    ELSE de.status_id
  END
FROM text_measures tm
WHERE de.measure_def_id = tm.id
  AND de.is_deleted = false
  AND de.value_string IS NULL
  AND (de.text_value IS NOT NULL OR (de.value IS NOT NULL AND de.value != ''));

-- 2. Log parse failures: entries where value column is set but couldn't be converted
INSERT INTO data_entry_logs (
  id,
  data_entry_id,
  previous_value,
  new_value,
  value_snapshot,
  updated_by_id,
  updated_at
)
SELECT
  gen_random_uuid(),
  de.id,
  'migration',
  'parse_failure',
  jsonb_build_object(
    'value_numeric', de.numberic_value,
    'value_boolean', de.boolean_value,
    'value_option_id', NULL,
    'value_string', de.text_value,
    'status_id', de.status_id
  ),
  'migration',
  now()
FROM data_entries de
WHERE de.is_deleted = false
  AND de.value IS NOT NULL
  AND de.value != ''
  AND de.numberic_value IS NULL
  AND de.boolean_value IS NULL
  AND de.text_value IS NULL
  AND de.value_numeric IS NULL
  AND de.value_string IS NULL;

-- 3. Verify migration counts
SELECT
  COUNT(*) FILTER (WHERE value_numeric IS NOT NULL) AS numeric_filled,
  COUNT(*) FILTER (WHERE boolean_value IS NOT NULL) AS boolean_filled,
  COUNT(*) FILTER (WHERE value_option_id IS NOT NULL) AS option_filled,
  COUNT(*) FILTER (WHERE value_string IS NOT NULL) AS string_filled,
  COUNT(*) FILTER (WHERE value IS NOT NULL AND value != ''
    AND value_numeric IS NULL AND boolean_value IS NULL
    AND value_string IS NULL AND numberic_value IS NULL
    AND text_value IS NULL) AS remaining_parse_failures
FROM data_entries
WHERE is_deleted = false;

COMMIT;
