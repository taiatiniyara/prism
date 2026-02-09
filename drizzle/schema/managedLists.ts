import { pgTable, serial, varchar } from "drizzle-orm/pg-core";

export const managedLists = pgTable("managed_lists", {
    id: serial("id").primaryKey().notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
})

export const managedListItems = pgTable("managed_list_items", {
    id: serial("id").primaryKey().notNull(),
    list_id: serial("list_id").notNull().references(() => managedLists.id),
    name: varchar("name", { length: 255 }).notNull(),
})