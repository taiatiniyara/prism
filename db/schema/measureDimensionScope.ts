import {
  integer,
  pgTable,
  serial,
  varchar,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { measureDefinitions } from "./dataEntry";

// The ten canonical dimensions (medallion redesign).
export const MEASURE_DIMENSIONS = [
  "provider",
  "type",
  "source",
  "resource_type",
  "customer_type",
  "payment_mode",
  "band",
  "division",
  "gender",
  "utility_function",
] as const;
export type MeasureDimension = (typeof MEASURE_DIMENSIONS)[number];

export const EXPANSION_MODES = [
  "not_applicable",
  "all_members",
  "by_context",
] as const;
export type ExpansionMode = (typeof EXPANSION_MODES)[number];

export const measureDimensionScope = pgTable(
  "measure_dimension_scope",
  {
    id: serial("id").primaryKey().notNull(),
    measure_id: integer("measure_id")
      .notNull()
      .references(() => measureDefinitions.id, { onDelete: "cascade" }),
    dimension: varchar("dimension", { length: 32 })
      .$type<MeasureDimension>()
      .notNull(),
    // not_applicable | all_members | by_context
    expansion_mode: varchar("expansion_mode", { length: 16 })
      .$type<ExpansionMode>()
      .notNull(),
  },
  (table) => [
    uniqueIndex("uq_scope").on(table.measure_id, table.dimension),
  ],
);

export type MeasureDimensionScope = typeof measureDimensionScope.$inferSelect;
export type NewMeasureDimensionScope =
  typeof measureDimensionScope.$inferInsert;
