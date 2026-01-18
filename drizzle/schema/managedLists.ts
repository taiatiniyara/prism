import { json, pgTable, serial, varchar } from "drizzle-orm/pg-core";

interface ManagedListItem {
    id: number;
    name: string;
}

export const managedLists = pgTable("managed_lists", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    items: json("items").notNull().$type<ManagedListItem[]>(),
})