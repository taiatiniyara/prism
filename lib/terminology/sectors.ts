// The sectors PRISM benchmarks (ADR 0003 — sector-driven terminology).
// Modelled as a code-level union because `sector` is STRUCTURAL — code branches
// on it (which dimensions/measures/labels apply), the same call #10 made for
// `relationship` (enum) vs `entity_type` (managed list).
//
// PHASE 5B: this union is promoted to a `sectors` reference table
// (docs/multi-sector-terminology-resolutions.md Q3). Keep the string keys stable
// so the promotion is data-only.
export const SECTORS = ["electricity", "water", "sanitation"] as const;

export type Sector = (typeof SECTORS)[number];

// Electricity is the only live sector today; water/sanitation arrive with the
// deferred Phase 5c modelling. The label layer (Phase 5a) defaults here.
export const DEFAULT_SECTOR: Sector = "electricity";
