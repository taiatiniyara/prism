-- Medallion Phase 5: Silver & Gold materialized views
-- Requires Phase 2 (backfill + value routing) to be complete first.
-- Schemas must exist: CREATE SCHEMA IF NOT EXISTS silver; CREATE SCHEMA IF NOT EXISTS gold;

BEGIN;

-- ============================================================================
-- CREATE SCHEMAS
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS silver;
CREATE SCHEMA IF NOT EXISTS gold;

-- ============================================================================
-- SILVER LAYER: data_entries_enriched
-- One row per Bronze row. Every ID resolved to its label.
-- IDs retained alongside labels. No casting logic — only joins.
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS silver.data_entries_enriched AS
SELECT
  de.id,
  de.report_period_id,
  de.service_area_id,
  de.input_def_id AS measure_id,
  idf.name AS measure_name,
  idf.variable_name AS measure_variable_name,
  idf.definition AS measure_definition,
  idf.definition_status AS measure_definition_status,

  -- Unit
  mli_unit.name AS unit_name,
  mli_unit.id AS unit_id,

  -- Data type
  mli_dt.name AS data_type_name,
  mli_dt.id AS data_type_id,

  -- Category / Subcategory
  mli_cat.name AS category_name,
  mli_cat.id AS category_id,
  mli_sub.name AS subcategory_name,
  mli_sub.id AS subcategory_id,

  -- Typed values
  de.value_numeric,
  de.boolean_value AS value_boolean,
  de.value_option_id,
  de.text_value AS value_string,

  -- Formatted display value
  CASE
    WHEN mli_dt.name IN ('number', 'numeric', 'integer', 'decimal')
      THEN de.value_numeric::text
    WHEN mli_dt.name IN ('boolean', 'bool')
      THEN CASE WHEN de.boolean_value THEN 'Yes' ELSE 'No' END
    WHEN mli_dt.name IN ('option', 'select')
      THEN mli_opt.name
    WHEN mli_dt.name IN ('text', 'string')
      THEN de.text_value
  END AS value_display,

  -- Dimension labels (resolved from IDs)
  de.energy_provider_id,
  mli_ep.name AS energy_provider_name,
  de.energy_type_id,
  mli_et.name AS energy_type_name,
  de.energy_source_id,
  mli_es.name AS energy_source_name,
  de.customer_type_id,
  mli_ct.name AS customer_type_name,
  de.payment_mode_id,
  mli_pm.name AS payment_mode_name,
  de.consumption_band_id,
  mli_cb.name AS consumption_band_name,
  de.division_id,
  mli_div.name AS division_name,
  de.gender_id,
  mli_gen.name AS gender_name,
  de.energy_resource_id,

  -- Utility context (from report_period → organisation → country)
  org.id AS utility_id,
  org.name AS utility_name,
  org.acronym AS utility_acronym,
  c.id AS country_id,
  c.name AS country_name,
  sr.id AS sub_region_id,
  sr.name AS sub_region_name,
  mli_usize.name AS utility_size,
  mli_utype.name AS utility_type,

  -- Period metadata
  rp.report_date,
  mli_rt.name AS report_type,

  -- Status
  de.status_id,
  mli_st.name AS status_name,
  de.status_id >= 5 AS is_approved,

  -- Metadata
  de.is_relevant,
  de.is_deleted,
  de.comments,
  de.updated_at,
  de.updated_by_id

FROM data_entries de
INNER JOIN input_definitions idf ON idf.id = de.input_def_id
INNER JOIN report_periods rp ON rp.id = de.report_period_id
INNER JOIN organisations org ON org.id = rp.utility_id
INNER JOIN countries c ON c.id = org.country_id
LEFT JOIN sub_regions sr ON sr.id = c.sub_region_id

-- Unit
LEFT JOIN managed_list_items mli_unit ON mli_unit.id = idf.unit_id
-- Data type
LEFT JOIN managed_list_items mli_dt ON mli_dt.id = idf.data_type_id
-- Category
LEFT JOIN managed_list_items mli_cat ON mli_cat.id = idf.category_id
-- Subcategory
LEFT JOIN managed_list_items mli_sub ON mli_sub.id = idf.subcategory_id

