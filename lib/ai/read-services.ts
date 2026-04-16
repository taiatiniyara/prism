import {
  listAggregatedRuns,
  getAggregatedRunWithOutcomes,
} from "@/app/data-entry/enter-data/services/aggregated-worker/review-service";
import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations, energyResources } from "@/db/schema/utility";
import type { AiUserRole, QueryFilterContext } from "@/lib/ai/types";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";

interface ReadScope {
  userRole: AiUserRole;
  userOrgId?: number | null;
}

interface ServiceResult {
  summary: string;
  metrics: Array<{ label: string; value: string | number }>;
  rows: Record<string, unknown>[];
  warnings?: string[];
}

const isGlobalRole = (role: AiUserRole): boolean => {
  return role === "DEV" || role === "BMO";
};

const toFiniteNumber = (value: string | null): number | null => {
  if (value == null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const renewableRegex =
  /(renewable|solar|hydro|wind|geothermal|biomass|biofuel)/i;

const isRenewableName = (name: string | null | undefined): boolean => {
  return Boolean(name && renewableRegex.test(name));
};

const generationInputRegex =
  /(generation|generated|produce|produced|production|mwh)/i;

const generationOutputUnitRegex = /\b(kwh|mwh|gwh)\b/i;
const nonOutputGenerationRegex =
  /(cost|expense|o\s*&\s*m|\bom\b|apportioned|employee|tariff|revenue|finance|admin)/i;

export const isLikelyGenerationMetric = (
  inputName: string | null | undefined,
  unitName: string | null | undefined,
): boolean => {
  const normalizedInput = inputName?.trim() ?? "";
  if (!generationInputRegex.test(normalizedInput)) {
    return false;
  }

  if (nonOutputGenerationRegex.test(normalizedInput)) {
    return false;
  }

  // Strongly prefer energy-output units for total generation questions.
  if (unitName && generationOutputUnitRegex.test(unitName)) {
    return true;
  }

  // If unit is missing/unknown, keep it as a weak candidate when input label
  // clearly indicates generated energy output.
  return /(energy\s*generated|electricity\s*generated|net\s*generation)/i.test(
    normalizedInput,
  );
};

const assertRunScopeAccess = async (
  reportPeriodId: number,
  readScope: ReadScope,
): Promise<void> => {
  if (isGlobalRole(readScope.userRole)) {
    return;
  }

  if (readScope.userOrgId == null) {
    throw new Error("FORBIDDEN:You are not allowed to access this scope.");
  }

  const [period] = await db
    .select({ utilityId: reportPeriods.utility_id })
    .from(reportPeriods)
    .where(eq(reportPeriods.id, reportPeriodId))
    .limit(1);

  if (!period || period.utilityId !== readScope.userOrgId) {
    throw new Error("FORBIDDEN:You are not allowed to access this scope.");
  }
};

export const getAggregationRunSummary = async (
  context: QueryFilterContext,
  readScope: ReadScope,
): Promise<ServiceResult> => {
  const runs = listAggregatedRuns({
    reportPeriodId: context.reportPeriodId,
    serviceAreaId: context.serviceAreaId,
    energyResourceId: context.energyResourceId,
  });

  if (runs.length === 0) {
    throw new Error(
      "NO_DATA:No aggregation runs were found for the selected scope.",
    );
  }

  const authorizedRuns: typeof runs = [];
  for (const run of runs) {
    await assertRunScopeAccess(run.scope.reportPeriodId, readScope);
    authorizedRuns.push(run);
  }

  const completedRuns = authorizedRuns.filter(
    (run) => run.status === "completed",
  ).length;
  const runningRuns = authorizedRuns.length - completedRuns;

  const totalCalculated = authorizedRuns.reduce(
    (sum, run) => sum + run.calculated,
    0,
  );
  const totalSkipped = authorizedRuns.reduce(
    (sum, run) => sum + run.skipped,
    0,
  );

  return {
    summary: `Found ${authorizedRuns.length} aggregation run(s) for the selected context.`,
    metrics: [
      { label: "Runs", value: authorizedRuns.length },
      { label: "Completed", value: completedRuns },
      { label: "Running", value: runningRuns },
      { label: "Calculated outcomes", value: totalCalculated },
      { label: "Skipped outcomes", value: totalSkipped },
    ],
    rows: authorizedRuns,
  };
};

export const getAggregationRunDetails = async (
  context: QueryFilterContext,
  readScope: ReadScope,
): Promise<ServiceResult> => {
  const runId = context.runId?.trim();
  let run = runId ? getAggregatedRunWithOutcomes(runId) : undefined;

  if (!run) {
    const runs = listAggregatedRuns({
      reportPeriodId: context.reportPeriodId,
      serviceAreaId: context.serviceAreaId,
      energyResourceId: context.energyResourceId,
    });

    for (const candidate of runs) {
      await assertRunScopeAccess(candidate.scope.reportPeriodId, readScope);
      run = getAggregatedRunWithOutcomes(candidate.runId);
      if (run) {
        break;
      }
    }
  }

  if (!run) {
    throw new Error("NO_DATA:No aggregation run details are available.");
  }

  await assertRunScopeAccess(run.scope.reportPeriodId, readScope);

  const calculated = run.outcomes.filter(
    (outcome) => outcome.status === "calculated",
  ).length;
  const skipped = run.outcomes.filter(
    (outcome) => outcome.status === "skipped",
  ).length;

  return {
    summary: `Aggregation run ${run.runId} has ${calculated} calculated and ${skipped} skipped outcomes.`,
    metrics: [
      { label: "Calculated", value: calculated },
      { label: "Skipped", value: skipped },
      { label: "Status", value: run.status },
    ],
    rows: run.outcomes.map((outcome) => ({
      runId: run.runId,
      inputDefId: outcome.inputDefId,
      status: outcome.status,
      reason: outcome.reason ?? null,
      calculatedValue: outcome.calculatedValue ?? null,
    })),
  };
};

export const getAggregationFailureAnalysis = async (
  context: QueryFilterContext,
  readScope: ReadScope,
): Promise<ServiceResult> => {
  const runs = listAggregatedRuns({
    reportPeriodId: context.reportPeriodId,
    serviceAreaId: context.serviceAreaId,
    energyResourceId: context.energyResourceId,
  });

  if (runs.length === 0) {
    throw new Error(
      "NO_DATA:No aggregation runs were found for failure analysis.",
    );
  }

  const reasonCounts = new Map<string, number>();
  let totalSkips = 0;

  for (const run of runs) {
    await assertRunScopeAccess(run.scope.reportPeriodId, readScope);

    const details = getAggregatedRunWithOutcomes(run.runId);
    if (!details) {
      continue;
    }

    for (const outcome of details.outcomes) {
      if (outcome.status !== "skipped") {
        continue;
      }

      totalSkips += 1;
      const reason = outcome.reason ?? "unknown";
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }

  if (totalSkips === 0) {
    return {
      summary:
        "No skipped aggregation outcomes were found for the selected scope.",
      metrics: [
        { label: "Skipped outcomes", value: 0 },
        { label: "Distinct reasons", value: 0 },
      ],
      rows: [],
    };
  }

  const rows = [...reasonCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: Number(((count / totalSkips) * 100).toFixed(2)),
    }));

  return {
    summary: `Detected ${totalSkips} skipped aggregation outcomes across ${rows.length} reason group(s).`,
    metrics: [
      { label: "Skipped outcomes", value: totalSkips },
      { label: "Distinct reasons", value: rows.length },
    ],
    rows,
  };
};

const resolveUtilityId = async (
  context: QueryFilterContext,
  readScope: ReadScope,
): Promise<{ utilityId: number; utilityName: string }> => {
  if (context.utilityId) {
    const [utilityById] = await db
      .select({ id: organisations.id, name: organisations.name })
      .from(organisations)
      .where(eq(organisations.id, context.utilityId))
      .limit(1);

    if (!utilityById) {
      throw new Error("VALIDATION:Provided utilityId does not exist.");
    }

    if (
      !isGlobalRole(readScope.userRole) &&
      readScope.userOrgId != null &&
      utilityById.id !== readScope.userOrgId
    ) {
      throw new Error("FORBIDDEN:You are not allowed to query this utility.");
    }

    return {
      utilityId: utilityById.id,
      utilityName: utilityById.name,
    };
  }

  if (!context.utilityName?.trim()) {
    if (readScope.userOrgId != null) {
      const [utilityByScope] = await db
        .select({ id: organisations.id, name: organisations.name })
        .from(organisations)
        .where(eq(organisations.id, readScope.userOrgId))
        .limit(1);

      if (utilityByScope) {
        return {
          utilityId: utilityByScope.id,
          utilityName: utilityByScope.name,
        };
      }
    }

    throw new Error(
      "VALIDATION:Please mention the utility name for this generation question.",
    );
  }

  const normalized = context.utilityName.trim().toLowerCase();
  const candidates = await db
    .select({
      id: organisations.id,
      name: organisations.name,
      acronym: organisations.acronym,
    })
    .from(organisations)
    .where(eq(organisations.is_active, true));

  const exactMatches = candidates.filter((candidate) => {
    const name = candidate.name.toLowerCase();
    const acronym = candidate.acronym?.toLowerCase() ?? "";

    return name === normalized || acronym === normalized;
  });

  const fuzzyMatches = candidates.filter((candidate) => {
    const name = candidate.name.toLowerCase();
    const acronym = candidate.acronym?.toLowerCase() ?? "";

    if (name === normalized || acronym === normalized) {
      return false;
    }

    // Avoid overly broad matching for short query tokens such as acronyms.
    if (normalized.length < 5) {
      return false;
    }

    return name.includes(normalized) || normalized.includes(name);
  });

  const matches = exactMatches.length > 0 ? exactMatches : fuzzyMatches;

  if (matches.length === 0) {
    throw new Error("NO_DATA:No utility matched the provided utility name.");
  }

  if (matches.length > 1) {
    throw new Error(
      `VALIDATION:Utility name is ambiguous. Matches: ${matches.map((item) => item.name).join(", ")}.`,
    );
  }

  const selected = matches[0];
  if (
    !isGlobalRole(readScope.userRole) &&
    readScope.userOrgId != null &&
    selected.id !== readScope.userOrgId
  ) {
    throw new Error("FORBIDDEN:You are not allowed to query this utility.");
  }

  return {
    utilityId: selected.id,
    utilityName: selected.name,
  };
};

const resolvePeriodWindow = (
  context: QueryFilterContext,
): {
  start: Date;
  end: Date;
  yearLabel: string;
} => {
  if (context.reportPeriodId) {
    return {
      start: new Date("1900-01-01"),
      end: new Date("2999-12-31"),
      yearLabel: "selected period",
    };
  }

  if (!context.year) {
    const currentYear = new Date().getUTCFullYear();
    return {
      start: new Date(`${currentYear}-01-01T00:00:00.000Z`),
      end: new Date(`${currentYear}-12-31T23:59:59.999Z`),
      yearLabel: String(currentYear),
    };
  }

  const start = new Date(`${context.year}-01-01T00:00:00.000Z`);
  const end = new Date(`${context.year}-12-31T23:59:59.999Z`);

  return {
    start,
    end,
    yearLabel: String(context.year),
  };
};

export const getRenewableGenerationByUtilityYear = async (
  context: QueryFilterContext,
  readScope: ReadScope,
): Promise<ServiceResult> => {
  const { utilityId, utilityName } = await resolveUtilityId(context, readScope);
  const periodWindow = resolvePeriodWindow(context);

  const whereConditions = [
    eq(reportPeriods.utility_id, utilityId),
    eq(dataEntries.is_deleted, false),
    eq(inputDefinitions.is_active, true),
    eq(inputDefinitions.is_system_generated, false),
    eq(inputDefinitions.is_aggregated, false),
    isNotNull(dataEntries.value),
    ne(sql`trim(${dataEntries.value})`, ""),
  ];

  if (context.reportPeriodId) {
    whereConditions.push(eq(reportPeriods.id, context.reportPeriodId));
  } else {
    whereConditions.push(
      sql`(
        ${reportPeriods.report_date} between ${periodWindow.start} and ${periodWindow.end}
        or ${reportPeriods.request_date} between ${periodWindow.start} and ${periodWindow.end}
      )`,
    );
  }

  if (context.serviceAreaId) {
    whereConditions.push(
      eq(dataEntries.service_area_id, context.serviceAreaId),
    );
  }

  if (context.energyResourceId) {
    whereConditions.push(
      eq(dataEntries.energy_resource_id, context.energyResourceId),
    );
  }

  const rows = await db
    .select({
      reportPeriodId: reportPeriods.id,
      reportDate: reportPeriods.report_date,
      value: dataEntries.value,
      sourceId: sql<
        number | null
      >`coalesce(${dataEntries.energy_source_id}, ${energyResources.energy_source_id})`,
      typeId: energyResources.energy_type_id,
      inputName: inputDefinitions.name,
      unitId: inputDefinitions.unit_id,
    })
    .from(dataEntries)
    .innerJoin(
      reportPeriods,
      eq(dataEntries.report_period_id, reportPeriods.id),
    )
    .innerJoin(
      inputDefinitions,
      eq(dataEntries.input_def_id, inputDefinitions.id),
    )
    .leftJoin(
      energyResources,
      eq(dataEntries.energy_resource_id, energyResources.id),
    )
    .where(and(...whereConditions));

  const managedListIds = new Set<number>();
  for (const row of rows) {
    if (row.sourceId != null) {
      managedListIds.add(row.sourceId);
    }
    if (row.typeId != null) {
      managedListIds.add(row.typeId);
    }
    if (row.unitId != null) {
      managedListIds.add(row.unitId);
    }
  }

  const managedItems = managedListIds.size
    ? await db
        .select({ id: managedListItems.id, name: managedListItems.name })
        .from(managedListItems)
        .where(inArray(managedListItems.id, [...managedListIds]))
    : [];
  const managedItemNames = new Map(
    managedItems.map((item) => [item.id, item.name]),
  );

  const candidateGenerationRows = rows.filter((row) => {
    const unitName =
      row.unitId != null ? managedItemNames.get(row.unitId) : undefined;
    return isLikelyGenerationMetric(row.inputName, unitName);
  });

  const generationRows = candidateGenerationRows.filter((row) => {
    const sourceName =
      row.sourceId != null ? managedItemNames.get(row.sourceId) : undefined;
    const typeName =
      row.typeId != null ? managedItemNames.get(row.typeId) : undefined;

    const sourceRenewable = isRenewableName(sourceName);
    const typeRenewable = isRenewableName(typeName);

    const mode = context.renewableDefinition ?? "either";
    if (mode === "energy-source") {
      return sourceRenewable;
    }

    if (mode === "energy-type") {
      return typeRenewable;
    }

    return sourceRenewable || typeRenewable;
  });

  const hasRenewableMetadataGap =
    generationRows.length === 0 && candidateGenerationRows.length > 0;

  const finalRows = hasRenewableMetadataGap
    ? candidateGenerationRows
    : generationRows;

  if (finalRows.length === 0) {
    throw new Error(
      "NO_DATA:No renewable generation data was found for the selected context.",
    );
  }

  const numericRows = finalRows
    .map((row) => ({
      ...row,
      unitName:
        row.unitId != null
          ? (managedItemNames.get(row.unitId) ?? "Unknown")
          : "Unknown",
      numericValue: toFiniteNumber(row.value),
    }))
    .filter((row) => row.numericValue != null) as Array<
    (typeof generationRows)[number] & { numericValue: number; unitName: string }
  >;

  if (numericRows.length === 0) {
    throw new Error(
      "NO_DATA:Renewable generation rows exist but contain no numeric values.",
    );
  }

  const total = numericRows.reduce((sum, row) => sum + row.numericValue, 0);
  const unitSet = new Set(numericRows.map((row) => row.unitName ?? "Unknown"));
  const units = [...unitSet];
  const preferredUnit = units.length === 1 ? units[0] : "Mixed units";

  const byPeriod = new Map<string, number>();
  for (const row of numericRows) {
    const periodLabel = row.reportDate.toISOString().slice(0, 7);
    byPeriod.set(
      periodLabel,
      (byPeriod.get(periodLabel) ?? 0) + row.numericValue,
    );
  }

  const rowsByPeriod = [...byPeriod.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([period, value]) => ({
      period,
      generatedValue: Number(value.toFixed(4)),
    }));

  const warnings: string[] = [];
  if (units.length > 1) {
    warnings.push("Multiple units were detected; totals combine mixed units.");
  }
  if (hasRenewableMetadataGap) {
    warnings.push(
      "Renewable source/type metadata was incomplete; generation values were used as a fallback.",
    );
  }

  const periodDescriptor = context.reportPeriodId
    ? `report period ${context.reportPeriodId}`
    : periodWindow.yearLabel;

  return {
    summary: `Total renewable generation for ${utilityName} in ${periodDescriptor} is ${Number(total.toFixed(4))} ${preferredUnit}.`,
    metrics: [
      { label: "Total generated", value: Number(total.toFixed(4)) },
      { label: "Unit", value: preferredUnit },
      { label: "Periods matched", value: rowsByPeriod.length },
      {
        label: "Renewable definition",
        value: context.renewableDefinition ?? "either",
      },
    ],
    rows: rowsByPeriod,
    warnings: warnings.length ? warnings : undefined,
  };
};
