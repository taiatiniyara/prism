import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const sidebarAccess = pgTable("sidebar_access", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  page: text("page").notNull(),
  roles: text("roles").notNull(),
  order: integer("order").notNull().default(0),
});
export type SidebarAccess = typeof sidebarAccess.$inferSelect;
export type NewSidebarAccess = typeof sidebarAccess.$inferInsert;
