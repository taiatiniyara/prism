import {
  boolean,
  integer,
  pgTable,
  serial,
  varchar,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { measureDefinitions } from "./dataEntry";

export const MEASURE_DIMENSIONS = [
  "energy_provider",
  "energy_type",
  "energy_source",
  "customer_type",
  "payment_mode",
  "consumption_band",
  "division",
  "gender",
] as const;

export type MeasureDimension = (typeof MEASURE_DIMENSIONS)[number];

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
    is_applicable: boolean("is_applicable").default(true).notNull(),
  },
  (table) => [
    uniqueIndex("uniq_measure_dimension_scope").on(
      table.measure_id,
      table.dimension,
    ),
  ],
);

export type MeasureDimensionScope = typeof measureDimensionScope.$inferSelect;
export type NewMeasureDimensionScope =
  typeof measureDimensionScope.$inferInsert;
