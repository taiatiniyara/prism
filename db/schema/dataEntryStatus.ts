// Leaf module — the DataEntryStatusId enum + publish-gate constant, with NO table-schema imports.
//
// Extracted from dataEntry.ts to break the dataEntry <-> reportPeriods import cycle. reportPeriods
// FK-imports nothing from dataEntry's tables, but it needs the status enum (column `.$type`) and,
// since 2026-08-30, APPROVED_STATUS as a VALUE at module-init time (`publishedPeriodCondition`).
// dataEntry.ts FK-imports reportPeriods, so importing these from dataEntry created a circular-init
// (TDZ) crash: `Cannot access 'APPROVED_STATUS' before initialization`. A leaf with no table imports
// cannot participate in that cycle. Both dataEntry.ts and reportPeriods.ts import from here;
// dataEntry.ts re-exports DataEntryStatusId + APPROVED_STATUS so its existing importers are unaffected.

export enum DataEntryStatusId {
  /** @deprecated Requested (1) retired — **Pending (2) is the single starting state** (chosen for its
   * call-to-action: an empty shell is an outstanding task, not a passive request). Shells now birth
   * at Pending; the loader/UI no longer assign 1. Kept only so historical/legacy code resolves. */
  Requested = 1,
  /** Starting state — a generated shell awaiting the utility's data (action needed). */
  Pending = 2,
  Entered = 3,
  /** Reviewed by the BLO. Business label: "BLO Reviewed". */
  Reviewed = 4,
  /** Approved by the utility CEO — the terminal, publishable state. Business label: "CEO Approved". */
  Approved = 5,
  /** @deprecated BMO "Endorsed" step retired — CEO Approved (5) is now the final, publishable
   * state (no separate central endorsement). Legacy Endorsed rows were migrated to Approved (5). */
  Endorsed = 6,
  /** @deprecated retired — answer-availability moved to `data_entries.no_data_reason`
   * (`not_available` / `asserted_not_applicable`). "Not available" is an ANSWER, not a workflow state. */
  Not_Available = 7,
}

/**
 * Publish gate — an entry is approved/publishable (feeds Silver→Gold, Power BI, benchmarking)
 * once it reaches the terminal Approved (CEO Approved) state. Named constant so the `>= 5` rule
 * has a single home; BMO endorsement was removed, so Approved (5) is final.
 */
export const APPROVED_STATUS = DataEntryStatusId.Approved;
