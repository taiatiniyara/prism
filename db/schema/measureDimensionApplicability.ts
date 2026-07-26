import {
  integer,
  pgTable,
  serial,
  varchar,
  unique,
} from "drizzle-orm/pg-core";
import { measureDefinitions } from "./dataEntry";
import { managedListItems } from "./managedLists";
import { MEASURE_DIMENSIONS, type MeasureDimension } from "./measureDimensionScope";

/**
 * Catalogue-level, BMO-maintained: for a measure's by_context dimension, WHICH members
 * are valid. No rows for a (measure, dimension) = all members valid. Complements
 * measure_dimension_scope (which dimensions) with which members. Drives shell generation.
 */
export const measureDimensionApplicability = pgTable(
  "measure_dimension_applicability",
  {
    id: serial("id").primaryKey().notNull(),
    measure_id: integer("measure_id")
      .notNull()
      .references(() => measureDefinitions.id, { onDelete: "cascade" }),
    dimension: varchar("dimension", { length: 24 })
      .$type<MeasureDimension>()
      .notNull(),
    member_id: integer("member_id")
      .notNull()
      .references(() => managedListItems.id),
  },
  (table) => [
    unique("uq_mda").on(table.measure_id, table.dimension, table.member_id),
  ],
);

export { MEASURE_DIMENSIONS };
export type MeasureDimensionApplicability =
  typeof measureDimensionApplicability.$inferSelect;
export type NewMeasureDimensionApplicability =
  typeof measureDimensionApplicability.$inferInsert;
