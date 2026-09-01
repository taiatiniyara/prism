import { integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { organisations } from "./utility";
import { managedListItems } from "./managedLists";

export const governanceData = pgTable("governance_data", {
  id: serial("id").primaryKey().notNull(),
  dl_def_id: integer("dl_def_id")
    .notNull()
    .references(() => managedListItems.id),
  utility_id: integer("utility_id")
    .notNull()
    .references(() => organisations.id),
  value: varchar("value", { length: 255 }),
  updated_by: integer("updated_by"),
  updated_date: timestamp("updated_date").defaultNow(),
});

export type GovernanceDataRow = typeof governanceData.$inferSelect;
export type NewGovernanceDataRow = typeof governanceData.$inferInsert;

export const utilityContextData = pgTable("utility_context_data", {
  id: serial("id").primaryKey().notNull(),
  dl_def_id: integer("dl_def_id")
    .notNull()
    .references(() => managedListItems.id),
  utility_id: integer("utility_id")
    .notNull()
    .references(() => organisations.id),
  value: varchar("value", { length: 255 }),
  report_period_id: integer("report_period_id"),
  updated_by: integer("updated_by"),
  updated_date: timestamp("updated_date").defaultNow(),
});

export type UtilityContextDataRow = typeof utilityContextData.$inferSelect;
export type NewUtilityContextDataRow = typeof utilityContextData.$inferInsert;
