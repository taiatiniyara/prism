import { json, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { managedLists } from "./managedLists";
import { DataLabelDefinition } from "./dataLabels";

export const kpiDefinitions = pgTable('kpi_definitions', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name').notNull(),
    description: varchar('description'),
    category_id: uuid('category').notNull().references(() => managedLists.id),
    subcategory_id: uuid('subcategory').notNull().references(() => managedLists.id),
    formula: varchar('formula'),
    inputs: json('inputs').notNull().$type<DataLabelDefinition[]>(),
});
export type KpiDefinition = typeof kpiDefinitions.$inferSelect;
export type NewKpiDefinition = typeof kpiDefinitions.$inferInsert;