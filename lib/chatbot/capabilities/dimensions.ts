import { and, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { energyResources } from "@/db/schema/utility";

import {
  toPercent,
  type CapabilityContext,
  type CapabilityResolution,
} from "./common";
import type { ChatbotCapabilityName } from "../types";

const STATUS_LABELS: Record<number, string> = {
  1: "Requested",
  2: "Pending",
  3: "Entered",
  4: "Reviewed",
  5: "Approved",
  6: "Endorsed",
  7: "Not_Available",
};

const COMPLETION_STATUS_IDS = [3, 4, 5, 6];

interface BreakdownRow {
  label: string;
  total: number;
  byStatus: Record<string, number>;
}

const summariseRow = (row: BreakdownRow): string => {
  const completed = COMPLETION_STATUS_IDS.reduce(
    (sum, id) => sum + (row.byStatus[STATUS_LABELS[id]] ?? 0),
    0,
  );
  const pending = row.byStatus.Pending ?? 0;
  const notAvailable = row.byStatus.Not_Available ?? 0;
  const completion = toPercent(completed, row.total);
  const breakdown = Object.entries(row.byStatus)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status}=${count}`)
    .join(", ");
  return `- ${row.label}: total=${row.total}, completion=${completion} (entered+reviewed+approved+endorsed=${completed}), pending=${pending}, not_available=${notAvailable}${breakdown ? ` | raw: ${breakdown}` : ""}`;
};

const resolveScopePeriodIds = (ctx: CapabilityContext): number[] => {
  const ids = new Set<number>();

  const yearMatch = ctx.latestUserMessage.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    const year = yearMatch[1];
    for (const period of ctx.scopedPeriods) {
      if (period.Period.includes(year)) {
        ids.add(period.Id);
      }
    }
  }

  if (ids.size === 0 && ctx.selectedPeriod) {
    ids.add(ctx.selectedPeriod.Id);
  }

  if (ids.size === 0) {
    for (const period of ctx.scopedPeriods.slice(0, 6)) {
      ids.add(period.Id);
    }
  }

  return [...ids];
};

const buildPeriodsLabel = (
  ctx: CapabilityContext,
  periodIds: number[],
): string => {
  const includedPeriods = ctx.scopedPeriods.filter((period) =>
    periodIds.includes(period.Id),
  );
  if (includedPeriods.length === 0) {
    return ctx.selectedPeriod?.Period ?? `${periodIds.length} period(s)`;
  }
  return (
    includedPeriods
      .slice(0, 6)
      .map((period) => `${period.Period} (${period.Utility || ""})`)
      .join("; ") +
    (includedPeriods.length > 6 ? ` (+${includedPeriods.length - 6} more)` : "")
  );
};

/**
 * Describes one of PRISM's dimension axes that can break down data-entry
 * completeness. Each dimension is a column on `data_entries` (directly or via
 * a join) that maps to a managed-list label.
 */
type DimensionSource =
  | "data_entry_managed_list" // FK on data_entries → managed_lists
  | "input_definition_managed_list" // FK on input_definitions → managed_lists
  | "energy_resource_join_managed_list" // join data_entries → energy_resources → managed_lists
  | "energy_resource_name"; // join data_entries → energy_resources (use the resource name itself)

interface DimensionConfig {
  capability: Exclude<ChatbotCapabilityName, "visual-presentation-hints">;
  /** Human-readable label used in the grounding header. */
  label: string;
  /** Plural form used in summary lines ("Categories observed: …"). */
  pluralLabel: string;
  source: DimensionSource;
  /**
   * Identifies the column. For `data_entry_managed_list` and
   * `input_definition_managed_list`, this is the FK column reference. For
   * energy-resource sources we pick the join target inline.
   */
  groupColumn:
    | "energy_provider_id"
    | "energy_source_id"
    | "customer_type_id"
    | "payment_mode_id"
    | "subcategory_id"
    | "agg_level_id"
    | "energy_type_id"
    | "energy_resource_id";
  /** Extra dimensions that this snapshot does NOT cover (for the guard line). */
  unavailableDimensions: string;
}

const runDimensionQuery = async (
  config: DimensionConfig,
  periodIds: number[],
): Promise<
  {
    id: number | null;
    name: string | null;
    statusId: number | null;
    count: number;
  }[]
> => {
  const baseWhere = and(
    inArray(dataEntries.report_period_id, periodIds),
    eq(dataEntries.is_deleted, false),
    eq(dataEntries.is_relevant, true),
  ) as SQL;

  if (config.source === "data_entry_managed_list") {
    const idCol =
      config.groupColumn === "energy_provider_id"
        ? dataEntries.energy_provider_id
        : config.groupColumn === "energy_source_id"
          ? dataEntries.energy_source_id
          : config.groupColumn === "customer_type_id"
            ? dataEntries.customer_type_id
            : dataEntries.payment_mode_id;
    const rows = await db
      .select({
        id: idCol,
        name: managedListItems.name,
        statusId: dataEntries.status_id,
        count: sql<number>`count(*)::int`,
      })
      .from(dataEntries)
      .leftJoin(managedListItems, eq(idCol, managedListItems.id))
      .where(baseWhere)
      .groupBy(idCol, managedListItems.name, dataEntries.status_id);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      statusId: row.statusId,
      count: Number(row.count),
    }));
  }

  if (config.source === "input_definition_managed_list") {
    const idCol =
      config.groupColumn === "subcategory_id"
        ? inputDefinitions.subcategory_id
        : inputDefinitions.agg_level_id;
    const rows = await db
      .select({
        id: idCol,
        name: managedListItems.name,
        statusId: dataEntries.status_id,
        count: sql<number>`count(*)::int`,
      })
      .from(dataEntries)
      .innerJoin(
        inputDefinitions,
        eq(dataEntries.input_def_id, inputDefinitions.id),
      )
      .leftJoin(managedListItems, eq(idCol, managedListItems.id))
      .where(baseWhere)
      .groupBy(idCol, managedListItems.name, dataEntries.status_id);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      statusId: row.statusId,
      count: Number(row.count),
    }));
  }

  if (config.source === "energy_resource_join_managed_list") {
    // Only "energy_type_id" routes here today.
    const idCol = energyResources.energy_type_id;
    const rows = await db
      .select({
        id: idCol,
        name: managedListItems.name,
        statusId: dataEntries.status_id,
        count: sql<number>`count(*)::int`,
      })
      .from(dataEntries)
      .innerJoin(
        energyResources,
        eq(dataEntries.energy_resource_id, energyResources.id),
      )
      .leftJoin(managedListItems, eq(idCol, managedListItems.id))
      .where(baseWhere)
      .groupBy(idCol, managedListItems.name, dataEntries.status_id);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      statusId: row.statusId,
      count: Number(row.count),
    }));
  }

  // energy_resource_name
  const rows = await db
    .select({
      id: energyResources.id,
      name: energyResources.name,
      statusId: dataEntries.status_id,
      count: sql<number>`count(*)::int`,
    })
    .from(dataEntries)
    .innerJoin(
      energyResources,
      eq(dataEntries.energy_resource_id, energyResources.id),
    )
    .where(baseWhere)
    .groupBy(energyResources.id, energyResources.name, dataEntries.status_id);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    statusId: row.statusId,
    count: Number(row.count),
  }));
};

const buildDimensionContext = async (
  ctx: CapabilityContext,
  config: DimensionConfig,
): Promise<CapabilityResolution> => {
  const periodIds = resolveScopePeriodIds(ctx);

  if (periodIds.length === 0) {
    return {
      capability: config.capability,
      contextBlock: `PRISM data grounding: ${config.label} completeness snapshot unavailable because no report periods are in scope.`,
    };
  }

  const rows = await runDimensionQuery(config, periodIds);

  const groups = new Map<string, BreakdownRow>();
  for (const row of rows) {
    const label = row.name ?? `${config.label} #${row.id ?? "unknown"}`;
    const existing = groups.get(label) ?? {
      label,
      total: 0,
      byStatus: {},
    };
    const statusLabel = STATUS_LABELS[row.statusId ?? -1] ?? "Unknown";
    existing.byStatus[statusLabel] =
      (existing.byStatus[statusLabel] ?? 0) + row.count;
    existing.total += row.count;
    groups.set(label, existing);
  }

  const sortedRows = [...groups.values()].sort((a, b) => a.total - b.total);

  const periodsLabel = buildPeriodsLabel(ctx, periodIds);
  const utilityLabel = ctx.allUtilitiesRequested
    ? "all-utilities"
    : (ctx.defaultUtility ?? "default utility");

  return {
    capability: config.capability,
    contextBlock: [
      `PRISM data grounding: ${config.label} completeness snapshot.`,
      `Available dimensions: ${config.label}, status (across the selected report period(s)).`,
      `Unavailable dimensions in this grounding: ${config.unavailableDimensions}.`,
      `Scope: ${utilityLabel}, period(s): ${periodsLabel} (${periodIds.length} period id(s) in query).`,
      `${config.pluralLabel} observed: ${sortedRows.length}`,
      `Per-${config.label} status counts (sorted by lowest total entries first):`,
      ...(sortedRows.length
        ? sortedRows.map(summariseRow)
        : [`- No data-entry rows found for the scoped periods.`]),
    ].join("\n"),
  };
};

