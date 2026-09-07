# `report_periods` → `submissions` rename — tracking note

**Status:** planned, not started. Captured 2026-09-08 (#2) after Eugene's deliberation + #8's weigh-in. **No DDL executed.** This note scopes the eventual atomic rename so it lands cleanly.

## Decision & rationale

`report_periods` is misnamed: it models a per-`(utility, period)` **submission cycle** — `report_type_id`, `report_date`/`request_date`, lifecycle `status_id` (Pending→Entered→Reviewed→Approved), `who_id`, `lean_mode`, and `bm_opted_in`, with every `data_entries` row hanging off `report_period_id`. The name should be **`submissions`**.

- **Already ratified**, per #8: Eugene ruled the rename on 2026-07-24 (time-series reconciliation — "a reporting instance / work-order, not a time anchor"); the per-period-participation spec sequenced `bm_opted_in` onto the final name. So this note **executes**, it does not re-decide.
- **`bm_opted_in` stays** (not folded into row-existence). #8: it is a *recorded utility act* ("acts recorded, never inferred", the same rule behind `status = Approved`). Inferring opt-in from row existence breaks the "due, not yet opted" reminder state, survives cleanups/monthly re-entry poorly, and would make the outermost compute-scope gate implicit (the p1 auto-shell failure mode). Opt-in = **compute universe**; `status = Approved` = **publish universe** — kept distinct.

## Scope — ship NAME-ONLY

Rename the table and its references **only**. Do **not** couple in the `report_type` / `report_date` fold into the period dimension — that is the *other half* of the 2026-07-24 reconciliation and waits for the period dim to land (#8). Keep them decoupled.

## Blast radius (to sweep atomically, single author, one branch)

- **Schema:** `db/schema/reportPeriods.ts` — table name `report_periods` → `submissions`, exported `reportPeriods` symbol, `ReportPeriod`/`NewReportPeriod` types, `publishedPeriodCondition`, the `chk_rp_status_lifecycle` CHECK name.
- **FK:** `data_entries.report_period_id` (+ any other inbound FK to `report_periods` — do a full inbound-FK sweep before writing the migration). Decide whether the column name `report_period_id` also renames (`submission_id`) or stays — recommend a follow-up, keep column name in the name-only pass to bound scope.
- **~25 Power BI fact/dim routes** importing `publishedPeriodCondition` — the #78 atomic-sweep precedent applies (they break tsc the instant the symbol renames, so they ride the same branch).
- **Participation helpers:** `lib/benchmarking/participation.ts` (`benchmarkingParticipantCondition`, `listBenchmarkingPeriodIds`, `isBenchmarkingParticipant`, `isOrgBenchmarkingParticipant`) + the `v_organisation_participation` view + any SQL twins.
- **Other readers:** `app/data-entry/kpi-worker/recompute.ts`, `app/settings/kpi/unified-formula-service.ts`, service-area `report_periods` jsonb references (name-collision — that jsonb column is unrelated; do NOT touch), migration loader `lib/migration/load.ts` / `parse.ts`, `--new-orgs` onboarding step.

## Execution discipline

- **git-first + atomic:** schema + all `.ts` + all `.tsx` + the SQL migration on ONE branch, one squash-merge (the DDL `ALTER TABLE ... RENAME TO` is a separate manual apply after merge).
- **Destructive-DDL / verify-live:** a table rename is a contract break. Merge the code, confirm the deploy is green + `/api/health` before applying the `RENAME` to p2 (merged ≠ live — cf. the 2026-09-02 org-page outage). Consider a compatibility view (`CREATE VIEW report_periods AS SELECT * FROM submissions`) to bridge the deploy window, dropped once live.
- **Optional hardening (#8):** add `CHECK (bm_opted_in = true OR status_id = Pending)` — mechanizes "never Approved-but-not-opted-in" (participation-spec §5.2).
- **No USER-IMPACT row** unless UI labels change (name-only rename doesn't).

## Sign-offs

- #8 (owns lifecycle CHECK + publish gate): endorsed name-only, with atomicity caution + the CHECK hardening. ✅
- #4 (schema owner): weigh-in pending (idle at capture time).
- #2 (this stream): owns the DDL execution when scheduled.
