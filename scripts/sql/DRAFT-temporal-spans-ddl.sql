-- ============================================================================
-- DRAFT — Temporal-spans coordinated DDL   (author #4, for #2 review — DO NOT APPLY)
-- ============================================================================
-- One migration for the whole temporal-spans family, so the foundation lands once:
--   A. unit_activations        — unit operating-state stints   (unit-lifecycle-spec §2.1; #2/#8 own canonical shape)
--   B. service_area_capabilities — per-area capability spans    (service-area-capability-spec §3; #4 owns)
-- Both use the SAME shape (real-date span, ≤1 open, GiST non-overlap) and the SAME
-- extension (btree_gist), which is exactly why they ride one migration.
--
-- SEQUENCING (critical — the table creates are safe; the units-column DROPS are not):
--   Phase 1  extension + create both new tables            (this file, § A/B)  — pure additive, safe anytime
--   Phase 2  loader seeds stints + capability spans          (#2/#14 reimport — NOT SQL here, § E)
--   Phase 3  units-column changes / drops                    (this file, § C — ONLY after Phase 2 verified)
--   Phase 4  post-retirement drops (service_areas.strata_id) (deferred, § F — joint #8/#2 later)
--
-- Dependencies still open (do not apply until cleared):
--   • Canonical period dimension (time-series spec §5) — shell-gen / capacity-hours consume period spans.
--   • Eugene's purge+reimport extract (unit-lifecycle §7).
--   • RLS policies for both new tables (#12, § D).
--   • Provenance-parity decision (§ B note) — #8/#2 to rule.
--   • ⚠ SUPERSESSION DECISION — service_area_capabilities vs the existing transmission_relevance
--     table. This is an EUGENE/ #8 architectural call, NOT bakeable here. See the block below.
--
-- ============================================================================
-- ⚠⚠ FINDING (schema audit, #4 2026-08-25) — transmission_relevance ALREADY EXISTS ⚠⚠
-- ============================================================================
-- An existing `transmission_relevance` table (0 rows) + its populated sibling
-- `tariff_relevance` (179 rows) already implement a relevance mechanism for the SAME problem
-- the capability spec targets — but with the OPPOSITE philosophy:
--   • transmission_relevance: (report_period_id, service_area_id, measure_def_id, is_relevant)
--     — DEFAULT-RELEVANT, per-period, override-to-SUPPRESS. Code defaults isRelevant=true when
--     no row exists (service.ts:1037); a row is written only to turn a measure OFF for a
--     (period, area). It's the app's live-entry override, was never populated, and never drove
--     migration (the 4 grid areas were pre-filtered in the extract, not via this table).
--   • service_area_capabilities (this draft): DEFAULT-ABSENT, span-based, declare-to-ENABLE.
--     No transmission shells unless the area declares a has_transmission span.
-- Generation relevance uses a THIRD mechanism — units.period_entries jsonb (service.ts:1360),
--   the one the unit-lifecycle spec RETIRES into stints.
--
-- So there are three relevance mechanisms today (period_entries jsonb / transmission_relevance
-- override / implicit), and the temporal-spans family unifies TWO of them into spans
-- (generation→stints, transmission→capability spans). The open question for transmission:
--   Does service_area_capabilities SUPERSEDE transmission_relevance, or coexist with it?
-- #4 recommendation (for Eugene/#8): SUPERSEDE for transmission —
--   (1) transmission is rare (4 of 66 real areas): default-absent+declare is far less noise
--       than default-present+suppress-everywhere; (2) it answers the bootstrap/emergence case
--       the override table can't; (3) it's normalized (one span drives all 5 transmission
--       measures vs a row per measure per period); (4) the override table is UNUSED (0 rows) —
--       zero migration cost to replace. Keep tariff_relevance untouched (populated, genuinely
--       per-cell customer_type×payment_mode overrides — a different animal). If superseded,
--       transmission_relevance is DROPPED in this same migration + its UI/service code retired
--       (#11/#2). RULING NEEDED before this table is real.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Shared foundation
-- ---------------------------------------------------------------------------
-- btree_gist lets a GiST exclusion mix scalar equality (unit_id / service_area_id / capability)
-- with daterange overlap (&&) in one constraint. Needed by BOTH tables (unit-lifecycle §7 F5).
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ===========================================================================
-- A.  unit_activations — operating-state stints  (unit-lifecycle-spec §2.1)
-- ===========================================================================
-- Canonical shape owned by #2/#8 — drafted here verbatim to their ratified spec so the
-- family lands together. #2: reconcile against unit-lifecycle-spec §2.1 before applying.
CREATE TABLE unit_activations (
  id                serial PRIMARY KEY,
  unit_id           integer NOT NULL REFERENCES units(id),
  service_area_id   integer NOT NULL REFERENCES service_areas(id),
  power_station_id  integer REFERENCES power_stations(id),          -- nullable; if set, must be a child of service_area_id (§2.1 chain-consistency — app/trigger enforced, cross-table)
  rated_capacity_mw numeric,                                        -- NOT NULL for generation/storage stints (F1); conditional on unit technology→category, so enforced at loader/app layer, not a table CHECK. A genuine-unknown EXCLUDES the unit-period from capacity KPIs + flags it, never silent 0.
  activation_date   date    NOT NULL,
  deactivation_date date,                                           -- NULL = currently active
  change_reason_id  integer REFERENCES managed_list_items(id),      -- derate/impairment/move reason — audit only (§2.1)

  -- provenance (see § B parity note — harmonized across the family; house convention is
  -- text user ids + `timestamp`, matching units / data_entries / transmission_relevance):
  created_at        timestamp NOT NULL DEFAULT now(),
  created_by_id     text REFERENCES "user"(id),
  updated_at        timestamp,
  updated_by_id     text REFERENCES "user"(id),

  CONSTRAINT chk_ua_dates CHECK (deactivation_date IS NULL OR deactivation_date >= activation_date),
  -- non-overlapping stints per unit — a physical unit can't be in two places at once
  CONSTRAINT excl_ua_overlap EXCLUDE USING gist (
    unit_id WITH =,
    daterange(activation_date, deactivation_date, '[)') WITH &&
  )
);

-- ≤ 1 open stint per unit
CREATE UNIQUE INDEX uq_ua_one_open ON unit_activations (unit_id) WHERE deactivation_date IS NULL;
-- historical "which SA in period P" resolves here — btree(unit_id) + GiST(daterange)
CREATE INDEX ix_ua_unit ON unit_activations (unit_id);
CREATE INDEX ix_ua_span ON unit_activations USING gist (daterange(activation_date, deactivation_date, '[)'));


-- ===========================================================================
-- B.  service_area_capabilities — per-area capability spans  (capability-spec §3)
-- ===========================================================================
-- #4-owned. Declares "this area HAS transmission" (etc.) instead of inferring it from the
-- presence of transmission shells (circular; can't bootstrap a newly-commissioned network).
CREATE TABLE service_area_capabilities (
  id               serial PRIMARY KEY,
  service_area_id  integer NOT NULL REFERENCES service_areas(id),
  capability       text    NOT NULL,
  effective_from   date    NOT NULL,
  effective_to     date,                                           -- NULL = currently in effect (an OPEN span IS the carry-forward)

  -- provenance (§4 rule 3: amend rewrites declared history past scorecards consumed;
  -- house convention: text user ids + `timestamp`):
  change_reason_id integer REFERENCES managed_list_items(id),
  created_at       timestamp NOT NULL DEFAULT now(),
  created_by_id    text REFERENCES "user"(id),
  updated_at       timestamp,
  updated_by_id    text REFERENCES "user"(id),

  -- controlled vocabulary — grain_level treatment; extend the list as members are added,
  -- so a typo'd capability can't silently gate nothing (#8, 2026-08-25):
  CONSTRAINT chk_sac_capability CHECK (capability IN ('has_transmission')),
  CONSTRAINT chk_sac_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  -- non-overlapping spans per (area, capability)
  CONSTRAINT excl_sac_overlap EXCLUDE USING gist (
    service_area_id WITH =,
    capability      WITH =,
    daterange(effective_from, effective_to, '[)') WITH &&
  )
);

-- ≤ 1 open span per (area, capability). NOTE: for OPEN spans this is subsumed by
-- excl_sac_overlap (two open spans [from,∞) always overlap → the exclusion already rejects
-- them — verified). Kept anyway for parity with the ratified stint spec (§2.1 lists both) and
-- as a self-documenting explicit guarantee; harmless. Same applies to uq_ua_one_open above.
CREATE UNIQUE INDEX uq_sac_one_open ON service_area_capabilities (service_area_id, capability) WHERE effective_to IS NULL;
-- shell-gen / verifier lookup: "does area X have capability C covering period P?"
CREATE INDEX ix_sac_area ON service_area_capabilities (service_area_id, capability);
CREATE INDEX ix_sac_span ON service_area_capabilities USING gist (daterange(effective_from, effective_to, '[)'));

-- ── PROVENANCE PARITY — REVIEW FLAG for #8/#2 ──────────────────────────────
-- unit-lifecycle-spec §2.1 lists ONLY change_reason_id on unit_activations; the three
-- amend-consequence rules (#8, 2026-08-25 — ruled AFTER that spec) require who/when
-- provenance on amend for the whole family. This draft therefore adds created_by/at +
-- changed_by/at to BOTH tables so the audit shape is identical and rule 3 is enforceable.
-- #8/#2: confirm this harmonization, or tell me to trim capability spans back to
-- change_reason_id-only to match §2.1 as-written. One family = one audit shape.
-- (If provenance is later consolidated into a shared history table — declined at n=2 per
--  #8 — both tables move together.)


-- ===========================================================================
-- C.  units-column changes  (unit-lifecycle-spec §2.2 / §7)  ── PHASE 3 ONLY ──
-- ===========================================================================
-- ⚠ These are DESTRUCTIVE and DATA-COUPLED — they may run ONLY after Phase 2 has seeded
--   stints from the current period_entries/service_area_id data and #2 has VERIFIED the
--   seed (else unit history is lost). Left commented in this draft; #2 sequences them into
--   the reimport, not the table-create. Shown here so the family is complete in one place.

-- derived UI cache: answers "now" only; maintained by trigger, never authoritative (§2.2)
-- ALTER TABLE units ADD COLUMN current_service_area_id integer REFERENCES service_areas(id);
-- ALTER TABLE units ADD COLUMN current_power_station_id integer REFERENCES power_stations(id);
-- ALTER TABLE units ADD COLUMN is_aggregate boolean NOT NULL DEFAULT false;   -- §2.4 (replaces unit_qty)

-- after seed + verify:
-- ALTER TABLE units DROP COLUMN service_area_id;      -- authoritative SA moves onto the stint
-- ALTER TABLE units DROP COLUMN power_station_id;     -- moves onto the stint
-- ALTER TABLE units DROP COLUMN unit_qty;             -- 100% null; replaced by is_aggregate (§2.4)
-- ALTER TABLE units DROP COLUMN is_virtual;           -- virtual units retired in reimport (§7)
-- ALTER TABLE units DROP COLUMN strata_id;            -- F2: vestigial (only virtuals were non-Unit)
-- ALTER TABLE units DROP COLUMN period_entries;       -- proto-SCD-2 blob folded into seed stints (§2.2)

-- current_service_area_id maintenance trigger (§2.2): re-point the cache to the unit's
-- currently-open stint (deactivation_date IS NULL) on any stint insert/update/delete.
-- CREATE OR REPLACE FUNCTION sync_unit_current_sa() RETURNS trigger AS $$
-- BEGIN
--   UPDATE units u
--      SET current_service_area_id  = s.service_area_id,
--          current_power_station_id = s.power_station_id
--     FROM (SELECT service_area_id, power_station_id
--             FROM unit_activations
--            WHERE unit_id = COALESCE(NEW.unit_id, OLD.unit_id)
--              AND deactivation_date IS NULL
--            LIMIT 1) s
--    WHERE u.id = COALESCE(NEW.unit_id, OLD.unit_id);
--   -- (no open stint → leave cache as last-known; UI reads "now", history reads the table)
--   RETURN NULL;
-- END; $$ LANGUAGE plpgsql;
-- CREATE TRIGGER trg_ua_sync_current_sa
--   AFTER INSERT OR UPDATE OR DELETE ON unit_activations
--   FOR EACH ROW EXECUTE FUNCTION sync_unit_current_sa();


-- ===========================================================================
-- D.  RLS — new tables need policies  (unit-lifecycle §8 F4; capability-spec §7)
-- ===========================================================================
-- Both are tenant-scoped and derivable to a utility:
--   unit_activations   → units.utility_id
--   service_area_capabilities → service_areas.utility_id
-- #12 owns the exact policy. Shells of the intent (mirror the data_entries owning-org model):
-- ALTER TABLE unit_activations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE service_area_capabilities ENABLE ROW LEVEL SECURITY;
-- (policies TBD by #12 — must also allow BMO/DEV override, per the stint authoring rule.)


COMMIT;

-- ===========================================================================
-- E.  Seed (loader territory — NOT SQL here, for #2's reimport)
-- ===========================================================================
-- unit_activations seed (§7): each real unit → ≥1 seed stint; a run of same-capacity periods
--   → one stint, a capacity change in period_entries → a stint boundary (best-effort real
--   dates from period spans). Rated-Capacity measure values are the source for
--   rated_capacity_mw, then that measure retires. Virtual units (92) get NO stints.
--
-- service_area_capabilities seed (capability-spec §6): ONE 'has_transmission' span per grid
--   area that currently carries Transmission-slice shells (the 4: Ramu, Port Moresby, Gazelle,
--   Viti Levu), effective_from = that area's first Transmission-shell period's FY start,
--   effective_to = NULL (open). All other areas: no span (= no transmission). Deriving ONCE
--   from current data at migration, after which the SPAN — not the shells — is authoritative,
--   is bootstrapping (hands authority to the declaration), NOT the circular inference it
--   replaces (#8, 2026-08-25).

-- ===========================================================================
-- F.  Deferred — post-retirement  (NOT this migration)
-- ===========================================================================
-- service_areas.strata_id: KEPT through this DDL (still marks the 25 "All Service Areas"
--   sentinel SAs). Drops later, once those sentinels retire — joint #8/#2 assessment
--   (unit-lifecycle §10; likely outcome = drop). Do not drop here.
