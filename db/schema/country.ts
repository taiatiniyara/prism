import {
  boolean,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { managedListItems } from "./managedLists";

export type Region = "Oceania" | "Europe" | "Asia" | "Africa" | "Americas";

export const subRegions = pgTable("sub_regions", {
  id: serial("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  un_continental_region: varchar("un_continental_region", {
    length: 255,
  })
    .notNull()
    .$type<Region>(),
  // UN M49 codes (canonical zero-padded 3-char form, e.g. Melanesia "054",
  // Oceania "009"). Alternate keys — the serial `id` stays the PK, so no FK
  // churn. Backfilled from db/seed-data/un-m49.csv by scripts/backfill-m49-codes.ts.
  m49_code: varchar("m49_code", { length: 3 }).unique(),
  un_region_m49_code: varchar("un_region_m49_code", { length: 3 }),
  is_active: boolean("is_active").notNull().default(true),
});
export type SubRegion = typeof subRegions.$inferSelect;
export type NewSubRegion = typeof subRegions.$inferInsert;

export const countries = pgTable("countries", {
  id: serial("id").primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  dial_code: varchar("dial_code", { length: 10 }).notNull(),
  iso_code_alpha2: varchar("iso_code_alpha2").notNull(),
  iso_code_alpha3: varchar("iso_code_alpha3").notNull(),
  // UN M49 numeric code (identical to ISO 3166-1 numeric), canonical
  // zero-padded 3-char form, e.g. Fiji "242". Alternate key — serial `id`
  // stays the PK. Backfilled by joining iso_code_alpha3 → db/seed-data/un-m49.csv.
  m49_code: varchar("m49_code", { length: 3 }).unique(),
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

export const countryContext = pgTable("country_context", {
  id: serial("id").primaryKey().notNull(),
  country_id: integer("country_id")
    .notNull()
    .references(() => countries.id),
  dl_def_id: integer("dl_def_id")
    .notNull()
    .references(() => managedListItems.id),
  source_date: timestamp("source_date"),
  source_doc: varchar("source_doc", { length: 500 }),
  source_url: varchar("source_url", { length: 500 }),
  value: varchar("value", { length: 1000 }),
  updated_by: varchar("updated_by", { length: 255 }),
  updated_date: timestamp("updated_date").defaultNow().notNull(),
});

export type CountryContextRow = typeof countryContext.$inferSelect;
export type NewCountryContextRow = typeof countryContext.$inferInsert;