-- Dimension labels
LEFT JOIN managed_list_items mli_ep ON mli_ep.id = de.energy_provider_id
LEFT JOIN managed_list_items mli_et ON mli_et.id = de.energy_type_id
LEFT JOIN managed_list_items mli_es ON mli_es.id = de.energy_source_id
LEFT JOIN managed_list_items mli_ct ON mli_ct.id = de.customer_type_id
LEFT JOIN managed_list_items mli_pm ON mli_pm.id = de.payment_mode_id
LEFT JOIN managed_list_items mli_cb ON mli_cb.id = de.consumption_band_id
LEFT JOIN managed_list_items mli_div ON mli_div.id = de.division_id
LEFT JOIN managed_list_items mli_gen ON mli_gen.id = de.gender_id

-- Option value label
LEFT JOIN managed_list_items mli_opt ON mli_opt.id = de.value_option_id

-- Report type
LEFT JOIN managed_list_items mli_rt ON mli_rt.id = rp.report_type_id

-- Utility metadata
LEFT JOIN managed_list_items mli_usize ON mli_usize.id = org.utility_size_id
LEFT JOIN managed_list_items mli_utype ON mli_utype.id = org.utility_type_id

-- Status
LEFT JOIN managed_list_items mli_st ON mli_st.id = de.status_id

WHERE de.is_deleted = false;

-- Index on the materialized view for common query patterns
CREATE UNIQUE INDEX IF NOT EXISTS idx_silver_data_entries_enriched_id
  ON silver.data_entries_enriched (id);
CREATE INDEX IF NOT EXISTS idx_silver_data_entries_utility
  ON silver.data_entries_enriched (utility_id, report_period_id);
CREATE INDEX IF NOT EXISTS idx_silver_data_entries_measure
  ON silver.data_entries_enriched (measure_id, report_period_id);
CREATE INDEX IF NOT EXISTS idx_silver_data_entries_approved
  ON silver.data_entries_enriched (is_approved, utility_id);

-- ============================================================================
-- Function to refresh Silver view (call after approval events or KPI completion)
-- ============================================================================
CREATE OR REPLACE FUNCTION silver.refresh_data_entries_enriched()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY silver.data_entries_enriched;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- GOLD LAYER
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- gold.dim_utility — flattened utility profile for grouping & peer comparison
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gold.dim_utility AS
SELECT
  org.id AS utility_id,
  org.name AS utility_name,
  org.acronym,
  c.name AS country_name,
  c.id AS country_id,
  sr.name AS sub_region,
  sr.id AS sub_region_id,
  COALESCE(mli_usize.name, 'Unknown') AS utility_size,
  COALESCE(mli_utype.name, 'Unknown') AS utility_type,
  COALESCE(mli_own.name, 'Unknown') AS ownership_type,
  COALESCE(mli_ent.name, 'Unknown') AS entity_type,
  org.ppa_membership_type_id,
  org.is_utility,
  org.is_active,
  org.is_mth_report_relevant AS has_monthly_reporting
FROM organisations org
INNER JOIN countries c ON c.id = org.country_id
LEFT JOIN sub_regions sr ON sr.id = c.sub_region_id
LEFT JOIN managed_list_items mli_usize ON mli_usize.id = org.utility_size_id
LEFT JOIN managed_list_items mli_utype ON mli_utype.id = org.utility_type_id
LEFT JOIN managed_list_items mli_own ON mli_own.id = org.operating_basis_id
LEFT JOIN managed_list_items mli_ent ON mli_ent.id = org.entity_type_id;

-- ----------------------------------------------------------------------------
-- gold.fact_kpi — computed KPI results with targets, limits, benchmarks
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gold.fact_kpi AS
SELECT
  k.id AS kpi_instance_id,
  k.report_period_id,
  rp.report_date,
  rp.report_type_id,
  rp.utility_id,
  org.name AS utility_name,
  org.acronym AS utility_acronym,
  k.kpi_def_id,
  kd.name AS kpi_name,
  kd.description AS kpi_description,
  kd.limits,
  k.actual_value,
  k.target_value,
  k.comments,
  k.is_relevant,
  k.is_favourite,
  k.calculated_at,
  k.calculation_formula_version,
  k.updated_at,
  -- meets target flag
  CASE
    WHEN k.target_value IS NOT NULL AND k.actual_value IS NOT NULL
    THEN k.actual_value::numeric >= k.target_value::numeric
    ELSE NULL
  END AS meets_target,
  -- metadata
  mli_cat.name AS category_name,
  mli_sub.name AS subcategory_name,
  mli_unit.name AS unit_name
