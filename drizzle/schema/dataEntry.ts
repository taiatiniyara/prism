import { pgTable, uuid } from 'drizzle-orm/pg-core';

export const dataLabelDefinitions = pgTable('data_label_definitions', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: uuid('name').notNull(),
});