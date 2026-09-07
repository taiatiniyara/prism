# Migration History

A running log of every p1 → p2 `data_entries` migration run — status, counts, issues, and notes. Process is defined in [`migration-runbook.md`](migration-runbook.md). Add a row to the summary table **and** a detailed entry for every run; over time this shows how the extract quality and our loader/cleansing scripts improve.

## Summary

| load_id | Date | Label | Parsed | Loaded | Periods | Rejected (real / benign) | Recon | Issues file |
|--------:|------|-------|-------:|-------:|--------:|--------------------------|-------|-------------|
| 16 | 2026-09-08 | Recovery reload (incl tariff) | 23,747 | 23,339 | 77 | 155 real / 648 benign | sums match; `na` shells variance (expected) | `5_mig_issues_20260908.xlsx` |

*"Real" rejections = rows that did NOT load (type_cast + fk). "Benign" = rows that loaded fine but logged (dedup value-kept + author-nulled).*

---

## Detailed runs

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
