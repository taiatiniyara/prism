-- ============================================================================
-- DRAFT — Temporal-spans + measure-relevance coordinated DDL
--         (author #4, for #2 review — DO NOT APPLY)
-- ============================================================================
-- One coordinated migration for the whole family, so the foundation lands once:
--   A. unit_activations  — unit operating-state stints (unit-lifecycle-spec §2.1; #2/#8 own shape)
--   B. measure_relevance — ONE standardised relevance surface (measure-relevance-spec; #4 owns)
--   C. units-column changes (unit-lifecycle §2.2/§7) — Phase 3, post-seed
--
-- RULINGS BAKED IN (Eugene + #8, 2026-08-26 — B-clean):
--   • measure_relevance is THE uniform surface the shell generator reads.
--   • transmission + tariff = DECLARED rows; generation = DERIVED from stint overlap
--     (stints stay the sole truth for generation existence/location/capacity).
--   • transmission_relevance DROPPED; tariff_relevance MIGRATED IN then retired;
--     units.period_entries retired (is_active→derived rows, capacity→stint state).
--   • The service_area_capabilities SPAN table is SUPERSEDED — not created.
--
-- SEQUENCING (table creates are safe; the DROPs are not):
--   Phase 1  extension + create unit_activations + measure_relevance   (§A/§B) — additive, safe
--   Phase 2  loader: seed stints; migrate tariff rows; project generation rows; roll-forward
--            declared rows  (#2/#14 reimport — NOT SQL here, §E)
--   Phase 3  units-column changes/drops + transmission_relevance drop + tariff_relevance retire
--            (§C/§E — ONLY after Phase 2 verified)
--   Phase 4  post-retirement drops (service_areas.strata_id)           (§F — joint #8/#2 later)
--
-- Dependencies still open (do not apply until cleared):
--   • Canonical period dimension (time-series spec §5).
--   • Eugene's purge+reimport extract (unit-lifecycle §7).
--   • RLS policies for both new tables (#12, §D).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Shared foundation
-- ---------------------------------------------------------------------------
-- btree_gist: GiST exclusion mixing scalar equality with daterange overlap (unit_activations).
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- gen_random_uuid() for measure_relevance ids (matches tariff_relevance/transmission_relevance uuid ids).
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ===========================================================================
-- A.  unit_activations — operating-state stints  (unit-lifecycle-spec §2.1)
-- ===========================================================================
-- Canonical shape owned by #2/#8 — drafted here verbatim to their ratified spec so the family
-- lands together. #2: reconcile against unit-lifecycle-spec §2.1 before applying. UNCHANGED by
-- the B-clean ruling — stints remain the SOLE truth for generation existence/location/capacity;
-- generation relevance is PROJECTED from them into measure_relevance (§B, §E).
CREATE TABLE unit_activations (
  id                serial PRIMARY KEY,
  unit_id           integer NOT NULL REFERENCES units(id),
  service_area_id   integer NOT NULL REFERENCES service_areas(id),
  power_station_id  integer REFERENCES power_stations(id),          -- nullable; if set, child of service_area_id (§2.1, app/trigger enforced)
  rated_capacity_mw numeric,                                        -- NOT NULL for gen/storage (F1); conditional on technology→category, so loader/app-enforced not a CHECK. Genuine-unknown EXCLUDES from capacity KPIs + flags, never silent 0.
  activation_date   date    NOT NULL,
  deactivation_date date,                                           -- NULL = currently active
  change_reason_id  integer REFERENCES managed_list_items(id),      -- derate/impairment/move reason — audit only

  created_at        timestamp NOT NULL DEFAULT now(),
  created_by_id     text REFERENCES "user"(id),
  updated_at        timestamp,
  updated_by_id     text REFERENCES "user"(id),

  CONSTRAINT chk_ua_dates CHECK (deactivation_date IS NULL OR deactivation_date >= activation_date),
  CONSTRAINT excl_ua_overlap EXCLUDE USING gist (
    unit_id WITH =,
    daterange(activation_date, deactivation_date, '[)') WITH &&
  )
);
-- ≤1 open stint per unit. (Subsumed by excl_ua_overlap for open stints — two open stints always
-- overlap — but kept for parity with the ratified spec §2.1 and as an explicit guarantee.)
CREATE UNIQUE INDEX uq_ua_one_open ON unit_activations (unit_id) WHERE deactivation_date IS NULL;
CREATE INDEX ix_ua_unit ON unit_activations (unit_id);
CREATE INDEX ix_ua_span ON unit_activations USING gist (daterange(activation_date, deactivation_date, '[)'));


-- ===========================================================================
-- B.  measure_relevance — ONE standardised relevance surface  (measure-relevance-spec §2)
-- ===========================================================================
-- The ONLY surface the shell generator reads. Default-OFF/declare-to-enable. Rows produced two
-- ways, split by `source`: 'declared' (transmission + tariff, hand-entered) vs 'derived_stint'
-- (generation, engine-projected from unit_activations overlap incl. §3.3 cross-SA splits).
CREATE TABLE measure_relevance (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_period_id  integer NOT NULL REFERENCES report_periods(id),
  service_area_id   integer NOT NULL REFERENCES service_areas(id),
  measure_def_id    integer NOT NULL REFERENCES measure_definitions(id),
  -- optional dimension-member columns (nullable; set per relevance family):
  payment_mode_id   integer REFERENCES managed_list_items(id),      -- tariff
  customer_type_id  integer REFERENCES managed_list_items(id),      -- tariff
  provider_id       integer REFERENCES managed_list_items(id),      -- generation
  technology_id     integer REFERENCES managed_list_items(id),      -- generation
  is_relevant       boolean NOT NULL,
  source            text    NOT NULL,                               -- 'declared' | 'derived_stint'
  is_deleted        boolean NOT NULL DEFAULT false,
  -- provenance (transferred from the span spec's amend-provenance rule):
  change_reason_id  integer REFERENCES managed_list_items(id),
  created_at        timestamp NOT NULL DEFAULT now(),
  created_by_id     text REFERENCES "user"(id),
  updated_at        timestamp,
  updated_by_id     text REFERENCES "user"(id),

  CONSTRAINT chk_mr_source CHECK (source IN ('declared','derived_stint'))
);

-- one relevance verdict per address among LIVE rows (NULLS NOT DISTINCT so the nullable dim
-- columns collapse to a single address; partial so a soft-deleted row can coexist with its live
-- replacement). `source` is NOT in the address — an address is either declared or derived.
CREATE UNIQUE INDEX uq_mr_address ON measure_relevance (
  report_period_id, service_area_id, measure_def_id,
  payment_mode_id, customer_type_id, provider_id, technology_id
) NULLS NOT DISTINCT WHERE is_deleted = false;

-- shell generator reads by (period, area); verifier walks derived rows by source
CREATE INDEX ix_mr_period_area ON measure_relevance (report_period_id, service_area_id) WHERE is_deleted = false;
CREATE INDEX ix_mr_measure     ON measure_relevance (measure_def_id);
CREATE INDEX ix_mr_source      ON measure_relevance (source);

-- GUARDRAILS enforced ABOVE the DDL (measure-relevance-spec §4) — noted so #2 wires them, not
-- silently drops them:
--   (2) writer/UI reject manual edits where source='derived_stint' (engine-owned).
--   (3) stint append/amend regenerates affected derived rows (same hook as amend-reflow).
--   (4) verifier invariant: stint-overlaps ↔ derived_stint rows 1:1 both directions
--       (lib/relevance/expected.ts).
-- Family-consistency of dim columns vs measure (tariff rows set payment_mode+customer_type;
-- generation rows set provider+technology; transmission sets none) is loader/app-enforced, not a
-- CHECK — it depends on the measure's dimension scope.


-- ===========================================================================
-- C.  units-column changes  (unit-lifecycle-spec §2.2 / §7)  ── PHASE 3 ONLY ──
-- ===========================================================================
-- ⚠ DESTRUCTIVE + DATA-COUPLED — run ONLY after Phase 2 seeds stints + projects generation rows
--   and #2 has VERIFIED. Commented here so the family is complete in one place; #2 sequences them.

-- ALTER TABLE units ADD COLUMN current_service_area_id integer REFERENCES service_areas(id);   -- derived UI cache (§2.2), trigger-maintained
-- ALTER TABLE units ADD COLUMN current_power_station_id integer REFERENCES power_stations(id);
-- ALTER TABLE units ADD COLUMN is_aggregate boolean NOT NULL DEFAULT false;                     -- §2.4 (replaces unit_qty)
-- after seed + verify:
-- ALTER TABLE units DROP COLUMN service_area_id;      -- authoritative SA moves onto the stint
-- ALTER TABLE units DROP COLUMN power_station_id;     -- moves onto the stint
-- ALTER TABLE units DROP COLUMN unit_qty;             -- 100% null; replaced by is_aggregate
-- ALTER TABLE units DROP COLUMN is_virtual;           -- virtual units retired in reimport (§7)
-- ALTER TABLE units DROP COLUMN strata_id;            -- F2: vestigial
-- ALTER TABLE units DROP COLUMN period_entries;       -- is_active → derived_stint rows; capacity → stint state

-- current_service_area_id maintenance trigger (§2.2): re-point cache to the unit's open stint.
-- CREATE OR REPLACE FUNCTION sync_unit_current_sa() RETURNS trigger AS $$
-- BEGIN
--   UPDATE units u SET current_service_area_id = s.service_area_id,
--                      current_power_station_id = s.power_station_id
--     FROM (SELECT service_area_id, power_station_id FROM unit_activations
--            WHERE unit_id = COALESCE(NEW.unit_id, OLD.unit_id) AND deactivation_date IS NULL LIMIT 1) s
--    WHERE u.id = COALESCE(NEW.unit_id, OLD.unit_id);
--   RETURN NULL;
-- END; $$ LANGUAGE plpgsql;
-- CREATE TRIGGER trg_ua_sync_current_sa AFTER INSERT OR UPDATE OR DELETE ON unit_activations
--   FOR EACH ROW EXECUTE FUNCTION sync_unit_current_sa();


-- ===========================================================================
-- D.  RLS — new tables need policies  (unit-lifecycle §8 F4)
-- ===========================================================================
--   unit_activations  → tenant via units.utility_id
--   measure_relevance → tenant via service_areas.utility_id
-- #12 owns the exact policy (must allow BMO/DEV override). Shells:
-- ALTER TABLE unit_activations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE measure_relevance ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ===========================================================================
-- E.  Seed + data migration (loader territory — NOT SQL here, for #2's reimport)
-- ===========================================================================
-- unit_activations seed (§7): each real unit → ≥1 seed stint; same-capacity run → one stint, a
--   capacity change → a boundary. Rated-Capacity measure values source rated_capacity_mw, then
--   that measure retires. Virtual units (92) get NO stints.
-- measure_relevance population:
--   • DECLARED / tariff: migrate tariff_relevance's 179 rows in as source='declared'
--     (payment_mode_id + customer_type_id set); then RETIRE tariff_relevance.
--   • DECLARED / transmission: none to migrate (transmission_relevance is empty). The 4 grid
--     areas that carry transmission shells get declared is_relevant=true rows seeded for their
--     transmission-measure periods (best-effort from current data), default-OFF elsewhere.
--   • DERIVED / generation: PROJECT from seed stints — for each (period, area, provider,
--     technology) with an overlapping stint, insert source='derived_stint' is_relevant=true
--     (incl. §3.3 cross-SA split → a row in each SA). Replaces units.period_entries.is_active.
--   • Roll-forward: at each period creation, copy prior period's DECLARED rows forward (§5).

-- ===========================================================================
-- E2. transmission_relevance DROP + code retirement  (verify-before-drop; §8 measure-relevance-spec)
-- ===========================================================================
-- 0 rows confirmed (2026-08-25). Drop rides Phase 3. Retire these refs IN THE SAME migration so
-- nothing dangles (#4-listed; #11/#2 co-own the code removal):
--   • app/settings/relevance/service.ts  → GetTransmissionRelevance / SetTransmissionDataLabelRelevance
--   • the transmission relevance UI surface (settings/relevance)
--   • db schema `transmissionRelevance` (dataEntry.ts) + drizzle types
--   • app/api/migration/transmissionRelevance/route.ts
--   • scripts/migrate-relevance-tables.ts / pass2 refs
-- DROP TABLE transmission_relevance;   -- after code refs removed + verified

-- ===========================================================================
-- F.  Deferred — post-retirement  (NOT this migration)
-- ===========================================================================
-- service_areas.strata_id: KEPT through this DDL (marks the 25 "All Service Areas" sentinels).
--   Drops later once those sentinels retire — joint #8/#2 (unit-lifecycle §10; likely drop).
