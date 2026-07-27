import { boolean, integer, pgTable, varchar } from "drizzle-orm/pg-core";

// The sectors PRISM benchmarks (ADR 0003 — sector-driven terminology).
// This is the DB reference table backing the Phase-5a code-level `Sector` union
// in lib/terminology/sectors.ts — `code` here MUST match those string keys
// ('electricity' | 'water' | 'sanitation'). Explicit integer ids (not serial)
// so the same id means the same sector across environments — safe to reference
// from FKs (e.g. #10's benchmarking_group_sector) and the Phase-5b
// sector_terminology table.
export const sectors = pgTable("sectors", {
  id: integer("id").primaryKey().notNull(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 64 }).notNull(),
  sort_order: integer("sort_order").notNull().default(0),
  is_active: boolean("is_active").notNull().default(true),
});

// Row type is `SectorRow` to avoid colliding with the presentation-layer `Sector`
// string-union type in lib/terminology/sectors.ts.
export type SectorRow = typeof sectors.$inferSelect;
export type NewSectorRow = typeof sectors.$inferInsert;
