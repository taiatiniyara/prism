import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { serviceAreas } from "@/db/schema/utility";

import {
  toPercent,
  type CapabilityContext,
  type CapabilityResolution,
} from "./common";

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

const isUtilityScopedRole = (role: string): boolean =>
  role !== "DEV" && role !== "BMO";

const resolveScopePeriodIds = (ctx: CapabilityContext): number[] => {
  const ids = new Set<number>();

  // If the user explicitly named a year (e.g. "2023"), include every scoped
  // period whose label contains that year — across all utilities when the
  // user asked for all-utilities. This avoids silently truncating to a
  // single period when the question is intrinsically multi-period.
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

export const buildCategoryCompletenessContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  const periodIds = resolveScopePeriodIds(ctx);

  if (periodIds.length === 0) {
    return {
      capability: "category-completeness-snapshot",
      contextBlock:
        "PRISM data grounding: category-completeness snapshot unavailable because no report periods are in scope.",
    };
  }

  const rows = await db
    .select({
      categoryId: inputDefinitions.category_id,
      categoryName: managedListItems.name,
      statusId: dataEntries.status_id,
      count: sql<number>`count(*)::int`,
    })
    .from(dataEntries)
    .innerJoin(
      inputDefinitions,
      eq(dataEntries.input_def_id, inputDefinitions.id),
    )
    .leftJoin(
      managedListItems,
      eq(inputDefinitions.category_id, managedListItems.id),
    )
    .where(
      and(
        inArray(dataEntries.report_period_id, periodIds),
        eq(dataEntries.is_deleted, false),
        eq(dataEntries.is_relevant, true),
      ),
    )
    .groupBy(
      inputDefinitions.category_id,
      managedListItems.name,
      dataEntries.status_id,
    );

  const byCategory = new Map<string, BreakdownRow>();
  for (const row of rows) {
    const label = row.categoryName ?? `category #${row.categoryId}`;
    const existing = byCategory.get(label) ?? {
      label,
      total: 0,
      byStatus: {},
    };
    const statusLabel = STATUS_LABELS[row.statusId ?? -1] ?? "Unknown";
    existing.byStatus[statusLabel] =
      (existing.byStatus[statusLabel] ?? 0) + Number(row.count);
    existing.total += Number(row.count);
    byCategory.set(label, existing);
  }

  const sortedRows = [...byCategory.values()].sort((a, b) => a.total - b.total);

  const includedPeriods = ctx.scopedPeriods.filter((period) =>
    periodIds.includes(period.Id),
  );
  const periodsLabel =
    includedPeriods.length > 0
      ? includedPeriods
          .slice(0, 6)
          .map((period) => `${period.Period} (${period.Utility || ""})`)
          .join("; ") +
        (includedPeriods.length > 6
          ? ` (+${includedPeriods.length - 6} more)`
          : "")
      : (ctx.selectedPeriod?.Period ?? `${periodIds.length} period(s)`);
  const utilityLabel = ctx.allUtilitiesRequested
    ? "all-utilities"
    : (ctx.defaultUtility ?? "default utility");

  return {
    capability: "category-completeness-snapshot",
    contextBlock: [
      "PRISM data grounding: input-category completeness snapshot.",
      "Available dimensions: input-category, status (across the selected report period(s)).",
      "Unavailable dimensions in this grounding: individual data-entry value, energy-source breakdown, KPI-level rollup, peer comparison.",
      `Scope: ${utilityLabel}, period(s): ${periodsLabel} (${periodIds.length} period id(s) in query).`,
      `Categories observed: ${sortedRows.length}`,
      "Per-category status counts (sorted by lowest total entries first):",
      ...(sortedRows.length
        ? sortedRows.map(summariseRow)
        : ["- No data-entry rows found for the scoped periods."]),
    ].join("\n"),
  };
};

export const buildServiceAreaCompletenessContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  const periodIds = resolveScopePeriodIds(ctx);

  if (periodIds.length === 0) {
    return {
      capability: "service-area-completeness-snapshot",
      contextBlock:
        "PRISM data grounding: service-area-completeness snapshot unavailable because no report periods are in scope.",
    };
  }

  const periodScope = await db
    .select({
      id: reportPeriods.id,
      utility_id: reportPeriods.utility_id,
    })
    .from(reportPeriods)
    .where(inArray(reportPeriods.id, periodIds));
  const utilityIds = [
    ...new Set(
      periodScope
        .map((row) => row.utility_id)
        .filter((id): id is number => id != null),
    ),
  ];

  const serviceAreaConditions = [eq(serviceAreas.is_active, true)];
  if (
    !ctx.allUtilitiesRequested &&
    isUtilityScopedRole(ctx.user.role) &&
    ctx.user.org_id != null
  ) {
    serviceAreaConditions.push(eq(serviceAreas.utility_id, ctx.user.org_id));
  } else if (utilityIds.length > 0) {
    serviceAreaConditions.push(inArray(serviceAreas.utility_id, utilityIds));
  }

  const areaRows = await db
    .select({
      id: serviceAreas.id,
      name: serviceAreas.name,
      utilityId: serviceAreas.utility_id,
    })
    .from(serviceAreas)
    .where(and(...serviceAreaConditions));

  if (areaRows.length === 0) {
    return {
      capability: "service-area-completeness-snapshot",
      contextBlock: [
        "PRISM data grounding: service-area completeness snapshot.",
        "Available dimensions: service-area, status (across the selected report period(s)).",
        "Unavailable dimensions in this grounding: individual data-entry value, energy-source breakdown, KPI-level rollup.",
        "No service areas in scope for this user/utility.",
      ].join("\n"),
    };
  }

  const areaIds = areaRows.map((row) => row.id);
  const areaNameById = new Map(areaRows.map((row) => [row.id, row.name]));

  const entryRows = await db
    .select({
      serviceAreaId: dataEntries.service_area_id,
      statusId: dataEntries.status_id,
      count: sql<number>`count(*)::int`,
    })
    .from(dataEntries)
    .where(
      and(
        inArray(dataEntries.report_period_id, periodIds),
        inArray(dataEntries.service_area_id, areaIds),
        eq(dataEntries.is_deleted, false),
        eq(dataEntries.is_relevant, true),
      ),
    )
    .groupBy(dataEntries.service_area_id, dataEntries.status_id);

  const byArea = new Map<string, BreakdownRow>();
  for (const row of entryRows) {
    const label =
      areaNameById.get(row.serviceAreaId ?? -1) ??
      `service area #${row.serviceAreaId}`;
    const existing = byArea.get(label) ?? {
      label,
      total: 0,
      byStatus: {},
    };
    const statusLabel = STATUS_LABELS[row.statusId ?? -1] ?? "Unknown";
    existing.byStatus[statusLabel] =
      (existing.byStatus[statusLabel] ?? 0) + Number(row.count);
    existing.total += Number(row.count);
    byArea.set(label, existing);
  }

  for (const area of areaRows) {
    if (!byArea.has(area.name)) {
      byArea.set(area.name, { label: area.name, total: 0, byStatus: {} });
    }
  }

  const sortedRows = [...byArea.values()].sort((a, b) => a.total - b.total);

  const includedPeriods = ctx.scopedPeriods.filter((period) =>
    periodIds.includes(period.Id),
  );
  const periodsLabel =
    includedPeriods.length > 0
      ? includedPeriods
          .slice(0, 6)
          .map((period) => `${period.Period} (${period.Utility || ""})`)
          .join("; ") +
        (includedPeriods.length > 6
          ? ` (+${includedPeriods.length - 6} more)`
          : "")
      : (ctx.selectedPeriod?.Period ?? `${periodIds.length} period(s)`);
  const utilityLabel = ctx.allUtilitiesRequested
    ? "all-utilities"
    : (ctx.defaultUtility ?? "default utility");

  return {
    capability: "service-area-completeness-snapshot",
    contextBlock: [
      "PRISM data grounding: service-area completeness snapshot.",
      "Available dimensions: service-area, status (across the selected report period(s)).",
      "Unavailable dimensions in this grounding: individual data-entry value, energy-source breakdown, KPI-level rollup.",
      `Scope: ${utilityLabel}, period(s): ${periodsLabel} (${periodIds.length} period id(s) in query).`,
      `Service areas in scope: ${areaRows.length}`,
      "Per-service-area status counts (sorted by lowest total entries first):",
      ...sortedRows.map(summariseRow),
    ].join("\n"),
  };
};
