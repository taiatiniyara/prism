-- measure_strata_history — effective-dated grain (strata) overrides (Stage 3, Eugene-directed 2026-09-02).
--
-- WHY: Feeder Type (measure 54) is re-grained from Utility- to ServiceArea-grain for FY2026+ report
-- periods ONLY; historical (≤2025) periods must keep resolving to Utility grain (that's how they were
-- reported). We record the change as an effective-dated override rather than mutating the base
-- measure_definitions.strata_id, so the base stays the historical truth and the new grain applies going
-- forward. General mechanism — any future measure re-grain uses the same table.
--
-- Resolution: effective strata for (measure, fy) = latest history row with effective_from_fy <= fy,
-- else the base measure_definitions.strata_id. With zero history rows everything resolves to base (this
-- change is additive/greenfield — no existing behaviour moves).
--
-- fy = EXTRACT(year FROM report_periods.report_date)::smallint — the same year convention the relevance
-- engine already uses (lib/relevance/expected.ts). Consumed there via effective_strata_id().
--
-- Paired with Drizzle schema db/schema/measureStrataHistory.ts + the expected.ts rewire (Site 1,
-- missingUtilityLevelShells: Feeder Type leaves utility-grain for FY>=2026). serviceAreaCoverage is
-- data-driven (service_area_id present) so 2026 Feeder Type flows into it automatically.
--
-- git-first: schema + this script + the expected.ts change merged to main BEFORE running against p2
-- (single instance). Backup: N/A — new table + new function, purely additive (nothing dropped/altered).
-- BEHAVIOUR-NEUTRAL TODAY: no FY2026 report period carries data_entries yet, so the seeded row changes
-- no current relevance output; it activates when 2026 Feeder Type data (as service-area shells) arrives.

BEGIN;

CREATE TABLE IF NOT EXISTS measure_strata_history (
  id                serial PRIMARY KEY,
  measure_def_id    integer  NOT NULL REFERENCES measure_definitions(id) ON DELETE CASCADE,
  strata_id         integer  NOT NULL REFERENCES managed_list_items(id),
  effective_from_fy smallint NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_measure_strata_history
  ON measure_strata_history (measure_def_id, effective_from_fy);

-- Period-correct strata resolver. STABLE (no writes); safe in SELECT/WHERE.
CREATE OR REPLACE FUNCTION effective_strata_id(p_measure_def_id integer, p_fy smallint)
RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT h.strata_id
       FROM measure_strata_history h
      WHERE h.measure_def_id = p_measure_def_id
        AND h.effective_from_fy <= p_fy
      ORDER BY h.effective_from_fy DESC
      LIMIT 1),
    (SELECT md.strata_id FROM measure_definitions md WHERE md.id = p_measure_def_id)
  );
$$;

-- Seed: Feeder Type (54) -> ServiceArea grain from FY2026. Base (measure_definitions.strata_id=4
-- Utility) is untouched, so <=2025 still resolves to Utility. Strata id resolved by name to survive
-- env drift; guarded so a missing/ambiguous lookup aborts the txn rather than seeding a wrong grain.
DO $$
DECLARE
  v_service_area_id integer;
BEGIN
  SELECT mli.id INTO v_service_area_id
  FROM managed_list_items mli
  JOIN managed_lists ml ON ml.id = mli.list_id
  WHERE mli.name = 'ServiceArea' AND ml.name = 'Strata';

  IF v_service_area_id IS NULL THEN
    RAISE EXCEPTION 'ServiceArea strata not found in Strata list — aborting seed';
  END IF;

  INSERT INTO measure_strata_history (measure_def_id, strata_id, effective_from_fy)
  VALUES (54, v_service_area_id, 2026)
  ON CONFLICT (measure_def_id, effective_from_fy) DO NOTHING;
END $$;

COMMIT;

-- Verify:
--   -- history seeded (expect 54 | <ServiceArea id, =3> | 2026):
--   SELECT * FROM measure_strata_history WHERE measure_def_id = 54;
--   -- resolver: expect 4 (Utility) for 2025, 3 (ServiceArea) for 2026:
--   SELECT effective_strata_id(54, 2025::smallint) AS fy2025, effective_strata_id(54, 2026::smallint) AS fy2026;
--   -- unchanged measures resolve to base (e.g. a utility-grain measure -> 4 for any fy):
--   SELECT effective_strata_id(51, 2026::smallint);