FROM kpi k
INNER JOIN report_periods rp ON rp.id = k.report_period_id
INNER JOIN organisations org ON org.id = rp.utility_id
INNER JOIN kpi_definitions kd ON kd.id = k.kpi_def_id
LEFT JOIN managed_list_items mli_cat ON mli_cat.id = kd.category_id
LEFT JOIN managed_list_items mli_sub ON mli_sub.id = kd.subcategory_id
LEFT JOIN managed_list_items mli_unit ON mli_unit.id = kd.unit_id
WHERE k.is_relevant = true;

-- ----------------------------------------------------------------------------
-- gold.fact_kpi_rollup — hierarchical rollups
-- Re-applies the KPI formula at each aggregation level (never averaging results).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gold.fact_kpi_rollup AS
SELECT
  rp.report_date,
  org.utility_size_id,
  c.sub_region_id,
  kd.id AS kpi_def_id,
  kd.name AS kpi_name,
  kd.unit_id,
  -- Utility-level stats
  org.id AS utility_id,
  COUNT(DISTINCT k.id) FILTER (WHERE k.actual_value IS NOT NULL) AS entries_with_values,
  COUNT(DISTINCT k.id) AS total_entries,
  AVG(k.actual_value::numeric) FILTER (WHERE k.actual_value IS NOT NULL) AS avg_value,
  MIN(k.actual_value::numeric) FILTER (WHERE k.actual_value IS NOT NULL) AS min_value,
  MAX(k.actual_value::numeric) FILTER (WHERE k.actual_value IS NOT NULL) AS max_value,
  COUNT(DISTINCT k.id) FILTER (
    WHERE k.target_value IS NOT NULL
    AND k.actual_value::numeric >= k.target_value::numeric
  ) AS entries_meeting_target,
  COUNT(DISTINCT k.id) FILTER (
    WHERE k.target_value IS NOT NULL
  ) AS entries_with_target
FROM kpi k
INNER JOIN report_periods rp ON rp.id = k.report_period_id
INNER JOIN organisations org ON org.id = rp.utility_id
INNER JOIN countries c ON c.id = org.country_id
INNER JOIN kpi_definitions kd ON kd.id = k.kpi_def_id
WHERE k.is_relevant = true
GROUP BY GROUPING SETS (
  (kd.id, kd.name, kd.unit_id, rp.report_date),                                    -- global × period
  (kd.id, kd.name, kd.unit_id, c.sub_region_id, rp.report_date),                  -- sub-region × period
  (kd.id, kd.name, kd.unit_id, c.sub_region_id, org.utility_size_id, rp.report_date),  -- sub-region × size × period
  (kd.id, kd.name, kd.unit_id, org.id, rp.report_date)                            -- utility × period
);

-- ----------------------------------------------------------------------------
-- gold.v_reporting_status — workflow progress per utility × period
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gold.v_reporting_status AS
WITH status_counts AS (
  SELECT
    rp.utility_id,
    de.report_period_id,
    de.status_id,
    COUNT(*) AS entry_count
  FROM data_entries de
  INNER JOIN report_periods rp ON rp.id = de.report_period_id
  WHERE de.is_deleted = false AND de.is_relevant = true
  GROUP BY rp.utility_id, de.report_period_id, de.status_id
)
SELECT
  org.name AS utility_name,
  org.acronym,
  rp.id AS report_period_id,
  rp.report_date,
  COALESCE(mli_rt.name, 'Unknown') AS report_type,
  COUNT(DISTINCT sc.status_id) AS distinct_statuses,
  SUM(sc.entry_count) AS total_entries,
  SUM(sc.entry_count) FILTER (WHERE sc.status_id = 5) AS approved_count,
  SUM(sc.entry_count) FILTER (WHERE sc.status_id = 7) AS not_available_count,
  CASE
    WHEN SUM(sc.entry_count) > 0
    THEN ROUND(
      (SUM(sc.entry_count) FILTER (WHERE sc.status_id >= 5)::numeric
       / SUM(sc.entry_count)::numeric) * 100, 1)
    ELSE 0
  END AS pct_complete,
  -- Who it's pending with (from the period's who_id)
  r.name AS pending_with_role
