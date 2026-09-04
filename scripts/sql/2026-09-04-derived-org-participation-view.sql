-- Derived org-level benchmarking participation — the replacement for the stored
-- organisations.bm_participates flag (Eugene 2026-09-04, option B; per-period-
-- participation-spec; #10 tiered-access model).
--
-- A utility IS a participant iff it has opted into >=1 report period:
--   is_utility = true AND EXISTS(report_period with bm_opted_in = true).
-- Derived, so it can never drift from the per-period truth — no reconciliation needed.
--
-- #10 gates the "full participant app" (Tier 2) on bm_participates here; the "eligible /
-- can opt in" tier (Tier 1) gates on is_utility alone (resolves the onboarding chicken-and-egg:
-- a newly-registered utility can always reach the opt-in flow, and derived bm_participates
-- flips true the moment they opt into a period). Consumers read THIS view (or the TS helper
-- isOrgBenchmarkingParticipant) instead of organisations.bm_participates, which is retired once
-- #10's access code reads the derived value and is LIVE (destructive-DDL discipline).
--
-- Additive (new view). git-first: committed + pushed before running against p2.

CREATE OR REPLACE VIEW v_organisation_participation AS
SELECT o.id AS organisation_id,
       o.is_utility,
       (o.is_utility = true AND EXISTS (
          SELECT 1 FROM report_periods rp
          WHERE rp.utility_id = o.id AND rp.bm_opted_in = true
       )) AS bm_participates
FROM organisations o;

-- Verify (derived should agree with the current stored flag where it's correct;
-- differences are exactly the periods the stored flag hadn't caught up on):
--   SELECT count(*) FILTER (WHERE bm_participates) AS derived_participants
--   FROM v_organisation_participation;
--   -- cross-check vs stored:
--   SELECT o.id, o.acronym, o.bm_participates AS stored, v.bm_participates AS derived
--   FROM organisations o JOIN v_organisation_participation v ON v.organisation_id = o.id
--   WHERE o.bm_participates <> v.bm_participates;
