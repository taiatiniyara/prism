import {
  boolean,
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { dataEntries, FormulaInput } from "./dataEntry";
import { reportPeriods } from "./reportPeriods";
import { managedListItems } from "./managedLists";
import { organisations } from "./utility";
import { user } from "./auth-schema";

export interface KpiCalculationScopeSnapshot {
  reportPeriodId: number;
  organizationId?: number | null;
  serviceAreaId?: number | null;
  energyResourceId?: number | null;
  energyProviderId?: number | null;
  energySourceId?: number | null;
  customerTypeId?: number | null;
  paymentModeId?: number | null;
}

interface Limit {
  lower: number | null;
  upper: number | null;
  year: number;
  month?: number | null;
}

interface KpiTarget {
  utility_id: number;
  year: number;
  month?: number | null;
  target_value: string;
}

export const kpiDefinitions = pgTable("kpi_definitions", {
  id: serial("id").primaryKey().notNull(),
  unit_id: integer("unit_id")
    .notNull()
    .references(() => managedListItems.id)
    .default(91),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  formula: varchar("formula"),
  formula_inputs: json("formula_inputs").$type<FormulaInput[]>(),
  limits: json("limits").$type<Limit[]>(),
  category_id: integer("category_id")
    .notNull()
    .references(() => managedListItems.id)
    .default(515),
  subcategory_id: integer("subcategory_id")
    .references(() => managedListItems.id)
    .default(600),
  type: varchar("type")
    .default("benchmarking")
    .notNull()
    .$type<"benchmarking" | "custom">(),
  utilities: json("utility_ids").$type<number[]>(),
  owner_user_id: text("owner_user_id").references(() => user.id),
  owner_utility_id: integer("owner_utility_id").references(
    () => organisations.id,
  ),
  targets: json("targets").$type<KpiTarget[]>(),
  block: integer("block").default(60),
  agg_level_id: integer("agg_level_id")
    .notNull()
    .references(() => managedListItems.id)
    .default(1),
  is_kpi_input: boolean("is_kpi_input").default(false).notNull(),
  is_aggregated: boolean("is_aggregated").default(false).notNull(),
  is_currency: boolean("is_currency").default(false).notNull(),
  is_descriptive: boolean("is_descriptive").default(false).notNull(),
  updated_at: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  is_active: boolean("is_active").default(true).notNull(),
});
export type KpiDefinition = typeof kpiDefinitions.$inferSelect & {
  type?: string | null;
  agg_level?: string | null;
  category?: string | null;
  subcategory?: string | null;
  unit?: string | null;
};
export type NewKpiDefinition = typeof kpiDefinitions.$inferInsert;

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
  calculated_at: timestamp("calculated_at").notNull().defaultNow(),
  calculation_formula_version: varchar("calculation_formula_version", {
    length: 255,
  }),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});
export type Kpi = typeof kpi.$inferSelect & {
  report_period?: string | null;
  kpi_def?: string | null;
};
export type NewKpi = typeof kpi.$inferInsert;

export const kpiCalculationAttempts = pgTable(
  "kpi_calculation_attempts",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    trigger_id: uuid("trigger_id").notNull(),
    source_data_entry_id: uuid("source_data_entry_id")
      .notNull()
      .references(() => dataEntries.id),
    kpi_def_id: integer("kpi_def_id").references(() => kpiDefinitions.id),
    report_period_id: integer("report_period_id")
      .notNull()
      .references(() => reportPeriods.id),
    scope: json("scope").$type<KpiCalculationScopeSnapshot>().notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    formula_version: varchar("formula_version", { length: 255 })
      .notNull()
      .default("unspecified"),
    retry_count: integer("retry_count").notNull().default(0),
    max_retries: integer("max_retries").notNull().default(3),
    failure_reason: text("failure_reason"),
    failure_type: varchar("failure_type", { length: 32 }),
    deferred_follow_up: boolean("deferred_follow_up").notNull().default(false),
    started_at: timestamp("started_at"),
    completed_at: timestamp("completed_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("kpi_calc_attempt_trigger_idx").on(table.trigger_id),
    index("kpi_calc_attempt_scope_status_idx").on(
      table.report_period_id,
      table.kpi_def_id,
      table.status,
    ),
  ],
);
export type KpiCalculationAttempt = typeof kpiCalculationAttempts.$inferSelect;
export type NewKpiCalculationAttempt =
  typeof kpiCalculationAttempts.$inferInsert;

export type BscNodeLevel = "perspective" | "objective" | "initiative" | "kpi";

export interface BscNodeRef {
  level: BscNodeLevel;
  perspective_level: PerspectiveLevel;
  objective_description?: string;
  key_initiative_description?: string;
  kpi_id?: number;
}

export interface BscRelationship {
  id: string;
  source: BscNodeRef;
  target: BscNodeRef;
  relationship_type: "influences" | "depends_on" | "contributes_to" | "blocks";
  weight?: number;
  note?: string;
}

export enum PerspectiveLevel {
  Financial = 1,
  Customer = 2,
  Operation = 3,
  Development = 4,
}

export type Perspective = {
  perspective_level: PerspectiveLevel;
  description: string;
  strategic_objective: {
    description: string;
    key_initiatives: {
      description: string;
      kpis: {
        kpi_id: number;

        // if we want to track the KPI at different frequencies for the same initiative, we can add a tracking_frequency field to specify how often the KPI should be tracked (e.g., monthly, annually). The target value will be entered into report periods that align with the specified tracking frequency either monthly or financial year type report periods.
        tracking_frequency: "monthly" | "annually";
        targets: {
          year: number;
          month?: number | null;
          value: string;
        }[];
      }[];
    }[];
  }[];
};

// Balanced Scorecard (BSC) table to link KPIs to strategic perspectives and objectives.
export const bsc = pgTable("bsc", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  utility_id: integer("utility_id")
    .notNull()
    .references(() => organisations.id),
  perspective: json("perspective").$type<Perspective>(),
  relationships: json("relationships").$type<BscRelationship[]>(),
  updated_by_id: text("updated_by_id").references(() => user.id),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});
export type Bsc = typeof bsc.$inferSelect;
export type NewBsc = typeof bsc.$inferInsert;
