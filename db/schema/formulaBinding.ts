import {
  integer,
  pgTable,
  serial,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { measureDefinitions } from "./dataEntry";
import { managedListItems } from "./managedLists";

/**
 * Normalized, durable store for calculator formula bindings (spec §5.3).
 *
 * This is the SOURCE OF TRUTH for how each formula variable is bound to a
 * measure and its per-dimension slice. The legacy `kpi_definitions.formula_inputs`
 * / `measure_definitions.formula_inputs` JSON is kept in lockstep as a DERIVED
 * cache so the existing compute engine keeps working; Phase 2 switches the engine
 * to read these tables directly and retires the JSON. Formulas entered against
 * these tables are never re-keyed.
 *
 * `owner_kind` + `owner_id` is polymorphic (a KPI definition or a calculated
 * measure definition) — no hard FK on owner_id for that reason.
 */

export const FORMULA_BINDING_OWNER_KINDS = ["kpi", "measure"] as const;
export type FormulaBindingOwnerKind =
  (typeof FORMULA_BINDING_OWNER_KINDS)[number];

export const GRAIN_MODES = ["inherit", "rollup", "pin"] as const;
export type GrainMode = (typeof GRAIN_MODES)[number];

export const formulaBinding = pgTable(
  "formula_binding",
  {
    id: serial("id").primaryKey().notNull(),
    // "kpi" -> owner_id references kpi_definitions.id
    // "measure" -> owner_id references measure_definitions.id
    owner_kind: varchar("owner_kind", { length: 16 })
      .$type<FormulaBindingOwnerKind>()
      .notNull(),
    owner_id: integer("owner_id").notNull(),
    // The token used for this input in the owner's formula string.
    variable_name: varchar("variable_name", { length: 255 }).notNull(),
    // The measure this variable reads.
    input_measure_def_id: integer("input_measure_def_id")
      .notNull()
      .references(() => measureDefinitions.id),
    // How the input's grain relates to the owner's grain (Phase 1: informational;
    // rollup-when-coarser is automatic in the resolver).
    grain_mode: varchar("grain_mode", { length: 16 })
      .$type<GrainMode>()
      .notNull()
      .default("inherit"),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("formula_binding_owner_idx").on(t.owner_kind, t.owner_id)],
);

export const formulaBindingDimension = pgTable(
  "formula_binding_dimension",
  {
    id: serial("id").primaryKey().notNull(),
    binding_id: integer("binding_id")
      .notNull()
      .references(() => formulaBinding.id, { onDelete: "cascade" }),
    // Physical dimension column name, e.g. "provider_id", "customer_type_id".
    dimension_key: varchar("dimension_key", { length: 32 }).notNull(),
    // Pinned member OR the dimension's All-member id. NULL = Inherit (not sliced;
    // Phase 1 compiles this to the All-member in the derived JSON).
    member_id: integer("member_id").references(() => managedListItems.id),
  },
  (t) => [
    uniqueIndex("uq_formula_binding_dimension").on(
      t.binding_id,
      t.dimension_key,
    ),
  ],
);

export type FormulaBinding = typeof formulaBinding.$inferSelect;
export type NewFormulaBinding = typeof formulaBinding.$inferInsert;
export type FormulaBindingDimension =
  typeof formulaBindingDimension.$inferSelect;
export type NewFormulaBindingDimension =
  typeof formulaBindingDimension.$inferInsert;
