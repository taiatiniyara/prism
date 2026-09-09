-- ============================================================================
-- DRAFT — Gold governed-fact layer for Power BI row-level security (RLS)
-- ============================================================================
-- STATUS: DRAFT. NOT APPLIED to p2. For review by #10 (tiered-access spec owner)
-- and #3 (calculator), and to hand the Power BI developer a concrete source
-- contract. Verify column names against live schema and confirm the current
-- .pbix RLS roles before any apply. Author: #4, 2026-09-09.
--
-- WHY THIS EXISTS
-- --------------------------------------------------------------------------
-- Power BI RLS is a per-row DAX predicate: to scope by dimension X, X must be a
-- COLUMN on atomic fact rows. Today the ~25 `app/api/fact*` feeds PIVOT measures
-- into column NAMES and drop status/category/subgroup/content_class, so the live
-- .pbix model tables (Fact Generation, Fact Metering, …) are WIDE — measures are
-- columns. RLS can therefore only reach `org` (via Dim Utilities). It CANNOT
-- scope by:
--   * workflow status  -> blocks the own-utility live/watermarked view
--   * content_class     -> blocks KPI-vs-input gating
--   * measure category / subgroup -> blocks CEO-granted delegated access
--      (the "CEO picks categories/subgroups per grantee" requirement)
-- The fix is a LONG/atomic governed fact carrying those columns as ROWS. The
-- atomic gold already exists (`kpi_actual`, `data_entries`); this layer projects
-- it into the shape PBI RLS needs. Non-destructive: VIEWS only, no table change.
--
-- SCOPE OF THIS DRAFT (all #4 / gold-feed domain):
--   A. gold_fact_value        — the long governed fact (KPI  UNION  input)
--   B. gold_dim_measure       — measure/KPI dimension carrying category+subgroup
--   C. gold_pbi_grant_scope   — RLS security dimension for delegated grants
--                                (depends on #10's §3.7 tables — see note)
--   D. RLS role predicate spec — the filters the PBI developer implements
--
-- RECOMMENDED ADOPTION: introduce this as a NEW governed source that only the
-- NEW surfaces bind to (own-utility live, content_class gating, delegated
-- grants). Leave the existing wide benchmarking facts in place so today's
-- dashboards need no re-point. See the shared summary for the trade-off.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- A. gold_fact_value — one atomic row per value, carrying every RLS key
-- ----------------------------------------------------------------------------
-- Grain: one row per (content_class, measure/kpi, period, full address + 10 dims).
-- Governance columns RLS predicates on: owning_org_id, is_approved / status_id,
-- content_class, measure_category_id, measure_subgroup_id.
-- NOTE: `data_entries.category_id` is the ENERGY category (taxonomy dim), NOT the
-- measure's catalogue category — the measure category/subgroup come from
-- measure_definitions.measures_group_id / measures_subgroup_id and are aliased
-- here as measure_category_id / measure_subgroup_id to avoid that collision.
CREATE OR REPLACE VIEW gold_fact_value AS
-- ---- computed KPIs (content_class = 'kpi') --------------------------------
SELECT
  'kpi'::text                                   AS content_class,
  COALESCE(ka.owning_org_id, ka.utility_id)     AS owning_org_id,   -- tenant; NULL = shared/context
  ka.utility_id,
  ka.period_id,
  rp.status_id,
  (rp.status_id = 5)                            AS is_approved,     -- 5 = Approved (APPROVED_STATUS)
  ka.kpi_def_id                                 AS measure_ref_id,  -- FK into gold_dim_measure
  kd.category_id                                AS measure_category_id,
  kd.subcategory_id                             AS measure_subgroup_id,
  -- address / grain
  ka.country_id, ka.subregion_id, ka.region,
  ka.service_area_id, ka.power_station_id, ka.unit_id,
  ka.grain_level,
  -- the ten analytic dimensions (identical set on both sources)
  ka.provider_id, ka.category_id AS energy_category_id, ka.technology_id,
  ka.asset_class_id, ka.customer_type_id, ka.payment_mode_id,
  ka.consumption_band_id, ka.division_id, ka.gender_id, ka.utility_function_id,
  -- value
  ka.value                                      AS value_numeric,
  NULL::text                                    AS value_text,
  ka.no_data_reason
FROM kpi_actual ka
JOIN report_periods rp   ON rp.id = ka.period_id
JOIN kpi_definitions kd  ON kd.id = ka.kpi_def_id

UNION ALL

-- ---- entered inputs (content_class = 'kpi_input') -------------------------
SELECT
  'kpi_input'::text                             AS content_class,
  de.utility_id                                 AS owning_org_id,   -- NULL = country/global context
  de.utility_id,
  de.report_period_id                           AS period_id,
  de.status_id,
  (de.status_id = 5)                            AS is_approved,
  de.measure_def_id                             AS measure_ref_id,
  md.measures_group_id                          AS measure_category_id,
  md.measures_subgroup_id                       AS measure_subgroup_id,
  de.country_id, NULL::integer AS subregion_id, NULL::text AS region,
  de.service_area_id, de.power_station_id, de.unit_id,
  CASE
    WHEN de.unit_id          IS NOT NULL THEN 'unit'
    WHEN de.power_station_id IS NOT NULL THEN 'station'
    WHEN de.service_area_id  IS NOT NULL THEN 'area'
    WHEN de.utility_id       IS NOT NULL THEN 'utility'
    WHEN de.country_id       IS NOT NULL THEN 'country'
    ELSE 'region'
  END                                           AS grain_level,
  de.provider_id, de.category_id AS energy_category_id, de.technology_id,
  de.asset_class_id, de.customer_type_id, de.payment_mode_id,
  de.consumption_band_id, de.division_id, de.gender_id, de.utility_function_id,
  de.value_numeric,
  de.value_text,
  de.no_data_reason
FROM data_entries de
JOIN measure_definitions md ON md.id = de.measure_def_id
WHERE de.is_deleted = false
  AND de.is_relevant = true;
-- Materialisation: for the live own-utility surface, expose this via DirectQuery
-- (or a matview refreshed on data-entry edit) so watermarked figures track edits.
-- The approved-only benchmarking surface can stay import-mode.


-- ----------------------------------------------------------------------------
-- B. gold_dim_measure — the measure/KPI dimension (category + subgroup)
-- ----------------------------------------------------------------------------
-- One row per (content_class, measure_ref_id); PBI relates gold_fact_value
-- [content_class + measure_ref_id] -> this. Lets visuals put "measure" on an
-- axis (replacing wide columns) and lets RLS filter by category/subgroup here
-- OR on the denormalised keys already on the fact (either works).
CREATE OR REPLACE VIEW gold_dim_measure AS
SELECT 'kpi'::text AS content_class, kd.id AS measure_ref_id, kd.name,
       kd.category_id AS measure_category_id, kd.subcategory_id AS measure_subgroup_id
FROM kpi_definitions kd
UNION ALL
SELECT 'kpi_input'::text, md.id, md.name,
       md.measures_group_id, md.measures_subgroup_id
FROM measure_definitions md;


-- ----------------------------------------------------------------------------
-- C. gold_pbi_grant_scope — RLS security dimension for delegated access (§3.7)
-- ----------------------------------------------------------------------------
-- Flattens each ACTIVE, in-window CEO grant into one row per
-- (grantee email x granting org x granted node), analogous to app/api/pbiRls.
-- A PBI RLS "delegated" role joins this on USERNAME() to decide which of the
-- granting utility's category/subgroup rows the grantee may see.
--
-- DEPENDENCY: the §3.7 tables (dataset_access_grant, dataset_access_grant_grantee,
-- dataset_access_grant_scope) are OWNED BY #10 and NOT YET BUILT. This view is
-- written against #10's specced shape; it compiles only once those tables exist.
-- Left here so #10/#2 land the tables and #4 exposes this view in lock-step.
CREATE OR REPLACE VIEW gold_pbi_grant_scope AS
SELECT
  lower(u.email)      AS username,          -- match to USERNAME()/USERPRINCIPALNAME()
  g.granting_org_id,                        -- the utility whose data is shared
  sc.content_type     AS content_class,     -- 'kpi' | 'kpi_input'
  sc.node_level,                            -- 'group' (category) | 'subgroup'
  sc.node_id,                               -- managed_list_items id of the granted node
  sc.can_view,
  sc.can_download,
  g.status_scope                            -- 'approved_only' (default) | 'include_working'
FROM dataset_access_grant g
JOIN dataset_access_grant_grantee gg ON gg.grant_id = g.id
JOIN "user" u                        ON u.id = gg.user_id
JOIN dataset_access_grant_scope sc   ON sc.grant_id = g.id
WHERE g.status = 'active'
  AND current_date BETWEEN g.start_date AND g.end_date
  AND sc.can_view = true;


-- ----------------------------------------------------------------------------
-- D. RLS role predicate spec — what the PBI developer implements on the model
-- ----------------------------------------------------------------------------
-- Roles combine by UNION (OR). USERNAME() resolves the viewer; the pbiRls
-- user->org table resolves the viewer's own org. Each predicate is a row filter
-- on gold_fact_value:
--
--   SCOPE_PUBLIC        : (public teaser scope only — no per-utility rows)
--   SCOPE_OWN_UTILITY   : owning_org_id = <viewer org from pbiRls>        -- ALL statuses (live)
--   SCOPE_BENCHMARKING  : is_approved = true                             -- cross-utility, approved only
--   KPI_ONLY            : content_class = 'kpi'
--   KPI_AND_INPUTS      : content_class IN ('kpi','kpi_input')
--
--   DELEGATED (§3.7)    : EXISTS a gold_pbi_grant_scope row gs WHERE
--                           gs.username         = USERNAME()
--                       AND gs.granting_org_id  = gold_fact_value.owning_org_id
--                       AND gs.content_class    = gold_fact_value.content_class
--                       AND ( (gs.node_level='group'    AND gs.node_id = measure_category_id)
--                          OR (gs.node_level='subgroup' AND gs.node_id = measure_subgroup_id) )
--                       AND ( gs.status_scope='include_working' OR is_approved )
--
-- The DELEGATED predicate is the capability that is IMPOSSIBLE on the wide model
-- and becomes a plain row filter here — the whole point of this layer.
-- ============================================================================
