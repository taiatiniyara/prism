import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { user } from "./auth-schema";
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
    // Strategy-map defaults (see docs/bsc-builder-spec.md §13). map_label is the
    // short caption shown on the map (the full `label` is usually a sentence);
    // is_map_node declares this node a map node by default (decouples "on map"
    // from level — e.g. Financial promotes its key_focus_area, not the verbose
    // strategic_objective). Utilities can override both in their overlay.
    map_label: text("map_label"),
    is_map_node: boolean("is_map_node").notNull().default(false),
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
    // Strategy-map overrides (see docs/bsc-builder-spec.md §13). All nullable =
    // "inherit". Effective map label  = coalesce(map_label, template.map_label, label).
    // Effective on-map flag = coalesce(is_map_node, template.is_map_node, false);
    // for custom nodes (no template) only the utility value applies.
    map_label: text("map_label"),
    is_map_node: boolean("is_map_node"),
    // Manual drag-to-position override; null = auto-layout (band by perspective
    // ancestor, theme column by key_focus_area ancestor, ordered by `ord`).
    map_x: integer("map_x"),
    map_y: integer("map_y"),
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
    // A utility selects any given template node at most once. Partial (custom
    // nodes have a null template_node_id and may repeat). Guards against the
    // autosave race that duplicated whole perspective subtrees (migration 0029).
    uniqueIndex("bsc_utility_node_utility_template_uidx")
      .on(table.utility_id, table.template_node_id)
      .where(sql`${table.template_node_id} is not null`),
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

// An activity driving a Specific Objective's KPIs. `kind` distinguishes an
// ongoing Initiative from a time-bound Project; project fields are only
// meaningful when kind = "project".
export type BscActivityKind = "initiative" | "project";
export type BscProjectStatus =
  | "planned"
  | "in_progress"
  | "complete"
  | "on_hold";

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
    kind: varchar("kind", { length: 16 })
      .$type<BscActivityKind>()
      .notNull()
      .default("initiative"),
    // Project-only fields (null for initiatives).
    start_date: date("start_date"),
    target_completion_date: date("target_completion_date"),
    status: varchar("status", { length: 16 }).$type<BscProjectStatus>(),
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

// ---------------------------------------------------------------------------
// Strategy Map — per-Utility cause-effect edges between map nodes
// ---------------------------------------------------------------------------

// A directed cause-effect edge: source_node "drives" target_node. Both endpoints
// are bsc_utility_nodes flagged as map nodes (usually strategic_objective level),
// and the edge is per-Utility — each utility authors its own causal arrows. The
// edge cascades away when either endpoint node is removed. source != target and
// "both endpoints belong to this utility" are enforced in the service layer; a
// cycle is warned-but-allowed (a strategy map is usually a DAG, but feedback
// loops are not forbidden). See docs/bsc-builder-spec.md §13.
export type BscLinkRelation = "drives" | "enables" | "constrains";

export const bscObjectiveLinks = pgTable(
  "bsc_objective_link",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    utility_id: integer("utility_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    source_node_id: uuid("source_node_id")
      .notNull()
      .references((): AnyPgColumn => bscUtilityNodes.id, { onDelete: "cascade" }),
    target_node_id: uuid("target_node_id")
      .notNull()
      .references((): AnyPgColumn => bscUtilityNodes.id, { onDelete: "cascade" }),
    relation: varchar("relation", { length: 16 })
      .$type<BscLinkRelation>()
      .notNull()
      .default("drives"),
    // Optional rationale for the link ("capability -> faster restoration").
    note: text("note"),
    ord: integer("ord").notNull().default(0),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("bsc_objective_link_utility_idx").on(table.utility_id),
    index("bsc_objective_link_source_idx").on(table.source_node_id),
    index("bsc_objective_link_target_idx").on(table.target_node_id),
    // One edge per ordered pair within a utility (kills duplicate arrows).
    uniqueIndex("bsc_objective_link_pair_idx").on(
      table.utility_id,
      table.source_node_id,
      table.target_node_id,
    ),
  ],
);

