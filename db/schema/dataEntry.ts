import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  uuid,
  varchar,
  json,
  index,
} from "drizzle-orm/pg-core";
import { managedListItems } from "./managedLists";
import { reportPeriods } from "./reportPeriods";
import { energyResources, serviceAreas } from "./utility";
import { user } from "./auth-schema";
import { relations } from "drizzle-orm";

export interface FormulaInput {
  input_def_id: number;
  variable_name: string;
}

export const inputDefinitions = pgTable("input_definitions", {
  id: serial("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }),
  variable_name: varchar("variable_name", { length: 255 }),
  formula: varchar("formula", { length: 255 }),
  formula_inputs: json("formula_inputs").$type<FormulaInput[]>(),
  category_id: integer("category_id")
    .notNull()
    .references(() => managedListItems.id),
  subcategory_id: integer("subcategory_id")
    .notNull()
    .references(() => managedListItems.id),
  energy_provider_id: integer("energy_provider_id").references(
    () => managedListItems.id,
  ),
  energy_type_id: integer("energy_type_id").references(
    () => managedListItems.id,
  ),
  energy_source_id: integer("energy_source_id").references(
    () => managedListItems.id,
  ),
  customer_type_id: integer("customer_type_id")
    .notNull()
    .references(() => managedListItems.id),
  payment_mode_id: integer("payment_mode_id")
    .notNull()
    .references(() => managedListItems.id),
  unit_id: integer("unit_id")
    .notNull()
    .references(() => managedListItems.id),
  data_type_id: integer("data_type_id")
    .notNull()
    .references(() => managedListItems.id),
  is_descriptive: boolean("is_descriptive").default(false).notNull(),
  is_currency: boolean("is_currency").default(false).notNull(),
  is_aggregated: boolean("is_aggregated").default(false).notNull(),
  agg_level_id: integer("agg_level_id").references(() => managedListItems.id),
  is_active: boolean("is_active").default(true).notNull(),
  is_mandatory: boolean("is_mandatory").default(false).notNull(),
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
    energy_provider: one(managedListItems, {
      fields: [inputDefinitions.energy_provider_id],
      references: [managedListItems.id],
    }),
    energy_type: one(managedListItems, {
      fields: [inputDefinitions.energy_type_id],
      references: [managedListItems.id],
    }),
    energy_source: one(managedListItems, {
      fields: [inputDefinitions.energy_source_id],
      references: [managedListItems.id],
    }),
    customer_type: one(managedListItems, {
      fields: [inputDefinitions.customer_type_id],
      references: [managedListItems.id],
    }),
    payment_mode: one(managedListItems, {
      fields: [inputDefinitions.payment_mode_id],
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

export const dataEntries = pgTable(
  "data_entries",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    report_period_id: integer("report_period_id")
      .notNull()
      .references(() => reportPeriods.id),
    energy_resource_id: integer("energy_resource_id").references(
      () => energyResources.id,
    ),
    service_area_id: integer("service_area_id").references(
      () => serviceAreas.id,
    ),
    input_def_id: integer("input_def_id")
      .notNull()
      .references(() => inputDefinitions.id),
    value: varchar("value", { length: 255 }),
    comments: varchar("comments", { length: 255 }),
    update_medium_id: integer("update_medium_id").references(
      () => managedListItems.id,
    ),
    status_id: integer("status_id").references(() => managedListItems.id),
    is_relevant: boolean("is_relevant").default(true).notNull(),
    is_deleted: boolean("is_deleted").default(false).notNull(),
    is_blo_reviewed: boolean("is_blo_reviewed").default(false).notNull(),
    is_ceo_approved: boolean("is_ceo_approved").default(false).notNull(),
    is_bmo_endorsed: boolean("is_bmo_endorsed").default(false).notNull(),
    energy_provider_id: integer("energy_provider_id").references(
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
  },
  (table) => [
    index("uniq_entry").on(
      table.report_period_id,
      table.input_def_id,
      table.service_area_id,
      table.energy_resource_id,
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
  energy_source?: string | null;
  customer_type?: string | null;
  payment_mode?: string | null;
};
export type NewDataEntry = typeof dataEntries.$inferInsert;

export const dataEntryFeedbacks = pgTable("data_entry_feedbacks", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  data_entry_id: uuid("data_entry_id")
    .notNull()
    .references(() => dataEntries.id),
  feedback: varchar("feedback", { length: 255 }).notNull(),
  feedback_by_id: text("feedback_by_id")
    .notNull()
    .references(() => user.id),
  feedback_date: uuid("feedback_date").notNull(),
  reply: varchar("reply", { length: 255 }),
  reply_by_id: text("reply_by_id").references(() => user.id),
  reply_date: uuid("reply_date"),
  done: boolean("done").default(false).notNull(),
});

export const dataEntryLogs = pgTable("data_entry_logs", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  data_entry_id: uuid("data_entry_id")
    .notNull()
    .references(() => dataEntries.id),
  previous_value: varchar("previous_value", { length: 255 }).notNull(),
  new_value: varchar("new_value", { length: 255 }).notNull(),
  updated_by_id: text("updated_by_id")
    .notNull()
    .references(() => user.id),
  updated_at: uuid("updated_at").notNull(),
});
