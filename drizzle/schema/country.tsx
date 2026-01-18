import { pgTable, serial } from "drizzle-orm/pg-core";

export const countries = pgTable("countries", {
  id: serial("id").primaryKey(),
  name: serial("name").notNull(),
});
