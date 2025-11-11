import { boolean, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { managedLists } from "./managedLists";

export const countries = pgTable('countries', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name').notNull(),
    iso_alpha_2: varchar('iso_alpha_2', { length: 2 }).notNull(),
    iso_alpha_3: varchar('iso_alpha_3', { length: 3 }).notNull(),
    sub_region_id: uuid('sub_region_id').notNull().references(() => managedLists.id),
});
export type Country = typeof countries.$inferSelect;
export type NewCountry = typeof countries.$inferInsert;

export const organisations = pgTable('organisations', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name').notNull(),
    acronym: varchar('acronym'),
    country_id: uuid('country_id').notNull().references(() => countries.id),
    is_utility: boolean('is_utility').notNull().default(true),
    is_active: boolean('is_active').notNull().default(true),
});
export type Organisation = typeof organisations.$inferSelect;
export type NewOrganisation = typeof organisations.$inferInsert;