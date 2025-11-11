import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";

export const managedListTypes = pgTable('managed_list_types', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name').notNull(),
    description: varchar('description'),
});
export type ManagedListType = typeof managedListTypes.$inferSelect;
export type NewManagedListType = typeof managedListTypes.$inferInsert;

export const managedLists = pgTable('managed_lists', {
    id: uuid('id').primaryKey().defaultRandom(),
    type_id: uuid('type_id').notNull().references(() => managedListTypes.id),
    name: varchar('name').notNull(),
    description: varchar('description'),
});
export type ManagedList = typeof managedLists.$inferSelect;
export type NewManagedList = typeof managedLists.$inferInsert;