export const buildSubcategoryCompletenessContext = (ctx: CapabilityContext) =>
  buildDimensionContext(ctx, {
    capability: "subcategory-completeness-snapshot",
    label: "subcategory",
    pluralLabel: "Subcategories",
    source: "input_definition_managed_list",
    groupColumn: "subcategory_id",
    unavailableDimensions:
      "individual data-entry value, energy-source breakdown, KPI-level rollup",
  });

export const buildEnergySourceCompletenessContext = (ctx: CapabilityContext) =>
  buildDimensionContext(ctx, {
    capability: "energy-source-completeness-snapshot",
    label: "energy-source",
    pluralLabel: "Energy sources",
    source: "data_entry_managed_list",
    groupColumn: "energy_source_id",
    unavailableDimensions:
      "individual data-entry value, KPI-level rollup, customer-type breakdown",
  });

export const buildEnergyProviderCompletenessContext = (
  ctx: CapabilityContext,
) =>
  buildDimensionContext(ctx, {
    capability: "energy-provider-completeness-snapshot",
    label: "energy-provider",
    pluralLabel: "Energy providers",
    source: "data_entry_managed_list",
    groupColumn: "energy_provider_id",
    unavailableDimensions:
      "individual data-entry value, KPI-level rollup, payment-mode breakdown",
  });

