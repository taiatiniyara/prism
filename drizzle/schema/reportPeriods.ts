import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { organisations } from "./utility";
import { managedListItems } from "./managedLists";

export const reportPeriods = pgTable("report_periods", {
    id: uuid("id").primaryKey().defaultRandom(),
    utility_id: uuid("utility_id").notNull().references(() => organisations.id),
    report_type_id: uuid("report_type_id").notNull().references(() => managedListItems.id),
    report_date: timestamp("report_date").notNull(),
    request_date: timestamp("request_date").notNull(),
    status: uuid("status").notNull().references(() => managedListItems.id),
    who_id: uuid("who_id").notNull().references(() => managedListItems.id),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
});