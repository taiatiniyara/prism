import {
  boolean,
  check,
  integer,
  pgTable,
  serial,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { managedListItems } from "./managedLists";

export type Region = "Oceania" | "Europe" | "Asia" | "Africa" | "Americas";

export const subRegions = pgTable("sub_regions", {
  // `id` IS the UN M49 sub-region code (Melanesia 54, Micronesia 57, Polynesia 61,
  // Australia and New Zealand 53, …). Explicit integer, not serial — rows are
  // inserted with their UN code, never auto-assigned. Aggregation sentinels
  // ("All", "Others") use non-M49 ids by design.
  id: integer("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  un_continental_region: varchar("un_continental_region", {
    length: 255,
  })
    .notNull()
    .$type<Region>(),
  is_active: boolean("is_active").notNull().default(true),
});
export type SubRegion = typeof subRegions.$inferSelect;
export type NewSubRegion = typeof subRegions.$inferInsert;

export const countries = pgTable("countries", {
  // `id` IS the UN M49 country code (identical to ISO 3166-1 numeric): Fiji 242,
  // PNG 598, Samoa 882, Australia 36, … Explicit integer, not serial — rows are
  // inserted with their UN code. The "All Countries" sentinel uses a non-M49 id.
  id: integer("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  dial_code: varchar("dial_code", { length: 10 }).notNull(),
  iso_code_alpha2: varchar("iso_code_alpha2").notNull(),
  iso_code_alpha3: varchar("iso_code_alpha3").notNull(),
  currency_id: integer("currency_id")
    .notNull()
    .references(() => managedListItems.id),
  is_adb_member: boolean("is_adb_member").notNull().default(true),
  sub_region_id: integer("sub_region_id")
    .notNull()
    .references(() => subRegions.id),
  updated_date: timestamp("updated_date").defaultNow().notNull(),
});
export type Country = typeof countries.$inferSelect & {
  sub_region?: string | null;
  currency?: string | null;
};
export type NewCountry = typeof countries.$inferInsert;

export const countryContext = pgTable(
  "country_context",
  {
    id: serial("id").primaryKey().notNull(),
    country_id: integer("country_id")
      .notNull()
      .references(() => countries.id),
    // The country-context metric. FK → measure_definitions(id) WHERE
    // measures_subgroup_id = 221 ("Country Context"), ids 1..16 (Population=3,
    // GDP Per Capita=9, …). Enforced at the DB level (see the repoint migration)
    // rather than via a drizzle .references() to avoid a country↔dataEntry import
    // cycle — same approach as reportPeriods.status_id. Renamed from the legacy
    // `dl_def_id` (which wrongly FK'd managed_list_items) by the 2026-08-23 repoint.
    measure_def_id: integer("measure_def_id").notNull(),
    // Annual time-series key — the reporting YEAR this figure is for (e.g. 2024).
    // A BMO annual update = a new row per (country, metric, year); history preserved.
    // Reads join to a submission by (country_id, the submission's fiscal year), using
    // the most recent period_year <= it (carry-forward as a read rule, not stored dup).
    period_year: integer("period_year").notNull(),
    // Provenance stays native (BMO-cited): source_date / source_doc / source_url.
    source_date: timestamp("source_date"),
    source_doc: varchar("source_doc", { length: 500 }),
    source_url: varchar("source_url", { length: 500 }),
    value: varchar("value", { length: 1000 }),
    // Answer-availability axis (mirrors data_entries.no_data_reason), orthogonal to
    // the value: NULL = a value was given (or the row is still to be filled);
    // 'not_available' = the BMO states this national figure is not available for the
    // year. A row carries a value OR a not-available reason, never both (see checks).
    no_data_reason: varchar("no_data_reason", { length: 32 }).$type<"not_available">(),
    updated_by: varchar("updated_by", { length: 255 }),
    updated_date: timestamp("updated_date").defaultNow().notNull(),
  },
  (table) => [
    // one value per country per metric per year (the time-series key)
    unique("uq_country_context_metric_year").on(
      table.country_id,
      table.measure_def_id,
      table.period_year,
    ),
    // controlled vocabulary for the availability axis (per Eugene: null | not_available)
    check(
      "chk_cc_no_data_reason",
      sql`${table.no_data_reason} is null or ${table.no_data_reason} = 'not_available'`,
    ),
    // a value XOR a not-available reason — never both (mirrors chk_value_xor_nodata)
    check(
      "chk_cc_value_xor_nodata",
      sql`(${table.value} is not null)::int + (${table.no_data_reason} is not null)::int <= 1`,
    ),
  ],
);

export type CountryContextRow = typeof countryContext.$inferSelect;
export type NewCountryContextRow = typeof countryContext.$inferInsert;
