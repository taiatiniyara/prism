-- Drop kpi_calculation_attempts.deferred_follow_up.
--
-- The column was only ever written (by markDeferredFollowUpForScope on scope-lock
-- contention) and never read — the actual deferred-follow-up mechanism is the
-- in-memory Set + queueMicrotask re-trigger in kpi-worker/worker.ts. The code
-- that wrote it is removed (#237); this drops the dead column.
--
-- git-before-DB: apply only after the code PR that stops writing it is merged.

ALTER TABLE kpi_calculation_attempts DROP COLUMN IF EXISTS deferred_follow_up;
