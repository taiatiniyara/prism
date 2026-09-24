# Migration History

A running log of every p1 → p2 `data_entries` migration run — status, counts, issues, and notes. Process is defined in [`migration-runbook.md`](migration-runbook.md). Add a row to the summary table **and** a detailed entry for every run; over time this shows how the extract quality and our loader/cleansing scripts improve.

## Summary

| load_id | Date | Label | Parsed | Loaded | Periods | Rejected (real / benign) | Recon | Issues file |
|--------:|------|-------|-------:|-------:|--------:|--------------------------|-------|-------------|
| 16 | 2026-09-08 | Recovery reload (incl tariff) | 23,747 | 23,339 | 77 | 155 real / 648 benign | sums match; `na` shells variance (expected) | `5_mig_issues_20260908.xlsx` |
| 17 | 2026-09-24 | Full sync (tariff + 340/342 + gaps) | 24,568 | 24,568¹ | 80 | 0 real / 150 remediated | sums match (FP); `na` shells variance (expected) | `5_mig_issues_20260924.xlsx` |

¹ 24,439 loaded in the main run; the remaining 129 (period 268 + units 698/699) recovered via follow-up loads → **all 24,568 extract rows loaded, zero loss**.

*"Real" rejections = rows that did NOT load (type_cast + fk). "Benign" = rows that loaded fine but logged (dedup value-kept + author-nulled).*

---

## Detailed runs

### load_id 17 — 2026-09-24 — Full sync from p1 (tariff + 340/342 + gap recovery)

**Context.** Routine full re-extract to sync p2 `data_entries` with p1 updates. `data_entries`-only (no `--new-orgs`). Inputs: `3_mig_data_export_20260924_055705.xlsx` + `4_mig_recon_export_20260924_055707.xlsx` (77 recon periods).

**Dry-run.** 24,568 rows, 0 parse errors (both files). Tariff 500–503 present; **340/342 present (252 each)** — the Load #16 omission is filled.

**Load.** Flush-and-reload. Backup `backup.data_entries_run17_20260924` (23,779 rows) taken first. `migration_loads` id 17. ⚠ A transient **Supabase connection drop hit the reconciliation phase** (period 257) — the data had already committed, but the recon loop and `finishLoad` were interrupted. Recovered by re-running the reconciliation for load 17 only (no data reload); load finalized `completed`.

**Result.** 24,439 rows loaded in the main run; **all 24,568 after gap recovery** (below). Value sums reconcile (FP rounding only); value counts match bar 1 (recovered).

**Rejections — 150, ALL remediated (0 real loss):**
| category | n | disposition |
|---|---:|---|
| fk — period 268 | 119 | Extract carried period 268 (empty shells), which the 2026-08-30 FYE cleanup had dropped as an empty duplicate. It's actually **NPC's FY2024 gap** → **recreated period 268 (NPC FY2024)** + loaded its rows (Load #18). |
| fk — units 698/699 | 10 | Units absent in p2 → **dev created 698/699**; rows loaded (Load #19), incl. 1 real value (mig-id 7005). |
| other — author 161 | 21 | Loaded with null author (161 not a p2 user at load) → **user 161 added**, author backfilled to 161 on all 21. |

**Data-quality fix — NPC (org 17) FY structure.** 224's `report_date` was wrong (local 2024-01-01), masquerading as FY2024 and colliding with 268 → 268 dropped. Corrected: **224 → FY2023** (2023-06-30), **268 → FY2024** (2024-06-30), **254 = FY2025** (2025-06-30, unchanged). Three distinct consecutive FYs; all opted-in.

**Post-load.** `units_id_seq` realigned to 699 (dev's explicit 698/699 inserts left it behind → next app insert would have collided). `data_entries.id` is uuid → no realignment there. Compute-layer regen (calculated measures / hours / KPI recompute) + Step-4 `kpi_actual` recompute coordinated with #3/#8/#1.

**Recon note.** Scorecard `is_balanced=false` lines dominated by the expected **p1-shells-for-everyone vs p2-no-shells** `fill/na` variance. Issues workbook: `5_mig_issues_20260924.xlsx` (Summary + Missing FK reference + Author not in p2 + Recon Variances; `load_id` + `source_ref` trace keys; remediation column marks all resolved).

### load_id 16 — 2026-09-08 — Recovery reload (incl tariff + 340/342)

**Context.** Recovery after the 2026-09-04 `data_entries` wipe (schema drift reconciled with `db-push --force`, which recreated the table and dropped all rows). First migration to include **tariff** data.

**Inputs.** `3_mig_data_export_20260908_042822.xlsx` (extract) + `4_mig_recon_export_20260908_042823.xlsx` (control totals, 77 periods).

**Parse / dry-run.** Initial dry-run: 21,976 rows with **1,771 parse errors** — extract used `value_type = "number"` where the parser wanted `numeric`. Fixed via `VALUE_TYPE_ALIASES` in `parse.ts` (PR #382, git-first) → re-dry-run **23,747 rows, 0 errors**.

**Load.** Flush-and-reload, ~25 min. `migration_loads` id 16, status `completed`, exit 1 (variances flagged, not a failure).

**Result.**
- **23,339 rows loaded across 77 periods** (from 0).
- **Tariff (measures 500–503): 3,004 rows** — first-time load. ✓
- Value **sums reconcile** (floating-point rounding only).

**Rejections — 803 total:**
| category | n | loaded? | meaning |
|---|---:|---|---|
| unique | 396 | yes (benign) | no-data superseded by a real value at same cell — value kept |
| other | 252 | yes (benign) | p1 author id 113 not a p2 user — row loaded, author nulled |
| type_cast | 143 | **NO** | value like `">300"` not storable as numeric |
| fk | 12 | **NO** | units 696 (6) + 697 (6) not present in p2 |

**Issues / gaps (open):**
1. **Measures 340/342 (Network Planned/Unplanned Downtime Events): 0 rows** — the extract did not contain them (0 loaded, 0 rejected), though they were expected this run. Export gap.
2. **143 uncastable values** (`>300`-style) + **12 rows for units 696/697** = 155 rows not loaded.
3. **Period 224 (NPC FY2024)** — in the Aug-30 backup (16 rows) but omitted by this extract → now empty. (Had been deliberately kept pre-wipe; the fresh extract supersedes.)

**Reconciliation note.** 311 unbalanced scorecard lines; dominated by `na` ("no-data") counts far lower in the reload than the control totals (e.g. 705 → 21 on `fill/na`) — the expected **p1 shells-for-everyone vs p2 no-shells** model difference, not a loss.

**Post-load steps.** Pending Eugene's decisions on the gaps above, then: re-apply raw-data cleanups + coordinate #3/#8 compute regeneration (calculated measures, hours_in_period, KPI recompute) → rebuild gold/silver. Statuses follow the current per-period participation model (not the old approval model).

**Issues workbook.** `5_mig_issues_20260908.xlsx` (Summary + one sheet per category + Recon Variances; each row carries `load_id` + `source_ref` mig-id + raw payload).
