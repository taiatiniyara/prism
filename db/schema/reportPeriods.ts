import { eq, sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  serial,
  timestamp,
} from "drizzle-orm/pg-core";
import { organisations } from "./utility";
import { managedListItems } from "./managedLists";
import { roles } from "./auth-schema";
import { DataEntryStatusId, APPROVED_STATUS } from "./dataEntryStatus";

export const reportPeriods = pgTable(
  "report_periods",
  {
    id: serial("id").primaryKey().notNull(),
    utility_id: integer("utility_id")
      .notNull()
      .references(() => organisations.id),
    report_type_id: integer("report_type_id")
      .notNull()
      .references(() => managedListItems.id),
    report_date: timestamp("report_date").notNull(),
    request_date: timestamp("request_date").notNull(),
    // Repointed 2026-08-18 from managed-list 21 ("Data Workflow Status", 840-845)
    // to the shared DataEntryStatusId enum (1-7) — same status model as data_entries.
    // FK to managed_list_items dropped; list 21 now deletable.
    status_id: integer("status_id").$type<DataEntryStatusId>(),
    who_id: integer("who_id").references(() => roles.id),
    // Lean data-entry workflow (BLO-activated per period): the BLO enters and vouches
    // in one action → entry lands at Reviewed(4). Per lean-data-entry-workflow-spec.
    lean_mode: boolean("lean_mode").notNull().default(false),
    // Per-period benchmarking opt-in: the utility explicitly participated in
    // benchmarking for THIS report period (per docs/per-period-participation-spec.md).
    // Distinct from the org-level eligibility (now just organisations.is_utility) —
    // participation is purely this per-period flag. Canonical "period is benchmarked"
    // predicate: organisations.is_utility = true AND report_periods.bm_opted_in = true.
    bm_opted_in: boolean("bm_opted_in").notNull().default(false),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // Period status may hold ONLY period-lifecycle states {Pending(2), Entered(3),
    // Reviewed(4), Approved(5)} — never retired Requested(1)/Endorsed(6) or the
    // shell-only Not_Available(7). The 2026-08-18 wholesale repoint to the shared enum
    // left 1/6/7 admissible on periods; this CHECK bounds it (#8 ruling 2026-08-30).
    // NULL passes (unknown), preserving the nullable column.
    statusLifecycle: check(
      "chk_rp_status_lifecycle",
      sql`${t.status_id} IN (2, 3, 4, 5)`,
    ),
  }),
);

// Publish gate (#8 ruling 2026-08-30): a period feeds Power BI / benchmarking ONLY when its
// status is EXACTLY Approved(5) — EQUALITY, not `>= 5` (which would admit a stray
// Not_Available(7)). Period status is the recorded CEO act that vouches for the whole period.
// Single home for the fact-route publish filter — the ~25 fact/dim routes import this, replacing
// the pre-repoint `isNotNull(status_id)` gate (which now wrongly admits Pending/Entered/Reviewed).
export const publishedPeriodCondition = eq(reportPeriods.status_id, APPROVED_STATUS);
export type ReportPeriod = typeof reportPeriods.$inferSelect & {
  utility?: string | null;
  report_type?: string | null;
  status?: string | null;
  who?: string | null;
};
export type NewReportPeriod = typeof reportPeriods.$inferInsert;
