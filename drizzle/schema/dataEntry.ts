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
import { generators, serviceAreas } from "./utility";
import { user } from "./auth-schema";

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
});

export const dataEntries = pgTable(
  "data_entries",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    report_period_id: integer("report_period_id")
      .notNull()
      .references(() => reportPeriods.id),
    generator_id: integer("generator_id").references(() => generators.id),
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
  },
  (table) => [
    index("uniq_entry").on(
      table.report_period_id,
      table.input_def_id,
      table.service_area_id,
      table.generator_id,
    ),
  ],
);

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
