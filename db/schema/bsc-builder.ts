import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { kpiDefinitions } from "./kpi";
import { customKpiRequests } from "./custom-kpi-requests";
import { organisations } from "./utility";

/**
 * BSC Builder schema (see docs/bsc-builder-spec.md, docs/adr/0001-bsc-builder.md).
 *
 * Two-part model:
 *   - Master Template  -> bscTemplateNodes (shared, admin-editable)
 *   - Per-Utility overlay -> bscUtilityNodes (+ specific objectives, initiatives, KPI links)
 *
 * The upper, prescriptive zone (Perspective -> Strategic Lever) is one
 * self-referencing tree. The lower, utility-authored zone hangs off the
 * selected Strategic Lever nodes: Specific Objective -> Initiative -> KPI.
 */

// Upper-zone levels. The template stops at strategic_lever; everything below
// is utility-authored in dedicated tables.
export type BscTemplateLevel =
  | "perspective"
  | "overall_objective"
  | "key_focus_area"
  | "strategic_objective"
  | "strategic_lever";

// ---------------------------------------------------------------------------
// Master Template (shared across utilities; maintained by DEV/BMO)
// ---------------------------------------------------------------------------

export const bscTemplateNodes = pgTable(
  "bsc_template_node",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    parent_id: uuid("parent_id").references(
      (): AnyPgColumn => bscTemplateNodes.id,
      { onDelete: "cascade" },
    ),
    level: text("level").$type<BscTemplateLevel>().notNull(),
    label: text("label").notNull(),
    // Mandatory nodes are pre-ticked and locked on every utility scorecard.
    is_mandatory: boolean("is_mandatory").notNull().default(false),
    ord: integer("ord").notNull().default(0),
    // Soft-delete / retire instead of hard-deleting template nodes.
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("bsc_template_node_parent_idx").on(table.parent_id),
    index("bsc_template_node_level_idx").on(table.level),
  ],
);

export type BscTemplateNode = typeof bscTemplateNodes.$inferSelect;
export type NewBscTemplateNode = typeof bscTemplateNodes.$inferInsert;

// ---------------------------------------------------------------------------
// Per-Utility overlay — upper zone (selections + custom nodes)
// ---------------------------------------------------------------------------

// Every node in a utility's upper-zone tree (Perspective -> Strategic Lever) is
// a row here, whether it mirrors a template node or is a custom addition.
// Selection = existence of the row. template_node_id is null for custom nodes;
// label is used for custom nodes (and may mirror the template label otherwise).
export const bscUtilityNodes = pgTable(
  "bsc_utility_node",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    utility_id: integer("utility_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    template_node_id: uuid("template_node_id").references(
      () => bscTemplateNodes.id,
    ),
    parent_node_id: uuid("parent_node_id").references(
      (): AnyPgColumn => bscUtilityNodes.id,
      { onDelete: "cascade" },
    ),
    level: text("level").$type<BscTemplateLevel>().notNull(),
    // Custom-node label; for template-linked nodes the template label is the
    // source of truth, but we may store a copy for convenience.
    label: text("label"),
    ord: integer("ord").notNull().default(0),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("bsc_utility_node_utility_idx").on(table.utility_id),
    index("bsc_utility_node_parent_idx").on(table.parent_node_id),
    index("bsc_utility_node_template_idx").on(table.template_node_id),
    index("bsc_utility_node_utility_level_idx").on(
      table.utility_id,
      table.level,
    ),
  ],
);

export type BscUtilityNode = typeof bscUtilityNodes.$inferSelect;
export type NewBscUtilityNode = typeof bscUtilityNodes.$inferInsert;

// ---------------------------------------------------------------------------
// Per-Utility overlay — lower zone (authored: objective -> initiative -> KPI)
// ---------------------------------------------------------------------------

export const bscSpecificObjectives = pgTable(
  "bsc_specific_objective",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    utility_id: integer("utility_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    // Hangs off a selected Strategic Lever node.
    lever_node_id: uuid("lever_node_id")
      .notNull()
      .references(() => bscUtilityNodes.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    ord: integer("ord").notNull().default(0),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("bsc_specific_objective_utility_idx").on(table.utility_id),
    index("bsc_specific_objective_lever_idx").on(table.lever_node_id),
  ],
);

export type BscSpecificObjective = typeof bscSpecificObjectives.$inferSelect;
export type NewBscSpecificObjective = typeof bscSpecificObjectives.$inferInsert;

export const bscInitiatives = pgTable(
  "bsc_initiative",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    utility_id: integer("utility_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    specific_objective_id: uuid("specific_objective_id")
      .notNull()
      .references(() => bscSpecificObjectives.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    ord: integer("ord").notNull().default(0),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("bsc_initiative_utility_idx").on(table.utility_id),
    index("bsc_initiative_objective_idx").on(table.specific_objective_id),
  ],
);

export type BscInitiative = typeof bscInitiatives.$inferSelect;
export type NewBscInitiative = typeof bscInitiatives.$inferInsert;

// KPIs always hang under an Initiative. The same KPI may appear under multiple
// initiatives; scoring dedupes by KPI. A link points at either an approved KPI
// definition or a pending custom-KPI request (mutually exclusive in practice).
export const bscKpiLinks = pgTable(
  "bsc_kpi_link",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    utility_id: integer("utility_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    initiative_id: uuid("initiative_id")
      .notNull()
      .references(() => bscInitiatives.id, { onDelete: "cascade" }),
    kpi_def_id: integer("kpi_def_id").references(() => kpiDefinitions.id),
    pending_custom_kpi_request_id: uuid(
      "pending_custom_kpi_request_id",
    ).references(() => customKpiRequests.id),
    ord: integer("ord").notNull().default(0),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("bsc_kpi_link_utility_idx").on(table.utility_id),
    index("bsc_kpi_link_initiative_idx").on(table.initiative_id),
    index("bsc_kpi_link_kpi_def_idx").on(table.kpi_def_id),
  ],
);

export type BscKpiLink = typeof bscKpiLinks.$inferSelect;
export type NewBscKpiLink = typeof bscKpiLinks.$inferInsert;
