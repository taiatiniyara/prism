import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { dataLabelDefinitions } from "./dataLabels";
import { organisations } from "./organisations";

export const reportPeriods = pgTable('report_periods', {
    id: uuid('id').primaryKey().defaultRandom(),
    utility_id: uuid('utility_id').notNull().references(() => organisations.id),
});
export type ReportPeriod = typeof reportPeriods.$inferSelect;
export type NewReportPeriod = typeof reportPeriods.$inferInsert;

export const dataEntries = pgTable('data_entries', {
    id: uuid('id').primaryKey().defaultRandom(),
    report_period_id: uuid('report_period_id').notNull().references(() => reportPeriods.id),
    dl_def_id: uuid('dl_def_id').notNull().references(() => dataLabelDefinitions.id),
    value: varchar('value'),
});
export type DataEntry = typeof dataEntries.$inferSelect;
export type NewDataEntry = typeof dataEntries.$inferInsert;

export const dataEntryLogs = pgTable('data_entry_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    data_entry_id: uuid('data_entry_id').notNull().references(() => dataEntries.id),
    old_value: varchar('old_value'),
    new_value: varchar('new_value'),
    changed_at: timestamp('changed_at').notNull().defaultNow(),
});