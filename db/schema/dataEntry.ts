import {
  bigint,
  boolean,
  integer,
  pgTable,
  serial,
  text,
  uuid,
  varchar,
  json,
  jsonb,
  index,
  uniqueIndex,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";
import { managedListItems } from "./managedLists";
import { reportPeriods } from "./reportPeriods";
import {
  energyResources,
  organisations,
  powerStations,
  serviceAreas,
} from "./utility";
import { user } from "./auth-schema";
import { relations } from "drizzle-orm";
import { countries, Region, subRegions } from "./country";

export interface FormulaInput {
  input_def_id: number;
  variable_name: string;
  energy_provider_id?: number | null;
  energy_type_id?: number | null;
  energy_source_id?: number | null;
}

export type InputDefinitionAlternativeNames = Record<string, string>;

export type DefinitionStatus = "draft" | "curated";

export const inputDefinitions = pgTable("input_definitions", {
  id: serial("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  variable_name: varchar("variable_name", { length: 255 }),
  formula: text("formula"),
  formula_inputs: json("formula_inputs").$type<FormulaInput[]>(),
  category_id: integer("category_id")
    .notNull()
    .references(() => managedListItems.id),
  subcategory_id: integer("subcategory_id")
    .notNull()
    .references(() => managedListItems.id),
  service_relevance_group_id: integer("service_group_id").references(
    () => managedListItems.id,
  ),
  unit_id: integer("unit_id")
    .notNull()
    .references(() => managedListItems.id),
  data_type_id: integer("data_type_id")
    .notNull()
    .references(() => managedListItems.id),
  valid_polarity_id: integer("valid_polarity_id").references(
    () => managedListItems.id,
  ),
  valid_trend_id: integer("valid_trend_id").references(
    () => managedListItems.id,
  ),
  valid_range_min: integer("valid_range_min"),
  valid_range_max: integer("valid_range_max"),
  is_descriptive: boolean("is_descriptive").default(false).notNull(),
  utility_service_id: integer("utility_service_id").references(
    () => managedListItems.id,
  ),
  is_currency: boolean("is_currency").default(false).notNull(),
  is_aggregated: boolean("is_aggregated").default(false).notNull(),
  agg_level_id: integer("agg_level_id").references(() => managedListItems.id),
  is_active: boolean("is_active").default(true).notNull(),
  is_mandatory: boolean("is_mandatory").default(false).notNull(),
  is_system_generated: boolean("is_system_generated").default(false).notNull(),
  is_calculated: boolean("is_calculated").default(false).notNull(),
  is_kpi: boolean("is_kpi").default(false).notNull(),
  is_kpi_input: boolean("is_kpi_input").default(false).notNull(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
  alternative_names:
    json("alternative_names").$type<InputDefinitionAlternativeNames>(),
  sort_order: integer("sort_order").default(0).notNull(),
  definition: text("definition"),
  synonyms: json("synonyms").$type<string[]>(),
  definition_status: varchar("definition_status", {
    length: 16,
  }).$type<DefinitionStatus>(),
});
export type InputDefinition = typeof inputDefinitions.$inferSelect & {
  category?: string | null;
  subcategory?: string | null;
  energy_provider?: string | null;
  energy_type?: string | null;
  energy_source?: string | null;
  customer_type?: string | null;
  payment_mode?: string | null;
  unit?: string | null;
  data_type?: string | null;
  agg_level?: string | null;
};
export type NewInputDefinition = typeof inputDefinitions.$inferInsert;

/**
 * Alias for inputDefinitions — the medallion redesign renames
 * "input definitions" to "measure definitions".
 * Points to the same "input_definitions" physical table.
 */
export const measureDefinitions = inputDefinitions;
export type MeasureDefinition = typeof inputDefinitions.$inferSelect & {
  category?: string | null;
  subcategory?: string | null;
  unit?: string | null;
  data_type?: string | null;
  agg_level?: string | null;
};
export type NewMeasureDefinition = typeof inputDefinitions.$inferInsert;

export const inputRelevance = pgTable("input_relevance", {
  id: serial("id").primaryKey().notNull(),
  input_def_id: integer("input_def_id")
    .notNull()
    .references(() => inputDefinitions.id, { onDelete: "cascade" }),
  dimension_id: integer("dimension_id")
    .notNull()
    .references(() => managedListItems.id, { onDelete: "restrict" }),
  is_relevant: boolean("is_relevant").default(true).notNull(),
});
export type InputRelevance = typeof inputRelevance.$inferSelect & {
  dimension?: string | null;
  input_def?: string | null;
};
export type NewInputRelevance = typeof inputRelevance.$inferInsert;

export const inputDefinitionRelations = relations(
  inputDefinitions,
  ({ one }) => ({
    category: one(managedListItems, {
      fields: [inputDefinitions.category_id],
      references: [managedListItems.id],
    }),
    subcategory: one(managedListItems, {
      fields: [inputDefinitions.subcategory_id],
      references: [managedListItems.id],
    }),
    unit: one(managedListItems, {
      fields: [inputDefinitions.unit_id],
      references: [managedListItems.id],
    }),
    data_type: one(managedListItems, {
      fields: [inputDefinitions.data_type_id],
      references: [managedListItems.id],
    }),
    agg_level: one(managedListItems, {
      fields: [inputDefinitions.agg_level_id],
      references: [managedListItems.id],
    }),
  }),
);

export enum DataEntryStatusId {
  Requested = 1,
  Pending = 2,
  Entered = 3,
  Reviewed = 4,
  Approved = 5,
  /** @deprecated Endorsed has been retired — migrated to Approved (5) */
  Endorsed = 6,
  Not_Available = 7,
}

export const DataEntryStatus = {
  Requested: DataEntryStatusId.Requested,
  Pending: DataEntryStatusId.Pending,
  Entered: DataEntryStatusId.Entered,
  Reviewed: DataEntryStatusId.Reviewed,
  Approved: DataEntryStatusId.Approved,
  Not_Available: DataEntryStatusId.Not_Available,
};

export const dataEntryStatusColors = {
  Requested: "#fb923c",
  Pending: "#facc15",
  Entered: "#a3e635",
  Reviewed: "#34d399",
  Approved: "#38bdf8",
  Not_Available: "#94a3b8",
};

export const DataEntryStatusList = Object.keys(DataEntryStatus).map((key) => ({
  id: DataEntryStatus[key as keyof typeof DataEntryStatus],
  name: key,
  color: dataEntryStatusColors[key as keyof typeof dataEntryStatusColors],
}));

export type DataEntryComment = {
  comment: string;
  commenterId: string;
  commenterName?: string | null;
  commenterRole: string;
  date: Date;
  resolved?: boolean;
  replies?: DataEntryComment[];
};

export const dataEntries = pgTable(
  "data_entries",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    report_period_id: integer("report_period_id")
      .notNull()
      .references(() => reportPeriods.id, { onDelete: "restrict" }),
    energy_resource_id: integer("energy_resource_id").references(
      () => energyResources.id,
    ),
    energy_resource_type_id: integer("energy_resource_type_id").references(
      () => managedListItems.id,
    ),
    power_station_id: integer("power_station_id").references(
      () => powerStations.id,
    ),
    service_area_id: integer("service_area_id").references(
      () => serviceAreas.id,
    ),
    utility_id: integer("utility_id").references(() => organisations.id),
    country_id: integer("country_id").references(() => countries.id),
    subregion_id: integer("subregion_id").references(() => subRegions.id),
    region: varchar("region", { length: 255 }).$type<Region>(),
    input_def_id: integer("input_def_id")
      .notNull()
      .references(() => inputDefinitions.id),
    value: varchar("value", { length: 255 }),
    value_text: text("value_text"),
    value_numeric: numeric("value_numeric"),
    value_boolean: boolean("value_boolean"),
    comments: json("comments").$type<DataEntryComment[]>(),
    update_medium_id: integer("update_medium_id").references(
      () => managedListItems.id,
    ),
    status_id: integer("status_id").$type<DataEntryStatusId>(),
    is_relevant: boolean("is_relevant").default(true).notNull(),
    is_deleted: boolean("is_deleted").default(false).notNull(),
    energy_provider_id: integer("energy_provider_id").references(
      () => managedListItems.id,
    ),
    energy_type_id: integer("energy_type_id").references(
      () => managedListItems.id,
    ),
    energy_source_id: integer("energy_source_id").references(
      () => managedListItems.id,
    ),
    customer_type_id: integer("customer_type_id").references(
      () => managedListItems.id,
    ),
    payment_mode_id: integer("payment_mode_id").references(
      () => managedListItems.id,
    ),
    consumption_band_id: integer("consumption_band_id").references(
      () => managedListItems.id,
    ),
    division_id: integer("division_id").references(() => managedListItems.id),
    gender_id: integer("gender_id").references(() => managedListItems.id),
    utility_function_id: integer("utility_function_id").references(
      () => managedListItems.id,
    ),
    value_option_id: integer("value_option_id").references(
      () => managedListItems.id,
    ),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    updatedById: text("updated_by_id").references(() => user.id),
  },
  (table) => [
    index("uniq_entry").on(
      table.report_period_id,
      table.input_def_id,
      table.service_area_id,
      table.energy_source_id,
      table.energy_provider_id,
      table.energy_resource_id,
      table.customer_type_id,
      table.payment_mode_id,
    ),
  ],
);

export const tariffRelevance = pgTable(
  "tariff_relevance",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    report_period_id: integer("report_period_id")
      .notNull()
      .references(() => reportPeriods.id),
    service_area_id: integer("service_area_id")
      .notNull()
      .references(() => serviceAreas.id),
    input_def_id: integer("input_def_id")
      .notNull()
      .references(() => inputDefinitions.id),
    payment_mode_id: integer("payment_mode_id")
      .notNull()
      .references(() => managedListItems.id),
    customer_type_id: integer("customer_type_id")
      .notNull()
      .references(() => managedListItems.id),
    is_relevant: boolean("is_relevant").default(true).notNull(),
    is_deleted: boolean("is_deleted").default(false).notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    updatedById: text("updated_by_id").references(() => user.id),
  },
  (table) => [
    index("uniq_tariff_relevance").on(
      table.report_period_id,
      table.service_area_id,
      table.input_def_id,
      table.payment_mode_id,
      table.customer_type_id,
    ),
  ],
);

export const transmissionRelevance = pgTable(
  "transmission_relevance",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    report_period_id: integer("report_period_id")
      .notNull()
      .references(() => reportPeriods.id),
    service_area_id: integer("service_area_id")
      .notNull()
      .references(() => serviceAreas.id),
    input_def_id: integer("input_def_id")
      .notNull()
      .references(() => inputDefinitions.id),
    is_relevant: boolean("is_relevant").default(true).notNull(),
    is_deleted: boolean("is_deleted").default(false).notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    updatedById: text("updated_by_id").references(() => user.id),
  },
  (table) => [
    index("uniq_transmission_relevance").on(
      table.report_period_id,
      table.service_area_id,
      table.input_def_id,
    ),
  ],
);

