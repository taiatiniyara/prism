import {
  boolean,
  integer,
  pgTable,
  serial,
  varchar,
} from "drizzle-orm/pg-core";

export const managedLists = pgTable("managed_lists", {
  id: serial("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
});
export type ManagedList = typeof managedLists.$inferSelect;
export type NewManagedList = typeof managedLists.$inferInsert;

export const managedListItems = pgTable("managed_list_items", {
  id: serial("id").primaryKey().notNull(),
  list_id: integer("list_id")
    .notNull()
    .references(() => managedLists.id),
  parent_id: integer("parent_id"),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  is_active: boolean("is_active").default(true).notNull(),
  color: varchar("color").notNull().default("#EE32DD"),
});
export type ManagedListItem = typeof managedListItems.$inferSelect;
export type NewManagedListItem = typeof managedListItems.$inferInsert;
