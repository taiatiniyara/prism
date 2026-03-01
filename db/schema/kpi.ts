import {
  boolean,
  integer,
  json,
  pgTable,
  serial,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { FormulaInput } from "./dataEntry";
import { reportPeriods } from "./reportPeriods";
import { managedListItems } from "./managedLists";

export const kpiDefinitions = pgTable("kpi_definitions", {
  id: serial("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  formula: varchar("formula").notNull(),
  formula_inputs: json("formula_inputs").notNull().$type<FormulaInput[]>(),
  limit_lower: varchar("limit_lower", { length: 255 }),
  limit_upper: varchar("limit_upper", { length: 255 }),
  type_id: integer("type_id")
    .notNull()
    .references(() => managedListItems.id),
});
export type KpiDefinition = typeof kpiDefinitions.$inferSelect & {
  type?: string | null;
};
export type NewKpiDefinition = typeof kpiDefinitions.$inferInsert;

export enum PerspectiveLevel {
  Financial = 1,
  Customer = 2,
  Operation = 3,
  Development = 4,
}

export const kpi = pgTable("kpi", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  report_period_id: serial("report_period_id")
    .notNull()
    .references(() => reportPeriods.id),
  kpi_def_id: serial("kpi_def_id")
    .notNull()
    .references(() => kpiDefinitions.id),
  target_value: varchar("target_value", { length: 255 }),
  actual_value: varchar("actual_value", { length: 255 }).notNull(),
  comments: varchar("comments", { length: 255 }),
  is_relevant: boolean("is_relevant").default(true).notNull(),
  is_favourite: boolean("is_favourite").default(false).notNull(),
});
export type Kpi = typeof kpi.$inferSelect & {
  report_period?: string | null;
  kpi_def?: string | null;
};
export type NewKpi = typeof kpi.$inferInsert;

export interface BscRelationship {
  bsc_id: string;
  relationship_type: "influences" | "is_influenced_by";
}

export const bsc = pgTable("bsc", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  kpi_id: uuid("kpi_id")
    .notNull()
    .references(() => kpi.id),
  perspective_level: integer("perspective_level")
    .notNull()
    .$type<PerspectiveLevel>(),
  objective: varchar("objective", { length: 100 }).notNull(),
  relationships: json("relationships").$type<BscRelationship[]>(),
});
export type Bsc = typeof bsc.$inferSelect;
export type NewBsc = typeof bsc.$inferInsert;
