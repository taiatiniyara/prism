import {
  integer,
  pgTable,
  serial,
  smallint,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { measureDefinitions } from "./dataEntry";
import { managedListItems } from "./managedLists";

/**
 * Effective-dated strata (grain) overrides for a measure.
 *
 * A measure's *base* grain lives in `measure_definitions.strata_id`. When a
 * measure is re-grained for future report periods only (e.g. Feeder Type moving
 * from Utility- to ServiceArea-grain for FY2026+), the change is recorded here
 * as (measure, new strata, effective_from_fy) rather than mutating the base —
 * so historical periods keep resolving to the grain they were reported at.
 *
 * Resolution (see the `effective_strata_id(measure_def_id, fy)` SQL function):
 *   effective strata for (measure, fy) =
 *     COALESCE(latest history row with effective_from_fy <= fy, base strata).
 *
 * Additive/greenfield: with no history rows, every measure resolves to its base
 * strata exactly as before. Owned by the migration/data stream (#2); consumed by
 * the relevance engine (#8, lib/relevance/expected.ts).
 */
export const measureStrataHistory = pgTable(
  "measure_strata_history",
  {
    id: serial("id").primaryKey().notNull(),
    measure_def_id: integer("measure_def_id")
      .notNull()
      .references(() => measureDefinitions.id, { onDelete: "cascade" }),
    // the strata (grain) that becomes effective from `effective_from_fy` onward —
    // a managed_list_items id in the "Strata" list (Unit/ServiceArea/Utility/…).
    strata_id: integer("strata_id")
      .notNull()
      .references(() => managedListItems.id),
    // financial year (EXTRACT(year FROM report_period.report_date)) from which
    // this strata applies; the latest row whose fy <= a period's fy wins.
    effective_from_fy: smallint("effective_from_fy").notNull(),
  },
  (table) => [
    uniqueIndex("uq_measure_strata_history").on(
      table.measure_def_id,
      table.effective_from_fy,
    ),
  ],
);

export type MeasureStrataHistory = typeof measureStrataHistory.$inferSelect;
export type NewMeasureStrataHistory = typeof measureStrataHistory.$inferInsert;
