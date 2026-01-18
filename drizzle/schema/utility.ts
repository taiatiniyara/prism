import { boolean, integer, pgTable, serial, varchar } from "drizzle-orm/pg-core";
import { countries } from "./country";

export const organisations = pgTable("organisations", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    country_id: integer("country_id").notNull().references(() => countries.id),
    is_utility: boolean("is_utility").notNull().default(false),
});

export const serviceAreas = pgTable("service_areas", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    utility_id: integer("utility_id").notNull().references(() => organisations.id),
})

export const powerStations = pgTable("power_stations", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    service_area_id: integer("service_area_id").notNull().references(() => serviceAreas.id),
    utility_id: integer("utility_id").notNull().references(() => organisations.id),
});

export const generators = pgTable("generators", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    power_station_id: integer("power_station_id").references(() => powerStations.id),
    service_area_id: integer("service_area_id").notNull().references(() => serviceAreas.id),
    utility_id: integer("utility_id").notNull().references(() => organisations.id),
    capacity_mw: integer("capacity_mw").notNull(),
});