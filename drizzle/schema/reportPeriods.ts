import { integer, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { organisations } from "./utility";
import { managedListItems } from "./managedLists";

export const reportPeriods = pgTable("report_periods", {
    id: serial("id").primaryKey().notNull(),
    utility_id: integer("utility_id").notNull().references(() => organisations.id),
    report_type_id: integer("report_type_id").notNull().references(() => managedListItems.id),
    report_date: timestamp("report_date").notNull(),
    request_date: timestamp("request_date").notNull(),
    status: integer("status").notNull().references(() => managedListItems.id),
    who_id: integer("who_id").notNull().references(() => managedListItems.id),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
});