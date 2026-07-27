// The sectors PRISM benchmarks (ADR 0003 — sector-driven terminology).
// Modelled as a code-level union because `sector` is STRUCTURAL — code branches
// on it (which dimensions/measures/labels apply), the same call #10 made for
// `relationship` (enum) vs `entity_type` (managed list).
//
// PHASE 5B (done): this set is now also a DB reference table `sectors`
// (db/schema/sector.ts) whose `code` column MUST match these string keys — keep
// them in sync. The table exists so FKs can reference sectors (#10's
// benchmarking_group_sector, the future sector_terminology table); this union
// stays the type-level source of truth the resolver/config branch on.
export const SECTORS = ["electricity", "water", "sanitation"] as const;

export type Sector = (typeof SECTORS)[number];

// Electricity is the only live sector today; water/sanitation arrive with the
// deferred Phase 5c modelling. The label layer (Phase 5a) defaults here.
export const DEFAULT_SECTOR: Sector = "electricity";
