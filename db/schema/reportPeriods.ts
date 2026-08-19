import {
  boolean,
  integer,
  pgTable,
  serial,
  timestamp,
} from "drizzle-orm/pg-core";
import { organisations } from "./utility";
import { managedListItems } from "./managedLists";
import { roles } from "./auth-schema";
import { DataEntryStatusId } from "./dataEntry";

export const reportPeriods = pgTable("report_periods", {
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
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});
export type ReportPeriod = typeof reportPeriods.$inferSelect & {
  utility?: string | null;
  report_type?: string | null;
  status?: string | null;
  who?: string | null;
};
export type NewReportPeriod = typeof reportPeriods.$inferInsert;