export type DataEntry = typeof dataEntries.$inferSelect & {
  report_period?: string | null;
  energy_resource?: string | null;
  service_area?: string | null;
  input_def?: string | null;
  update_medium?: string | null;
  status?: string | null;
  energy_provider?: string | null;
  energy_type?: string | null;
  energy_source?: string | null;
  customer_type?: string | null;
  payment_mode?: string | null;
  consumption_band?: string | null;
  division?: string | null;
  gender?: string | null;
  value_option?: string | null;
  utility?: string | null;
  country?: string | null;
  subregion?: string | null;
};
export type NewDataEntry = typeof dataEntries.$inferInsert;
export type TariffRelevance = typeof tariffRelevance.$inferSelect;
export type NewTariffRelevance = typeof tariffRelevance.$inferInsert;
export type TransmissionRelevance = typeof transmissionRelevance.$inferSelect;
export type NewTransmissionRelevance =
  typeof transmissionRelevance.$inferInsert;

export const inputDlDefMappings = pgTable(
  "input_dl_def_mappings",
  {
    id: serial("id").primaryKey().notNull(),
    input_def_id: integer("input_def_id")
      .notNull()
      .references(() => inputDefinitions.id, { onDelete: "cascade" }),
    training_dl_def_id: bigint("training_dl_def_id", {
      mode: "number",
    }).notNull(),
    training_dl_legacy_id: varchar("training_dl_legacy_id", {
      length: 64,
    }).notNull(),
    training_source_id: integer("training_source_id"),
    training_dl_name: varchar("training_dl_name", { length: 255 }).notNull(),
    training_variable_name: varchar("training_variable_name", { length: 255 }),
    score: integer("score").notNull().default(0),
    confidence: varchar("confidence", { length: 16 }).notNull(),
    reasons: json("reasons").$type<string[]>(),
    is_auto: boolean("is_auto").notNull().default(false),
    is_approved: boolean("is_approved").notNull().default(true),
    approved_at: timestamp("approved_at"),
    approved_by_id: text("approved_by_id").references(() => user.id),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_input_dl_def_mappings_input_training").on(
      table.input_def_id,
      table.training_dl_def_id,
    ),
    index("idx_input_dl_def_mappings_training_dl_def_id").on(
      table.training_dl_def_id,
    ),
  ],
);

export type InputDlDefMapping = typeof inputDlDefMappings.$inferSelect;
export type NewInputDlDefMapping = typeof inputDlDefMappings.$inferInsert;

export const dataEntryLogs = pgTable("data_entry_logs", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  data_entry_id: uuid("data_entry_id")
    .notNull()
    .references(() => dataEntries.id, { onDelete: "cascade" }),
  previous_value: varchar("previous_value", { length: 255 }).notNull(),
  new_value: varchar("new_value", { length: 255 }).notNull(),
  value_snapshot: jsonb("value_snapshot").$type<{
    value_numeric: number | null;
    value_boolean: boolean | null;
    value_option_id: number | null;
    value_string: string | null;
    status_id: number | null;
  }>(),
  updated_by_id: text("updated_by_id")
    .notNull()
    .references(() => user.id),
  updated_at: timestamp("updated_at").notNull(),
});