export const buildEnergyTypeCompletenessContext = (ctx: CapabilityContext) =>
  buildDimensionContext(ctx, {
    capability: "energy-type-completeness-snapshot",
    label: "energy-type",
    pluralLabel: "Energy types",
    source: "energy_resource_join_managed_list",
    groupColumn: "energy_type_id",
    unavailableDimensions:
      "individual data-entry value, KPI-level rollup; only entries linked to an energy resource are counted",
  });

export const buildAggregationLevelCompletenessContext = (
  ctx: CapabilityContext,
) =>
  buildDimensionContext(ctx, {
    capability: "aggregation-level-completeness-snapshot",
    label: "aggregation-level",
    pluralLabel: "Aggregation levels",
    source: "input_definition_managed_list",
    groupColumn: "agg_level_id",
    unavailableDimensions:
      "individual data-entry value, KPI-level rollup, service-area breakdown",
  });

export const buildEnergyResourceCompletenessContext = (
  ctx: CapabilityContext,
) =>
  buildDimensionContext(ctx, {
    capability: "energy-resource-completeness-snapshot",
    label: "energy-resource",
    pluralLabel: "Energy resources",
    source: "energy_resource_name",
    groupColumn: "energy_resource_id",
    unavailableDimensions:
      "individual data-entry value, KPI-level rollup; only entries linked to an energy resource are counted",
  });

export const buildCustomerTypeCompletenessContext = (ctx: CapabilityContext) =>
  buildDimensionContext(ctx, {
    capability: "customer-type-completeness-snapshot",
    label: "customer-type",
    pluralLabel: "Customer types",
    source: "data_entry_managed_list",
    groupColumn: "customer_type_id",
    unavailableDimensions:
      "individual data-entry value, KPI-level rollup, energy-source breakdown",
  });

export const buildPaymentModeCompletenessContext = (ctx: CapabilityContext) =>
  buildDimensionContext(ctx, {
    capability: "payment-mode-completeness-snapshot",
    label: "payment-mode",
    pluralLabel: "Payment modes",
    source: "data_entry_managed_list",
    groupColumn: "payment_mode_id",
    unavailableDimensions:
      "individual data-entry value, KPI-level rollup, energy-source breakdown",
  });
