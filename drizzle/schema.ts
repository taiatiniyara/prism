import { pgTable, text } from "drizzle-orm/pg-core";

export const dataLabelDefinitions = pgTable("data_label_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
});
export type DataLabelDefinition = typeof dataLabelDefinitions.$inferSelect;
export type NewDataLabelDefinition = typeof dataLabelDefinitions.$inferInsert;

export const kpiDefinitions = pgTable("kpi_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
});
export type KpiDefinition = typeof kpiDefinitions.$inferSelect;
export type NewKpiDefinition = typeof kpiDefinitions.$inferInsert;
