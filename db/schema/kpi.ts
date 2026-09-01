import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  json,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  dataEntries,
  DefinitionStatus,
  FormulaInput,
} from "./dataEntry";
import { reportPeriods } from "./reportPeriods";
import { managedListItems } from "./managedLists";
import { organisations, powerStations, serviceAreas, units } from "./utility";
import { countries, subRegions } from "./country";
import { user } from "./auth-schema";

export interface KpiCalculationScopeSnapshot {
  reportPeriodId: number;
  organizationId?: number | null;
  serviceAreaId?: number | null;
  unitId?: number | null;
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
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  formula: varchar("formula"),
  formula_inputs: json("formula_inputs").$type<FormulaInput[]>(),
  category_id: integer("category_id")
    .notNull()
    .references(() => managedListItems.id)
    .default(515),
  subcategory_id: integer("subcategory_id")
    .references(() => managedListItems.id)
    .default(600),
  strata_id: integer("strata_id")
    .notNull()
    .references(() => managedListItems.id)
    .default(1),
  is_aggregated: boolean("is_aggregated").default(false).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  unit_id: integer("unit_id")
    .notNull()
    .references(() => managedListItems.id)
    .default(91),
  block: integer("block").default(60),

  is_currency: boolean("is_currency").default(false).notNull(),
  is_descriptive: boolean("is_descriptive").default(false).notNull(),
  utility_ids: json("utility_ids").$type<number[]>(),
  owner_utility_id: integer("owner_utility_id").references(
    () => organisations.id,
  ),
  type: varchar("type")
    .default("benchmarking")
    .notNull()
    .$type<"benchmarking" | "custom">(),
  limits: json("limits").$type<Limit[]>(),
  targets: json("targets").$type<KpiTarget[]>(),
  is_kpi_input: boolean("is_kpi_input").default(true).notNull(),
  owner_user_id: text("owner_user_id").references(() => user.id),
  is_private: boolean("is_private").default(false).notNull(),
  definition: text("definition"),
  synonyms: json("synonyms").$type<string[]>(),
  definition_status: varchar("definition_status", {
    length: 16,
  }).$type<DefinitionStatus>(),
  updated_at: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
export type KpiDefinition = typeof kpiDefinitions.$inferSelect & {
  type?: string | null;
  strata?: string | null;
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
        kpi_id?: number | null;
        pending_custom_kpi?: {
          request_id: string;
          title: string;
          status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "REPLACED";
          approved_kpi_definition_id?: number | null;
        };

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

// KPI formula bindings live in ./formulaBinding (formula_binding / formula_binding_dimension).

// Computed KPI actuals — the deterministic result of running a KPI formula
// over data_entries at a given grain/address (region → subregion → country →
// utility → area → station → unit). Value XOR no_data_reason (never both).
export const kpiActual = pgTable(
  "kpi_actual",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    kpi_def_id: integer("kpi_def_id")
      .notNull()
      .references(() => kpiDefinitions.id),
    period_id: integer("period_id").notNull(),
    utility_id: integer("utility_id").references(() => organisations.id),
    country_id: integer("country_id").references(() => countries.id),
    subregion_id: integer("subregion_id").references(() => subRegions.id),
    region: text("region").notNull(),
    service_area_id: integer("service_area_id").references(
      () => serviceAreas.id,
    ),
    power_station_id: integer("power_station_id").references(
      () => powerStations.id,
    ),
    unit_id: integer("unit_id").references(() => units.id),
    provider_id: integer("provider_id")
      .notNull()
      .references(() => managedListItems.id),
    category_id: integer("category_id")
      .notNull()
      .references(() => managedListItems.id),
    technology_id: integer("technology_id")
      .notNull()
      .references(() => managedListItems.id),
    asset_class_id: integer("asset_class_id")
      .notNull()
      .references(() => managedListItems.id),
    customer_type_id: integer("customer_type_id")
      .notNull()
      .references(() => managedListItems.id),
    payment_mode_id: integer("payment_mode_id")
      .notNull()
      .references(() => managedListItems.id),
    consumption_band_id: integer("consumption_band_id")
      .notNull()
      .references(() => managedListItems.id),
    division_id: integer("division_id")
      .notNull()
      .references(() => managedListItems.id),
    gender_id: integer("gender_id")
      .notNull()
      .references(() => managedListItems.id),
    utility_function_id: integer("utility_function_id")
      .notNull()
      .references(() => managedListItems.id),
    value: numeric("value"),
    no_data_reason: varchar("no_data_reason", { length: 32 }),
    computed_at: timestamp("computed_at"),
    formula_version: varchar("formula_version"),
    owning_org_id: integer("owning_org_id").references(() => organisations.id),
    updated_at: timestamp("updated_at"),
    // Coarse, derived grain label — the finest address level populated.
    grain_level: text("grain_level").generatedAlwaysAs(sql`
CASE
    WHEN (unit_id IS NOT NULL) THEN 'unit'::text
    WHEN (power_station_id IS NOT NULL) THEN 'station'::text
    WHEN (service_area_id IS NOT NULL) THEN 'area'::text
    WHEN (utility_id IS NOT NULL) THEN 'utility'::text
    WHEN (country_id IS NOT NULL) THEN 'country'::text
    WHEN (subregion_id IS NOT NULL) THEN 'subregion'::text
    ELSE 'region'::text
END`),
  },
  (table) => [
    index("ix_ka_grain").on(table.grain_level),
    index("ix_ka_kpi_period").on(table.kpi_def_id, table.period_id),
    // Unique physical address: kpi + period + full grain + all ten dimensions.
    uniqueIndex("uq_ka_address").on(
      table.kpi_def_id,
      table.period_id,
      table.utility_id,
      table.country_id,
      table.subregion_id,
      table.region,
      table.service_area_id,
      table.power_station_id,
      table.unit_id,
      table.provider_id,
      table.category_id,
      table.technology_id,
      table.asset_class_id,
      table.customer_type_id,
      table.payment_mode_id,
      table.consumption_band_id,
      table.division_id,
      table.gender_id,
      table.utility_function_id,
    ),
    check(
      "chk_ka_grain_level",
      sql`grain_level = ANY (ARRAY['unit'::text, 'station'::text, 'area'::text, 'utility'::text, 'country'::text, 'subregion'::text, 'region'::text])`,
    ),
    check(
      "chk_ka_no_data_reason",
      sql`(no_data_reason IS NULL) OR ((no_data_reason)::text = ANY ((ARRAY['not_available'::character varying, 'asserted_not_applicable'::character varying])::text[]))`,
    ),
    check(
      "chk_ka_value_xor_nodata",
      sql`(((value IS NOT NULL))::integer + ((no_data_reason IS NOT NULL))::integer) <= 1`,
    ),
  ],
);
export type KpiActual = typeof kpiActual.$inferSelect;
export type NewKpiActual = typeof kpiActual.$inferInsert;

