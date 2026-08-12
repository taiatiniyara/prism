import {
  integer,
  pgTable,
  serial,
  varchar,
  unique,
  date,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
    // Effective-dating (fiscal-year-compared) — a new expectation appears in shells
    // only from its effective period, never retroactively. NULL from = always valid.
    // See measure-effective-dating-spec / ADR 0004.
    effective_from: date("effective_from"),
    effective_to: date("effective_to"),
  },
  (table) => [
    unique("uq_mda").on(table.measure_id, table.dimension, table.member_id),
    check(
      "chk_mda_eff_order",
      sql`${table.effective_from} is null or ${table.effective_to} is null or ${table.effective_to} >= ${table.effective_from}`,
    ),
  ],
);

export { MEASURE_DIMENSIONS };
export type MeasureDimensionApplicability =
  typeof measureDimensionApplicability.$inferSelect;
export type NewMeasureDimensionApplicability =
  typeof measureDimensionApplicability.$inferInsert;
