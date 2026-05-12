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
export type ManagedList = typeof managedLists.$inferSelect & {
  items?: ManagedListItem[];
};
export type NewManagedList = typeof managedLists.$inferInsert;

export const managedListItems = pgTable("managed_list_items", {
  id: serial("id").primaryKey().notNull(),
  list_id: integer("list_id")
    .notNull()
    .references(() => managedLists.id),
  parent_id: integer("parent_id"),
  energy_resource_type_id: integer("energy_resource_type_id"),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  is_active: boolean("is_active").default(true).notNull(),
  color: varchar("color").notNull().default("#EE32DD"),
});
export type ManagedListItem = typeof managedListItems.$inferSelect & {
  list?: string;
  parent?: string | null;
  energy_resource_type?: string | null;
};
export type NewManagedListItem = typeof managedListItems.$inferInsert;

export const energyResourceTypeRelevance = pgTable(
  "energy_resource_type_relevance",
  {
    id: serial("id").primaryKey().notNull(),
    energy_resource_type_id: integer("energy_resource_type_id").notNull(),
    energy_type_id: integer("energy_type_id").notNull(),
    energy_source_id: integer("energy_source_id").notNull(),
  },
);
export type EnergyResourceTypeRelevance =
  typeof energyResourceTypeRelevance.$inferSelect;
export type NewEnergyResourceTypeRelevance =
  typeof energyResourceTypeRelevance.$inferInsert;
