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
  unique,
  check,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { managedListItems, managedLists } from "./managedLists";
import { reportPeriods } from "./reportPeriods";
import {
  units,
  organisations,
  powerStations,
  serviceAreas,
} from "./utility";
import { user } from "./auth-schema";
import { relations } from "drizzle-orm";
import { countries, Region, subRegions } from "./country";

export interface FormulaInput {
  measure_def_id: number;
  variable_name: string;
  // Dimension filters the formula binds against. Absent/null means "not
  // constrained on this dimension" — the re-point (§4.7) makes the intended
  // slice explicit (an All-member id where the input spans the whole
  // dimension, or a specific member where it is sliced).
  provider_id?: number | null;
  category_id?: number | null;
  technology_id?: number | null;
  asset_class_id?: number | null;
  customer_type_id?: number | null;
  payment_mode_id?: number | null;
  consumption_band_id?: number | null;
  division_id?: number | null;
  gender_id?: number | null;
  utility_function_id?: number | null;
}

export type MeasureDefinitionAlternativeNames = Record<string, string>;

export type DefinitionStatus = "draft" | "curated";

export const measureDefinitions = pgTable("measure_definitions", {
  id: serial("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  variable_name: varchar("variable_name", { length: 255 }),
  formula: text("formula"),
  formula_inputs: json("formula_inputs").$type<FormulaInput[]>(),
  measures_group_id: integer("measures_group_id")
    .notNull()
    .references(() => managedListItems.id),
  measures_subgroup_id: integer("measures_subgroup_id")
    .notNull()
    .references(() => managedListItems.id),
  unit_id: integer("unit_id")
    .notNull()
    .references(() => managedListItems.id),
  data_type_id: integer("data_type_id")
    .notNull()
    .references(() => managedListItems.id),
  // Source list for option-typed (managedLists) measures — explicit, not name-matched.
  option_list_id: integer("option_list_id").references(() => managedLists.id),
  valid_polarity_id: integer("valid_polarity_id").references(
    () => managedListItems.id,
  ),
  valid_trend_id: integer("valid_trend_id").references(
    () => managedListItems.id,
  ),
  valid_range_min: numeric("valid_range_min"),
  valid_range_max: numeric("valid_range_max"),
  is_currency: boolean("is_currency").default(false).notNull(),
  is_aggregated: boolean("is_aggregated").default(false).notNull(),
  strata_id: integer("strata_id").references(() => managedListItems.id),
  is_active: boolean("is_active").default(true).notNull(),
  is_mandatory: boolean("is_mandatory").default(false).notNull(),
  is_system_generated: boolean("is_system_generated").default(false).notNull(),
  is_calculated: boolean("is_calculated").default(false).notNull(),
  is_kpi: boolean("is_kpi").default(false).notNull(),
  is_kpi_input: boolean("is_kpi_input").default(false).notNull(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
  alternative_names:
    json("alternative_names").$type<MeasureDefinitionAlternativeNames>(),
  sort_order: integer("sort_order").default(0).notNull(),
  definition: text("definition"),
  synonyms: json("synonyms").$type<string[]>(),
  definition_status: varchar("definition_status", {
    length: 16,
  }).$type<DefinitionStatus>(),
});

export type MeasureDefinition = typeof measureDefinitions.$inferSelect & {
  category?: string | null;
  subcategory?: string | null;
  energy_provider?: string | null;
  energy_type?: string | null;
  energy_source?: string | null;
  customer_type?: string | null;
  payment_mode?: string | null;
  unit?: string | null;
  data_type?: string | null;
  strata?: string | null;
};
export type NewMeasureDefinition = typeof measureDefinitions.$inferInsert;

export const inputRelevance = pgTable("input_relevance", {
  id: serial("id").primaryKey().notNull(),
  measure_def_id: integer("measure_def_id")
    .notNull()
    .references(() => measureDefinitions.id, { onDelete: "cascade" }),
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
  measureDefinitions,
  ({ one }) => ({
    category: one(managedListItems, {
      fields: [measureDefinitions.measures_group_id],
      references: [managedListItems.id],
    }),
    subcategory: one(managedListItems, {
      fields: [measureDefinitions.measures_subgroup_id],
      references: [managedListItems.id],
    }),
    unit: one(managedListItems, {
      fields: [measureDefinitions.unit_id],
      references: [managedListItems.id],
    }),
    data_type: one(managedListItems, {
      fields: [measureDefinitions.data_type_id],
      references: [managedListItems.id],
    }),
    strata: one(managedListItems, {
      fields: [measureDefinitions.strata_id],
      references: [managedListItems.id],
    }),
  }),
);

export enum DataEntryStatusId {
  /** @deprecated Requested (1) retired — **Pending (2) is the single starting state** (chosen for its
   * call-to-action: an empty shell is an outstanding task, not a passive request). Shells now birth
   * at Pending; the loader/UI no longer assign 1. Kept only so historical/legacy code resolves. */
  Requested = 1,
  /** Starting state — a generated shell awaiting the utility's data (action needed). */
  Pending = 2,
  Entered = 3,
  /** Reviewed by the BLO. Business label: "BLO Reviewed". */
  Reviewed = 4,
  /** Approved by the utility CEO — the terminal, publishable state. Business label: "CEO Approved". */
  Approved = 5,
  /** @deprecated BMO "Endorsed" step retired — CEO Approved (5) is now the final, publishable
   * state (no separate central endorsement). Legacy Endorsed rows were migrated to Approved (5). */
  Endorsed = 6,
  /** @deprecated retired — answer-availability moved to `data_entries.no_data_reason`
   * (`not_available` / `asserted_not_applicable`). "Not available" is an ANSWER, not a workflow state. */
  Not_Available = 7,
}

/**
 * Publish gate — an entry is approved/publishable (feeds Silver→Gold, Power BI, benchmarking)
 * once it reaches the terminal Approved (CEO Approved) state. Named constant so the `>= 5` rule
 * has a single home; BMO endorsement was removed, so Approved (5) is final.
 */
export const APPROVED_STATUS = DataEntryStatusId.Approved;
export const isPublishableStatus = (statusId?: number | null): boolean =>
  (statusId ?? 0) >= APPROVED_STATUS;

/**
 * Enriched, SINGLE SOURCE of workflow-status metadata for the active states (1–5). `status_id` is
 * a CODE ENUM (a state-machine contract) — its values gate control flow, so it is intentionally
 * NOT a BMO-editable managed list. These business `label`/`description`s carry the BLO/CEO
 * language that previously lived — duplicated and id-mismatched — in the "Data Workflow Status"
 * managed list (list 21), which is being retired. Use this for ALL user- and AI-facing status text.
 */
export const DATA_ENTRY_STATUS_META: Record<
  number,
  { code: string; label: string; description: string; color: string; publishable: boolean }
> = {
  // Requested (1) retired — Pending (2) is the single starting state (see enum). Not listed here.
  [DataEntryStatusId.Pending]: { code: "Pending", label: "Pending", description: "The shell's starting state — awaiting the utility's data (action needed / outstanding).", color: "#facc15", publishable: false },
  [DataEntryStatusId.Entered]: { code: "Entered", label: "Entered", description: "A value (or a confirmed no-data answer) has been entered, awaiting review.", color: "#a3e635", publishable: false },
  [DataEntryStatusId.Reviewed]: { code: "Reviewed", label: "BLO Reviewed", description: "Reviewed by the BLO.", color: "#34d399", publishable: false },
  [DataEntryStatusId.Approved]: { code: "Approved", label: "CEO Approved", description: "Approved by the utility CEO — the terminal, publishable state that feeds Power BI / benchmarking.", color: "#38bdf8", publishable: true },
};

/** Answer-availability reasons on `data_entries.no_data_reason` (derived on kpi_actual). */
export const NO_DATA_REASONS = ["not_available", "asserted_not_applicable"] as const;
export type NoDataReason = (typeof NO_DATA_REASONS)[number];

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

export const DataEntryStatusList = Object.keys(DataEntryStatus).map((key) => {
  const id = DataEntryStatus[key as keyof typeof DataEntryStatus];
  const meta = DATA_ENTRY_STATUS_META[id];
  return {
    id,
    name: key,
    // Business/AI-facing label + description (fall back to the code key for deprecated states).
    label: meta?.label ?? key,
    description: meta?.description ?? null,
    color: meta?.color ?? dataEntryStatusColors[key as keyof typeof dataEntryStatusColors],
    publishable: meta?.publishable ?? false,
  };
});

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
    unit_id: integer("unit_id").references(
      () => units.id,
    ),
    asset_class_id: integer("asset_class_id")
      .notNull()
      .references(() => managedListItems.id),
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
    measure_def_id: integer("measure_def_id")
      .notNull()
      .references(() => measureDefinitions.id, { onDelete: "cascade" }),
    value: varchar("value", { length: 255 }),
    value_text: text("value_text"),
    value_numeric: numeric("value_numeric"),
    value_boolean: boolean("value_boolean"),
    comments: json("comments").$type<DataEntryComment[]>(),
    update_medium_id: integer("update_medium_id").references(
      () => managedListItems.id,
    ),
    status_id: integer("status_id").$type<DataEntryStatusId>(),
    // Answer-availability axis, orthogonal to status_id (workflow). NULL = a value
    // was given, or still awaiting. See NoDataReason / CONTEXT.md "No-Data Reason".
    no_data_reason: varchar("no_data_reason", { length: 32 }).$type<NoDataReason>(),
    is_relevant: boolean("is_relevant").default(true).notNull(),
    is_deleted: boolean("is_deleted").default(false).notNull(),
    // The ten canonical dimensions — NOT NULL, always the explicit "All" member
    // (no NULL-as-All). Enforced on the empty table before the RAW-ONLY reload.
    provider_id: integer("provider_id")
      .notNull()
      .references(() => managedListItems.id),
    category_id: integer("category_id")
      .notNull()
      .references(() => managedListItems.id),
    technology_id: integer("technology_id")
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
    value_option_id: integer("value_option_id").references(
      () => managedListItems.id,
    ),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    updatedById: text("updated_by_id").references(() => user.id),
  },
  (table) => [
    // At most one typed value column is non-null (all null = awaiting entry;
    // status_id carries the reason). The measure's data_type dictates WHICH one,
    // enforced by lib/data-entry/value-router.ts on every write path.
    check(
      "chk_one_value",
      sql`(
        (case when ${table.value_numeric} is not null then 1 else 0 end)
      + (case when ${table.value_boolean} is not null then 1 else 0 end)
      + (case when ${table.value_text} is not null then 1 else 0 end)
      + (case when ${table.value_option_id} is not null then 1 else 0 end)
      ) <= 1`,
    ),
    // Controlled vocabulary for the answer-availability axis.
    check(
      "chk_no_data_reason",
      sql`${table.no_data_reason} is null or ${table.no_data_reason} in ('not_available','asserted_not_applicable')`,
    ),
    // A row is EITHER a value XOR a no-data answer (never both).
    check(
      "chk_value_xor_nodata",
      sql`(num_nonnulls(${table.value_numeric}, ${table.value_boolean}, ${table.value_text}, ${table.value_option_id}) > 0)::int
        + (${table.no_data_reason} is not null)::int <= 1`,
    ),
    // True unique physical address: period + measure + full grain + all ten
    // dimensions. NULLS NOT DISTINCT so higher-grain rows (NULL service_area /
    // resource / station) still deduplicate. Grain columns (utility, country,
    // service_area, station, resource) are included because a NULL "area" alone
    // cannot distinguish two utilities or a utility- vs country-level row.
    unique("uniq_entry_address")
      .on(
        table.report_period_id,
        table.measure_def_id,
        table.utility_id,
        table.country_id,
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
      )
      .nullsNotDistinct(),
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
    measure_def_id: integer("measure_def_id")
      .notNull()
      .references(() => measureDefinitions.id, { onDelete: "cascade" }),
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
      table.measure_def_id,
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
    measure_def_id: integer("measure_def_id")
      .notNull()
      .references(() => measureDefinitions.id, { onDelete: "cascade" }),
    is_relevant: boolean("is_relevant").default(true).notNull(),
    is_deleted: boolean("is_deleted").default(false).notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    updatedById: text("updated_by_id").references(() => user.id),
  },
  (table) => [
    index("uniq_transmission_relevance").on(
      table.report_period_id,
      table.service_area_id,
      table.measure_def_id,
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
    measure_def_id: integer("measure_def_id")
      .notNull()
      .references(() => measureDefinitions.id, { onDelete: "cascade" }),
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
      table.measure_def_id,
      table.training_dl_def_id,
    ),
    index("idx_input_dl_def_mappings_training_dl_def_id").on(
      table.training_dl_def_id,
    ),
  ],
);

export type InputDlDefMapping = typeof inputDlDefMappings.$inferSelect;
export type NewInputDlDefMapping = typeof inputDlDefMappings.$inferInsert;

export const inputDefinitions = measureDefinitions;

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
