import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";

export const managedLists = pgTable("managed_lists", {
    id: uuid("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
})

export const managedListItems = pgTable("managed_list_items", {
    id: uuid("id").primaryKey(),
    list_id: uuid("list_id").notNull().references(() => managedLists.id),
    name: varchar("name", { length: 255 }).notNull(),
})