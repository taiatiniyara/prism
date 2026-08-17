# Workflow-status rationalisation — unify on the code enum, retire the managed list

**Status:** PROPOSED (2026-08-17) · **Author:** #2/jolly (migration) · **For:** #4 (report_periods DDL + medallion views) · cc #11 (UI), #3 (calculator)

## Problem — two status vocabularies for one concept

The data-entry workflow status exists **twice**, with mismatched ids/labels, which misleads consumers (especially AI):

| | `data_entries.status_id` | `report_periods.status_id` |
|---|---|---|
| Vocabulary | code enum `DataEntryStatusId` | managed list 21 "Data Workflow Status" |
| Ids | 1–5 | 840–845 |
| FK? | none (plain int, code-owned) | **yes → `managed_list_items`** |
| Live rows | 0 (pre-migration) | **147, all = 844 "CEO Approved"** |
| Grain | per-cell entry | per-period submission |

The list also (a) orders Pending/Entered opposite to the enum, (b) splits BLO Reviewed / CEO Approved / **BMO Endorsed**, and (c) still carries the **retired BMO Endorsed** step. Eugene confirmed: **BMO endorsement is removed — CEO Approved is the terminal, publishable state.**

## Decision — the code enum is the single source of truth

Workflow status is a **state machine / control-flow contract** (publish gate `status_id >= 5`, transition guards, role-gating), **not** BMO-editable reference data — so it stays a code enum, and the managed list is retired as a status vocabulary. (Same principle already applied to `status_id` vs `no_data_reason`.) The enum now carries the BLO/CEO business labels the managed list used to hold, so nothing is lost.

## Done in this stream (migration) — `db/schema/dataEntry.ts`

- Enriched the enum with a single-source `DATA_ENTRY_STATUS_META` map: business `label` + `description` + `color` + `publishable` for states 1–5 (`4 Reviewed → "BLO Reviewed"`, `5 Approved → "CEO Approved"`).
- Added `APPROVED_STATUS` + `isPublishableStatus(statusId)` so the `>= 5` gate has a named home.
- `DataEntryStatusList` now exposes `label`/`description`/`publishable` (additive — existing `id`/`name`/`color` consumers unaffected).
- Confirmed `Endorsed (6)` and `Not_Available (7)` are retired (BMO step gone; availability moved to `no_data_reason`).

## Actions required of #4

`report_periods` is your shared table (147 live rows; API routes `factAirConnectivity`/`dimUtilities`/`factCountryContextData` read `reportPeriods.status_id`). Please:

1. **Migrate `report_periods.status_id` onto the enum** using this map (all 147 current rows are `844 → 5`):

   | managed list 21 | → enum |
   |---|---|
   | 840 Requested | 1 Requested |
   | 842 Pending | 2 Pending |
   | 841 Entered | 3 Entered |
   | 843 BLO Reviewed | 4 Reviewed |
   | 844 CEO Approved | **5 Approved** |
   | 845 BMO Endorsed | 5 Approved (retired step collapses) |

2. **Drop the FK** `report_periods.status_id → managed_list_items` and treat the column as `DataEntryStatusId` (like `data_entries.status_id`).
3. **Medallion views:** add a `status_label` (and `status_publishable`) column to the Silver/Gold surfaces for **both** `data_entries` and `report_periods`, derived from `status_id` via `DATA_ENTRY_STATUS_META` in `db/schema/dataEntry.ts` — so **AI never joins `managed_list_items` for status** and never sees 840–845. Use `isPublishableStatus` / `APPROVED_STATUS` rather than a literal `>= 5`.
4. **Retire managed list 21** after the repoint (only `report_periods` referenced it): delete items 840–845, or set `is_active = false` if you prefer a soft retire.

## Sequencing / who does what

- **#4 first:** steps 1–2 (migrate data + drop FK), then 3–4.
- **#2/jolly (me), after #4's step 2 lands:** update the migration writer in `app/migration/service.ts` that currently writes `report_periods.status_id = 844` (and the `managedListItemIds.has(844)` fallback, ~lines 1203–1206, 1592) to write enum **5 (Approved)**. Must follow the FK drop, not precede it.
- **#11:** no action required — `reportPeriodTable.tsx` reads `DataEntryStatusList.name`/`.color`, which are unchanged; the new `label`/`description` are available if you want to surface CEO/BLO wording.

No `data_entries` change (it's already enum-typed, 0 rows).