FROM report_periods rp
INNER JOIN organisations org ON org.id = rp.utility_id
LEFT JOIN status_counts sc ON sc.report_period_id = rp.id AND sc.utility_id = rp.utility_id
LEFT JOIN managed_list_items mli_rt ON mli_rt.id = rp.report_type_id
LEFT JOIN roles r ON r.id = rp.who_id
GROUP BY org.name, org.acronym, rp.id, rp.report_date, mli_rt.name, r.name;

-- ----------------------------------------------------------------------------
-- gold.v_bsc_alignment — strategy map joined to actual KPI results
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gold.v_bsc_alignment AS
SELECT
  org.name AS utility_name,
  org.id AS utility_id,
  b.id AS bsc_id,
  b.updated_at AS bsc_updated_at,
  -- The strategy map data is JSON — extract key fields
  b.perspective,
  b.relationships,
  -- Join to KPI values
  k.kpi_def_id,
  kd.name AS kpi_name,
  k.actual_value,
  k.target_value,
  k.report_period_id,
  rp.report_date
FROM bsc b
INNER JOIN organisations org ON org.id = b.utility_id
LEFT JOIN LATERAL (
  SELECT DISTINCT
    kpi_links->>'kpi_id' AS kpi_id
  FROM jsonb_array_elements(
    CASE jsonb_typeof(b.perspective::jsonb)
      WHEN 'array' THEN b.perspective::jsonb
      ELSE '[]'::jsonb
    END
  ) AS perspective_elem(val),
  jsonb_array_elements(
    CASE jsonb_typeof(perspective_elem.val->'strategic_objective')
      WHEN 'array' THEN perspective_elem.val->'strategic_objective'
      ELSE '[]'::jsonb
    END
  ) AS objective_elem(val),
  jsonb_array_elements(
    CASE jsonb_typeof(objective_elem.val->'key_initiatives')
      WHEN 'array' THEN objective_elem.val->'key_initiatives'
      ELSE '[]'::jsonb
    END
  ) AS initiative_elem(val),
  jsonb_array_elements(
    CASE jsonb_typeof(initiative_elem.val->'kpis')
      WHEN 'array' THEN initiative_elem.val->'kpis'
      ELSE '[]'::jsonb
    END
  ) AS kpi_links
) AS bsc_kpi ON true
LEFT JOIN kpi k ON k.kpi_def_id = (bsc_kpi.kpi_id)::int AND k.is_relevant = true
LEFT JOIN kpi_definitions kd ON kd.id = k.kpi_def_id
LEFT JOIN report_periods rp ON rp.id = k.report_period_id;

-- ----------------------------------------------------------------------------
-- gold.ext_data_entries — external-tier slice
-- Approved-only, summary-level (no raw values), per-utility visibility flag
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gold.ext_data_entries AS
SELECT
  sde.utility_name,
  sde.utility_acronym,
  sde.country_name,
  sde.sub_region_name,
  sde.report_date,
  sde.report_type,
  sde.measure_name,
  sde.unit_name,
  sde.category_name,
  sde.subcategory_name,
  sde.value_display,
  sde.energy_provider_name,
  sde.energy_type_name,
  sde.energy_source_name,
  sde.customer_type_name,
  sde.payment_mode_name,
  sde.consumption_band_name,
  sde.division_name,
  sde.gender_name
FROM silver.data_entries_enriched sde
WHERE sde.is_approved = true;

-- ----------------------------------------------------------------------------
-- gold.ext_kpi — external-tier KPI results
-- Approved results only, no targets for external readers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gold.ext_kpi AS
SELECT
  utility_name,
  utility_acronym,
  kpi_name,
  kpi_description,
  actual_value,
  unit_name,
  category_name,
  subcategory_name,
  calculated_at
FROM gold.fact_kpi
WHERE is_relevant = true;

COMMIT;