export type BscObjectiveLink = typeof bscObjectiveLinks.$inferSelect;
export type NewBscObjectiveLink = typeof bscObjectiveLinks.$inferInsert;

// ---------------------------------------------------------------------------
// Master cause-effect links between TEMPLATE nodes (BMO-authored). These
// cascade to every utility's strategy map as mandatory, locked edges (resolved
// to the utility's matching nodes at read time). Per-utility BLO links live in
// bsc_objective_link above.
// ---------------------------------------------------------------------------

export const bscTemplateLinks = pgTable(
  "bsc_template_link",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    source_node_id: uuid("source_node_id")
      .notNull()
      .references((): AnyPgColumn => bscTemplateNodes.id, {
        onDelete: "cascade",
      }),
    target_node_id: uuid("target_node_id")
      .notNull()
      .references((): AnyPgColumn => bscTemplateNodes.id, {
        onDelete: "cascade",
      }),
    relation: varchar("relation", { length: 16 })
      .$type<BscLinkRelation>()
      .notNull()
      .default("drives"),
    ord: integer("ord").notNull().default(0),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("bsc_template_link_source_idx").on(table.source_node_id),
    index("bsc_template_link_target_idx").on(table.target_node_id),
    uniqueIndex("bsc_template_link_pair_idx").on(
      table.source_node_id,
      table.target_node_id,
    ),
  ],
);

export type BscTemplateLink = typeof bscTemplateLinks.$inferSelect;
export type NewBscTemplateLink = typeof bscTemplateLinks.$inferInsert;

// ---------------------------------------------------------------------------
// BSC theme — DEV-editable, product-wide styling overrides for BSC elements.
// A single "global" row holds a map of element-type -> curated style props.
// ---------------------------------------------------------------------------

export type BscElementStyle = {
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  fontSize?: number;
  fontWeight?: number;
  padding?: number;
};

// Keyed by styleable element id (see new-bsc/theme.ts STYLEABLE_ELEMENTS).
export type BscThemeStyles = Record<string, BscElementStyle>;

export const bscTheme = pgTable(
  "bsc_theme",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    scope: varchar("scope", { length: 32 }).notNull().default("global"),
    styles: json("styles").$type<BscThemeStyles>().notNull().default({}),
    updated_by_id: text("updated_by_id").references(() => user.id),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("bsc_theme_scope_idx").on(table.scope)],
);

export type BscTheme = typeof bscTheme.$inferSelect;
export type NewBscTheme = typeof bscTheme.$inferInsert;

// ---------------------------------------------------------------------------
// BSC KPI target plan — the generated period set for a (utility, KPI), so we
// can tell how many periods were expected vs filled (Targets status). Filled
// values are still written through to kpiDefinitions.targets for scoring.
// ---------------------------------------------------------------------------

export type BscTargetPlanPeriod = {
  label: string;
  year: number;
  month: number | null;
  value: string;
};

export const bscKpiTargetPlan = pgTable(
  "bsc_kpi_target_plan",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    utility_id: integer("utility_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    kpi_def_id: integer("kpi_def_id")
      .notNull()
      .references(() => kpiDefinitions.id, { onDelete: "cascade" }),
    frequency: text("frequency"),
    start_date: date("start_date"),
    periods: json("periods").$type<BscTargetPlanPeriod[]>().notNull().default([]),
    updated_by_id: text("updated_by_id").references(() => user.id),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("bsc_kpi_target_plan_utility_kpi_idx").on(
      table.utility_id,
      table.kpi_def_id,
    ),
  ],
);

export type BscKpiTargetPlan = typeof bscKpiTargetPlan.$inferSelect;
export type NewBscKpiTargetPlan = typeof bscKpiTargetPlan.$inferInsert;
