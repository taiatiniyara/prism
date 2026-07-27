import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { countries } from "./country";
import { managedListItems } from "./managedLists";
import { user } from "./auth-schema";

export const organisations = pgTable(
  "organisations",
  {
    id: serial("id").primaryKey().notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    acronym: varchar("acronym", { length: 255 }),
    country_id: integer("country_id")
      .notNull()
      .references(() => countries.id),
    is_utility: boolean("is_utility").notNull().default(false),
    powequality_standard_id: integer("powerquality_standard_id").references(
      () => managedListItems.id,
    ),
    electricity_regulation_id: integer("electricity_regulation_id").references(
      () => managedListItems.id,
    ),
    accounting_standard_id: integer("accounting_standard_id").references(
      () => managedListItems.id,
    ),
    entity_type_id: integer("entity_type_id").references(
      () => managedListItems.id,
    ),
    utility_type_id: integer("utility_type_id").references(
      () => managedListItems.id,
      {
        onDelete: "cascade",
      },
    ),
    operating_basis_id: integer("operating_basis_id").references(
      () => managedListItems.id,
    ),
    ppa_membership_type_id: integer("ppa_membership_type_id").references(
      () => managedListItems.id,
    ),
    utility_size_id: integer("utility_size_id").references(
      () => managedListItems.id,
    ),
    services_provided_id: integer("services_provided_id").references(
      () => managedListItems.id,
    ),
    financial_year_end: varchar("financial_year_end", { length: 255 }),
    is_mth_reports_relevant_month: boolean("is_mth_report_relevant")
      .notNull()
      .default(false),
    is_active: boolean("is_active").notNull().default(true),
    updated_date: varchar("updated_date", { length: 255 }),
  },
  (table) => [
    index("organisation_idx").on(table.country_id, table.id, table.name),
  ],
);
export type Organisation = typeof organisations.$inferSelect & {
  country?: string | null;
  powequality_standard?: string | null;
  electricity_regulation?: string | null;
  accounting_standard?: string | null;
  entity_type?: string | null;
  utility_type?: string | null;
  operating_basis?: string | null;
  ppa_membership_type?: string | null;
  utility_size?: string | null;
  services_provided?: string | null;
};
export type NewOrganisation = typeof organisations.$inferInsert;

interface ServiceAreaReportPeriods {
  report_period_id: number;
  is_active: boolean;
}
export const serviceAreas = pgTable("service_areas", {
  id: serial("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  utility_id: integer("utility_id")
    .notNull()
    .references(() => organisations.id),
  provides_electricity: boolean("provides_electricity").notNull().default(true),
  provides_sanitation: boolean("provides_sanitation").notNull().default(false),
  provides_water: boolean("provides_water").notNull().default(false),
  operations_only: boolean("operations_only").default(false),
  report_periods: jsonb("report_periods")
    .$type<ServiceAreaReportPeriods[]>()
    .notNull(),
  is_virtual: boolean("is_virtual").notNull().default(false),
  is_active: boolean("is_active").notNull().default(true),
  agg_level_id: integer("agg_level_id")
    .notNull()
    .references(() => managedListItems.id),
});
export type ServiceArea = typeof serviceAreas.$inferSelect & {
  utility?: string | null;
  agg_level?: string | null;
};
export type NewServiceArea = typeof serviceAreas.$inferInsert;

export const powerStations = pgTable("power_stations", {
  id: serial("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  service_area_id: integer("service_area_id")
    .notNull()
    .references(() => serviceAreas.id),
  utility_id: integer("utility_id")
    .notNull()
    .references(() => organisations.id),
  commissioned_date: varchar("commissioned_date", { length: 255 }),
  decommissioned_date: varchar("decommissioned_date", { length: 255 }),
  is_active: boolean("is_active").notNull().default(true),
});
export type PowerStation = typeof powerStations.$inferSelect & {
  service_area?: string | null;
  utility?: string | null;
};
export type NewPowerStation = typeof powerStations.$inferInsert;

export interface EnergyResourcePeriodEntry {
  report_period_id: number;
  capacity_mw: number | null;
  is_active: boolean;
}

export const units = pgTable(
  "units",
  {
    id: serial("id").primaryKey().notNull(),
    period_entries: jsonb("period_entries")
      .$type<EnergyResourcePeriodEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    name: varchar("name", { length: 255 }).notNull(),
    is_aggregated: boolean("is_aggregated").notNull().default(false),
    resource_qty: integer("resource_qty"),
    power_station_id: integer("power_station_id").references(
      () => powerStations.id,
    ),
    service_area_id: integer("service_area_id")
      .notNull()
      .references(() => serviceAreas.id),
    utility_id: integer("utility_id")
      .notNull()
      .references(() => organisations.id),
    provider_id: integer("provider_id")
      .notNull()
      .references(() => managedListItems.id),
    category_id: integer("category_id")
      .notNull()
      .references(() => managedListItems.id),
    technology_id: integer("technology_id")
      .notNull()
      .references(() => managedListItems.id),
    type_id: integer("type_id")
      .notNull()
      .references(() => managedListItems.id)
      .default(1),
    is_virtual: boolean("is_virtual").default(false).notNull(),
    agg_level_id: integer("agg_level_id")
      .notNull()
      .references(() => managedListItems.id),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
    updated_by_id: text("updated_by_id").references(() => user.id),
  },
  (table) => [index("gen_idx").on(table.name, table.utility_id)],
);
export type EnergyResource = typeof units.$inferSelect & {
  report_period?: string | null;
  report_period_type?: string | null;
  capacity?: string | null;
  is_active?: boolean | null;
  power_station?: string | null;
  service_area?: string | null;
  utility?: string | null;
  energy_provider?: string | null;
  energy_type?: string | null;
  energy_source?: string | null;
  agg_level?: string | null;
  type?: string | null;
};
export type NewEnergyResource = typeof units.$inferInsert;
