-- kpi_actual — the single computed-KPI table (calculator = sole writer).
-- Ratified design: docs/kpi-actual-ddl-design.md (grain ✅ #8, column-set/write-path ✅ #3).
-- Mirrors data_entries' typed shape (verified against live schema 2026-08-26), swapping
-- measure→KPI and adding compute provenance.
--
-- EARLY-LAND decision (Eugene's 3-hour calculator push, 2026-08-26): landed NOW with
--   • period_id as a BARE integer (NO FK) — the canonical period dimension doesn't exist yet;
--     add the FK when it lands (the doc's pre-authorised option). Utility-grain writes key it
--     with report_period_id for now; supra-utility rollups await the canonical dim.
--   • owning_org_id nullable (RLS column present so #12 can add the policy later; not enforced yet).
-- Everything else is the ratified design verbatim. Additive/greenfield — nothing depends on it
-- until the calculator writes. Applied to dev 2026-08-26. Run per environment. Idempotent-guarded.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS kpi_actual (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_def_id           integer NOT NULL REFERENCES kpi_definitions(id),
  period_id            integer NOT NULL,                         -- bare integer; FK to canonical period dim when it lands

  -- nullable grain chain (7, filled level→root, NULL below) — #8 hybrid convention
  utility_id           integer REFERENCES organisations(id),
  country_id           integer REFERENCES countries(id),
  subregion_id         integer REFERENCES sub_regions(id),
  region               text NOT NULL,                            -- §4(d): chain fills to root ⇒ always present
  service_area_id      integer REFERENCES service_areas(id),
  power_station_id     integer REFERENCES power_stations(id),
  unit_id              integer REFERENCES units(id),

  -- 10 dimension slices (NOT NULL, explicit All) — exact-match to data_entries
  provider_id          integer NOT NULL REFERENCES managed_list_items(id),
  category_id          integer NOT NULL REFERENCES managed_list_items(id),
  technology_id        integer NOT NULL REFERENCES managed_list_items(id),
  asset_class_id       integer NOT NULL REFERENCES managed_list_items(id),
  customer_type_id     integer NOT NULL REFERENCES managed_list_items(id),
  payment_mode_id      integer NOT NULL REFERENCES managed_list_items(id),
  consumption_band_id  integer NOT NULL REFERENCES managed_list_items(id),
  division_id          integer NOT NULL REFERENCES managed_list_items(id),
  gender_id            integer NOT NULL REFERENCES managed_list_items(id),
  utility_function_id  integer NOT NULL REFERENCES managed_list_items(id),

  value                numeric,                                  -- nullable (NULL when not-available)
  no_data_reason       varchar(32),                              -- derived-only vocab (engine-propagated)

  -- provenance
  computed_at          timestamp,
  formula_version      varchar,
  owning_org_id        integer REFERENCES organisations(id),     -- RLS (#12 policy later); nullable for now
  updated_at           timestamp,

  -- derived grain (generated stored) — shared 7-value derivation with data_entries (§4.1)
  grain_level          text GENERATED ALWAYS AS (
    CASE WHEN unit_id IS NOT NULL THEN 'unit'
         WHEN power_station_id IS NOT NULL THEN 'station'
         WHEN service_area_id IS NOT NULL THEN 'area'
         WHEN utility_id IS NOT NULL THEN 'utility'
         WHEN country_id IS NOT NULL THEN 'country'
         WHEN subregion_id IS NOT NULL THEN 'subregion'
         ELSE 'region' END) STORED,

  CONSTRAINT chk_ka_grain_level CHECK (grain_level IN ('unit','station','area','utility','country','subregion','region')),
  CONSTRAINT chk_ka_value_xor_nodata CHECK ((value IS NOT NULL)::int + (no_data_reason IS NOT NULL)::int <= 1),
  CONSTRAINT chk_ka_no_data_reason CHECK (no_data_reason IS NULL OR no_data_reason IN ('not_available','asserted_not_applicable'))
);

-- one computed cell per address; NULLS NOT DISTINCT so nullable grain cols dedupe correctly
CREATE UNIQUE INDEX IF NOT EXISTS uq_ka_address ON kpi_actual (
  kpi_def_id, period_id,
  utility_id, country_id, subregion_id, region, service_area_id, power_station_id, unit_id,
  provider_id, category_id, technology_id, asset_class_id, customer_type_id, payment_mode_id,
  consumption_band_id, division_id, gender_id, utility_function_id
) NULLS NOT DISTINCT;

-- read paths: BSC/target/AI read by (kpi_def_id, period), gold refresh walks by grain
CREATE INDEX IF NOT EXISTS ix_ka_kpi_period ON kpi_actual (kpi_def_id, period_id);
CREATE INDEX IF NOT EXISTS ix_ka_grain ON kpi_actual (grain_level);
