import { integer, pgTable, serial, uuid, varchar } from 'drizzle-orm/pg-core';
import { organisations } from './utility';

export const reportPeriods = pgTable('report_periods', {
    id: serial('id').primaryKey(),
    utility_id: integer('utility_id').notNull().references(() => organisations.id),
});

export const dataLabelDefinitions = pgTable('data_label_definitions', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
});

export const dataEntries = pgTable('data_entries', {
    id: uuid('id').primaryKey().defaultRandom(),
    dl_def_id: uuid('dl_def_id').notNull().references(() => dataLabelDefinitions.id),
    value: varchar('value', { length: 255 }).notNull(),
});

export const dataEntryLogs = pgTable('data_entry_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    data_entry_id: uuid('data_entry_id').notNull().references(() => dataEntries.id),
    previous_value: varchar('previous_value', { length: 255 }).notNull(),
    new_value: varchar('new_value', { length: 255 }).notNull(),
})