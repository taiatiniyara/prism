import { boolean, integer, pgTable, uuid, varchar } from "drizzle-orm/pg-core"
import { organisations } from "./organisations"
import { managedLists } from "./managedLists";
import { reportPeriods } from "./dataEntry";

export const serviceAreas = pgTable('service_areas', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name').notNull(),
    utility_id: uuid('utility_id').notNull().references(() => organisations.id),
    service_type_id: uuid('service_type_id').notNull().references(() => managedLists.id),
    is_active: boolean('is_active').notNull().default(true),
});
export type ServiceArea = typeof serviceAreas.$inferSelect;
export type NewServiceArea = typeof serviceAreas.$inferInsert;

export const generators = pgTable('generators', {
    gen_id: uuid('gen_id').primaryKey().defaultRandom(),
    id: integer('id').notNull(),
    report_period_id: uuid('report_period_id').notNull().references(() => reportPeriods.id),
    utility_id: uuid('utility_id').notNull().references(() => organisations.id),
    service_area_id: uuid('service_area_id').notNull().references(() => serviceAreas.id),
    energy_source_id: uuid('energy_source_id').notNull().references(() => managedLists.id),
    energy_type_id: uuid('energy_type_id').notNull().references(() => managedLists.id),
    energy_provider_id: uuid('energy_provider_id').notNull().references(() => managedLists.id),
    capacity_mw: integer('capacity_mw').notNull(),
    name: varchar('name').notNull(),
});
export type Generator = typeof generators.$inferSelect;
export type NewGenerator = typeof generators.$inferInsert;