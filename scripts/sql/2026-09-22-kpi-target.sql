-- kpi_target — the single relational utility-target table (replaces the
-- kpi_definitions.targets JSON). Ratified design: docs/kpi-target-actual-contract.md.
-- Mirrors kpi_actual's shared ADDRESS verbatim (docs kpi-actual-ddl-design.md /
-- scripts/sql/2026-08-26-kpi-actual.sql) so actual ⋈ target is an exact-address row join.
--
-- DIVERGENCES from kpi_actual, per the contract:
--   • period_id FKs the CANONICAL PERIOD DIM (`period`), never report_periods (§0) —
--     targets are set for FUTURE periods before any report_period exists. The dim now
--     exists (scripts/sql/2026-09-21-period-dimension-*.sql), so this is a real FK.
--   • NO availability machinery (§2.2): no no_data_reason, no value/no_data XOR, no
--     shells/completeness/approval status. Targets are sparse declarations.
--   • Target provenance instead of compute provenance: source ∈ {direct, bsc} (how the
--     UTILITY entered it — both are the utility, §2 rule 2), set_by/set_at.
--   • Utility-or-finer only (§2.1 ruling B): CHECK utility_id IS NOT NULL — a target
--     attaches to an accountable entity; an above-utility figure is a benchmark, not a
--     target. (kpi_actual permits supra-utility grains; kpi_target does not.)
--   • NO authority PPA/Country fields (§4) — that is a forward-compatible additive
--     extension, deliberately NOT built here; `source` stays {direct,bsc} for the
--     utility's own value.
--
-- Grain chain + generated grain_level are INHERITED VERBATIM from #8 (§7), identical
-- derivation/type to data_entries / kpi_actual. One target per cell: NULLS NOT DISTINCT
-- unique on the full address (§2 rule 3) — direct/bsc collide at an address on purpose,
-- so the guarded set-target service handles override; the DB enforces one physical row.
--
-- Additive/greenfield — nothing reads it until the target rebuild (#5) + the set-target
-- service land. Authored by #4; hand to #2 to integrate into the period-dim migration
-- package + sequence the apply (git-first: SQL merges, #2 applies, Drizzle model added
-- after apply so drift-check never sees model-ahead-of-DB). Run per environment (single
-- p2 instance). Idempotent-guarded.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS kpi_target (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_def_id           integer NOT NULL REFERENCES kpi_definitions(id),
  period_id            integer NOT NULL REFERENCES period(id),     -- canonical period dim (§0)

  -- nullable grain chain (7, filled level→root, NULL below) — #8 hybrid convention (§7)
  utility_id           integer REFERENCES organisations(id),
  country_id           integer REFERENCES countries(id),
  subregion_id         integer REFERENCES sub_regions(id),
  region               text NOT NULL,                             -- chain fills to root ⇒ always present
  service_area_id      integer REFERENCES service_areas(id),
  power_station_id     integer REFERENCES power_stations(id),
  unit_id              integer REFERENCES units(id),

  -- 10 dimension slices (NOT NULL, explicit All) — exact-match to kpi_actual / data_entries
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

  value                numeric,                                   -- the utility's own target; nullable (§4 forward-compat: authority-only cell)

  -- target provenance (§2)
  source               varchar(16) NOT NULL,                      -- how the utility entered it: direct | bsc (both are the utility)
  set_by               text REFERENCES "user"(id),
  set_at               timestamp,

  owning_org_id        integer REFERENCES organisations(id),      -- RLS (#12 policy later); nullable for now
  updated_at           timestamp,

  -- derived grain (generated stored) — shared 7-value derivation with data_entries / kpi_actual (§7)
  grain_level          text GENERATED ALWAYS AS (
    CASE WHEN unit_id IS NOT NULL THEN 'unit'
         WHEN power_station_id IS NOT NULL THEN 'station'
         WHEN service_area_id IS NOT NULL THEN 'area'
         WHEN utility_id IS NOT NULL THEN 'utility'
         WHEN country_id IS NOT NULL THEN 'country'
         WHEN subregion_id IS NOT NULL THEN 'subregion'
         ELSE 'region' END) STORED,

  CONSTRAINT chk_kt_grain_level CHECK (grain_level IN ('unit','station','area','utility','country','subregion','region')),
  CONSTRAINT chk_kt_source CHECK (source IN ('direct','bsc')),
  -- §2.1 ruling B: utility-or-finer only. utility_id present ⇒ grain_level ∈ {utility,area,station,unit}
  -- (chain-consistency, enforced on the write contract per §7, keeps the finer levels honest).
  CONSTRAINT chk_kt_utility_or_finer CHECK (utility_id IS NOT NULL)
);

-- one target per cell; NULLS NOT DISTINCT so nullable grain cols dedupe correctly (§2 rule 3).
-- Address = identity + 7 grain + 10 dims (19 cols) — NOT source/value/owning_org, so
-- direct and bsc at one address collide → the guarded service resolves the override.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kt_address ON kpi_target (
  kpi_def_id, period_id,
  utility_id, country_id, subregion_id, region, service_area_id, power_station_id, unit_id,
  provider_id, category_id, technology_id, asset_class_id, customer_type_id, payment_mode_id,
  consumption_band_id, division_id, gender_id, utility_function_id
) NULLS NOT DISTINCT;

-- read paths: BSC/target-UI/AI read by (kpi_def_id, period); gold refresh walks by grain
CREATE INDEX IF NOT EXISTS ix_kt_kpi_period ON kpi_target (kpi_def_id, period_id);
CREATE INDEX IF NOT EXISTS ix_kt_grain ON kpi_target (grain_level);
