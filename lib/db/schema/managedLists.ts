import { boolean, json, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

interface ManagedListItem {
    id: string;
    name: string;
    description: string;
}

export const managedLists = pgTable("managed_lists", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    list: json("list").notNull().$type<ManagedListItem[]>(),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    updatedBy: varchar("updated_by", { length: 255 }).notNull(),
});