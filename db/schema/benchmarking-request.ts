import {
  index,
  integer,
  pgTable,
  serial,
  timestamp,
} from "drizzle-orm/pg-core";
import { organisations } from "./utility";
import { managedListItems } from "./managedLists";

export const benchmarkingRequests = pgTable(
  "benchmarking_request",
  {
    id: serial("id").primaryKey().notNull(),
    date: timestamp("date").defaultNow().notNull(),
    benchmark_utility_id: integer("benchmark_utility_id")
      .notNull()
      .references(() => organisations.id),
    requesting_utility_id: integer("requesting_utility_id")
      .notNull()
      .references(() => organisations.id),
    decision_type_id: integer("decision_type_id")
      .notNull()
      .references(() => managedListItems.id),
    decision_by_id: integer("decision_by_id"),
    decision_date: timestamp("decision_date"),
    request_expiry: timestamp("request_expiry"),
  },
  (table) => [
    index("benchmarking_request_requesting_idx").on(
      table.requesting_utility_id,
    ),
    index("benchmarking_request_benchmark_idx").on(
      table.benchmark_utility_id,
    ),
  ],
);

export type BenchmarkingRequest = typeof benchmarkingRequests.$inferSelect;
export type NewBenchmarkingRequest =
  typeof benchmarkingRequests.$inferInsert;
