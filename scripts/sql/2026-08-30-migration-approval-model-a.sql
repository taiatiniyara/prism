-- Migration status reconciliation — MODEL A (preserve p1 CEO-approval end-to-end).
-- Ruled 2026-08-30: Eugene (Model A) + #8 (transporting a RECORDED period-scoped act is faithful,
-- not a fabricated approval; empties → not_available).
--
-- Context: p1 report periods were "CEO Approved" (legacy 844 → DataEntryStatusId.Approved=5). That
-- act was PERIOD-SCOPED — approving a period approved its content wholesale. The run-5 loader set
-- periods=Approved but DERIVED shell statuses independently (empty→Pending(2), filled/no-data→
-- Entered(3)), producing Approved-period/non-Approved-shell — a state that (a) violates the invariant
-- "Approved period ⇒ all in-scope shells terminal-approved" and (b) leaks ~7,612 un-approved shells
-- to the Power BI feeds (which gate on the period only).
--
-- Fix (Model A): shells of an Approved period inherit Approved(5). Truly-empty shells (no value,
-- no no_data_reason) become no_data_reason='not_available' (the CEO approving a period with a blank
-- cell is the implicit "data wasn't available") — loader-derived, marked in comments so evidence
-- views can distinguish them from genuine utility not_available answers (NOT asserted_not_applicable:
-- no utility assertion occurred).
--
-- ONE-TIME correction for data already loaded by the run-5 loader. The durable fix is in the loader
-- (lib/migration/load.ts) so future flush-and-reloads produce Model-A statuses directly; this script
-- is only needed where data was loaded before that loader change. Per-env. Backup first.

BEGIN;

-- 0. backup (idempotent guard: fails loudly if a same-day backup already exists — rename if re-running)
CREATE TABLE backup.data_entries_pre_approvalA_20260830 AS TABLE data_entries;

-- 1. truly-EMPTY shells under an Approved period → not_available + Approved(5) + loader-derived comment
UPDATE data_entries de
SET no_data_reason = 'not_available',
    status_id = 5,
    comments = (
      COALESCE(de.comments::jsonb, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'comment',       'Loader-derived (migration Model A): not_available inferred from a CEO-approved period with a blank cell — implicit acceptance that data was unavailable. Not a utility assertion.',
        'commenterId',   'system:migration',
        'commenterName', 'Migration (Model A)',
        'commenterRole', 'system',
        'date',          now(),
        'resolved',      true
      ))
    )::json,
    updated_at = now()
FROM report_periods rp
WHERE rp.id = de.report_period_id AND rp.status_id = 5
  AND de.status_id < 5
  AND de.value_numeric IS NULL AND de.value_boolean IS NULL
  AND de.value_text IS NULL AND de.value_option_id IS NULL
  AND de.no_data_reason IS NULL;

-- 2. all remaining shells under an Approved period not yet Approved → Approved(5)
--    (each already carries a value or a no_data_reason, so chk_value_xor_nodata holds)
UPDATE data_entries de
SET status_id = 5, updated_at = now()
FROM report_periods rp
WHERE rp.id = de.report_period_id AND rp.status_id = 5 AND de.status_id < 5;

COMMIT;

-- Verify (expect: no shell < 5 under any Approved period; 0 empty shells remain):
--   SELECT count(*) FROM data_entries de JOIN report_periods rp ON rp.id=de.report_period_id
--     WHERE rp.status_id=5 AND de.status_id<5;                       -- expect 0
--   SELECT count(*) FROM data_entries WHERE value_numeric IS NULL AND value_boolean IS NULL
--     AND value_text IS NULL AND value_option_id IS NULL AND no_data_reason IS NULL; -- expect 0
