import { integer, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { organisations } from "./utility";
import { managedListItems } from "./managedLists";
import { roles } from "./auth-schema";

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
  status_id: integer("status_id").references(() => managedListItems.id),
  who_id: integer("who_id").references(() => roles.id),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});
export type ReportPeriod = typeof reportPeriods.$inferSelect & {
  utility?: string | null;
  report_type?: string | null;
  status?: string | null;
  who?: string | null;
};
export type NewReportPeriod = typeof reportPeriods.$inferInsert;
