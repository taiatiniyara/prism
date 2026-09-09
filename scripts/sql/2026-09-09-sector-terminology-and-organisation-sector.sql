-- 2026-09-09 (#2) — additive: sector_terminology + organisation_sector
--
-- Two ratified, additive tables from ADR 0003 (multi-sector terminology) — they unblock
-- #11/#13 Phase 5b and #10's sector membership. Shapes ratified:
--   sector_terminology  — Q3, #11 (docs/multi-sector-terminology-resolutions.md)
--   organisation_sector — Q4, #10 (M:N; sector is orthogonal to the org axes)
--
-- ADDITIVE + idempotent (CREATE ... IF NOT EXISTS, seed ON CONFLICT DO NOTHING). No existing
-- table touched. NOT included here (deliberately): service_areas.sector_id — NOT a clean
-- backfill (4 provides_water + 2 provides_sanitation rows; scalar sector_id can't hold a
-- multi-provides area) → deferred to #13/#8. See docs/awaiting-migration-triage.md.
--
-- git-first: this script is committed + merged BEFORE it is applied to p2. The Drizzle model
-- (db/schema/) is added in a FOLLOW-UP PR after apply (drift-check errors on model-ahead-of-DB).

BEGIN;

-- 1. sector_terminology — BMO-maintained (sector, concept) → display label, resolved at Silver/UI.
CREATE TABLE IF NOT EXISTS sector_terminology (
  id            serial PRIMARY KEY,
  sector_id     integer     NOT NULL REFERENCES sectors(id),
  concept_key   varchar(64) NOT NULL,
  label         varchar(255) NOT NULL,
  label_plural  varchar(255),
  updated_by    text        REFERENCES "user"(id),
  updated_at    timestamp   NOT NULL DEFAULT now(),
  CONSTRAINT uniq_sector_terminology_sector_concept UNIQUE (sector_id, concept_key)
);

-- Seed the one ratified concept (service_area) for the 3 sectors — faithful to the current
-- interim app-config map in lib/terminology/terminology.config.ts so #13's lookupTerm→table
-- repoint is a drop-in. #13 owns ongoing maintenance (and may move this seed into scripts/seed.ts
-- for reseed-after-push durability, per the sectors-went-to-0 lesson).
INSERT INTO sector_terminology (sector_id, concept_key, label, label_plural) VALUES
  (1, 'service_area', 'Grid',        'Grids'),        -- Electricity
  (2, 'service_area', 'Supply Zone', 'Supply Zones'), -- Water
  (3, 'service_area', 'Catchment',   'Catchments')    -- Sanitation
ON CONFLICT (sector_id, concept_key) DO NOTHING;

-- 2. organisation_sector — M:N: which sector(s) an org operates in. Orthogonal to the org axes
-- (relationship / entity_type_id are untouched; NO sector column on organisations — #10 guard).
-- Created EMPTY: membership is #10/#13's data call (some orgs are multi-sector — see the
-- service_areas water/sanitation rows), so it is NOT backfilled here.
CREATE TABLE IF NOT EXISTS organisation_sector (
  id               serial PRIMARY KEY,
  organisation_id  integer NOT NULL REFERENCES organisations(id),
  sector_id        integer NOT NULL REFERENCES sectors(id),
  CONSTRAINT uniq_organisation_sector UNIQUE (organisation_id, sector_id)
);

COMMIT;

-- Verify:
--   SELECT * FROM sector_terminology ORDER BY sector_id, concept_key;   -- expect 3 rows
--   SELECT to_regclass('public.organisation_sector');                   -- expect non-null
