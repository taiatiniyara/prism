import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { managedLists } from "./managedLists";

export const dataLabelDefinitions = pgTable('data_label_definitions', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name').notNull(),
    category_id: uuid('category_id').notNull().references(() => managedLists.id),
    subcategory_id: uuid('subcategory_id').notNull().references(() => managedLists.id),
    data_type_id: uuid('data_type_id').notNull().references(() => managedLists.id),
    updated_at: timestamp('updated_at').notNull().defaultNow(),
});
export type DataLabelDefinition = typeof dataLabelDefinitions.$inferSelect;
export type NewDataLabelDefinition = typeof dataLabelDefinitions.$inferInsert;