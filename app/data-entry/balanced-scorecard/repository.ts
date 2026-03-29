import type {
  ScorecardFilterContext,
  ScorecardInputRow,
  ScorecardKpiOption,
  ScorecardUpdatePayload,
} from "@/app/data-entry/balanced-scorecard/types";
import { db } from "@/db/connection";
import { bsc, kpi, kpiDefinitions } from "@/db/schema/kpi";
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { and, eq } from "drizzle-orm";

type KpiTargetRecord = {
  year: number;
  month?: number;
  target_value: string;
};

const MONTHLY_TYPE_PATTERN = /month/i;
const FY_TYPE_PATTERN = /(financial|fiscal|fy|annual|year)/i;

const perspectiveLabel = (value: number | null): string => {
  switch (value) {
    case 1:
      return "Financial";
    case 2:
      return "Customer";
    case 3:
      return "Operation";
    case 4:
      return "Development";
    default:
      return "Unassigned";
  }
};

const parseMetric = (value: string | null): number | null => {
  if (value == null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
};

const inferStatus = (actual: number | null, target: number | null): string => {
  if (actual == null || target == null || target === 0) {
    return "off_track";
  }

  const ratio = actual / target;
  if (ratio >= 1) {
    return "on_track";
  }
  if (ratio >= 0.8) {
    return "at_risk";
  }
  return "off_track";
};

export const listScorecardInputRows = async (
  context: ScorecardFilterContext,
): Promise<ScorecardInputRow[]> => {
  const predicates = [eq(kpi.report_period_id, context.reportPeriodId)];

  if (context.reportTypeId != null) {
    predicates.push(eq(reportPeriods.report_type_id, context.reportTypeId));
  }

  if (context.kpiCategoryId != null) {
    predicates.push(eq(kpiDefinitions.category_id, context.kpiCategoryId));
  }

  if (context.kpiSubcategoryId != null) {
    predicates.push(
      eq(kpiDefinitions.subcategory_id, context.kpiSubcategoryId),
    );
  }

  const rows = await db
    .select({
      kpiId: kpi.id,
      kpiDefinitionId: kpi.kpi_def_id,
      perspectiveLevel: bsc.perspective_level,
      targetValue: kpi.target_value,
      actualValue: kpi.actual_value,
      calculatedAt: kpi.calculated_at,
    })
    .from(kpi)
    .innerJoin(kpiDefinitions, eq(kpi.kpi_def_id, kpiDefinitions.id))
    .innerJoin(reportPeriods, eq(kpi.report_period_id, reportPeriods.id))
    .leftJoin(
      bsc,
      and(eq(kpi.id, bsc.kpi_id), eq(bsc.utility_id, reportPeriods.utility_id)),
    )
    .where(and(...predicates));

  return rows.map((row) => {
    const actualValue = parseMetric(row.actualValue);
    const targetValue = parseMetric(row.targetValue);

    return {
      kpiId: row.kpiId,
      kpiDefinitionId: row.kpiDefinitionId,
      perspectiveLevel: row.perspectiveLevel ?? 4,
      perspectiveLabel: perspectiveLabel(row.perspectiveLevel),
      perspectiveWeight: 1,
      kpiWeight: 1,
      actualValue,
      targetValue,
      status: inferStatus(actualValue, targetValue),
      approvalStateId: 5,
      updatedAt: row.calculatedAt,
      filterScopeKey: `period:${context.reportPeriodId}`,
    } satisfies ScorecardInputRow;
  });
};

export const listScorecardKpiOptions = async (
  context: ScorecardFilterContext,
): Promise<ScorecardKpiOption[]> => {
  const predicates = [eq(kpiDefinitions.is_active, true)];

  if (context.kpiCategoryId != null) {
    predicates.push(eq(kpiDefinitions.category_id, context.kpiCategoryId));
  }

  if (context.kpiSubcategoryId != null) {
    predicates.push(
      eq(kpiDefinitions.subcategory_id, context.kpiSubcategoryId),
    );
  }

  const rows = await db
    .select({
      kpiDefinitionId: kpiDefinitions.id,
      kpiName: kpiDefinitions.name,
      kpiId: kpi.id,
      reportPeriodId: reportPeriods.id,
    })
    .from(kpiDefinitions)
    .leftJoin(
      kpi,
      and(
        eq(kpi.kpi_def_id, kpiDefinitions.id),
        eq(kpi.report_period_id, context.reportPeriodId),
      ),
    )
    .innerJoin(reportPeriods, eq(reportPeriods.id, context.reportPeriodId))
    .where(and(...predicates));

  return rows
    .map((row) => ({
      kpiId: row.kpiId,
      kpiDefinitionId: row.kpiDefinitionId,
      reportPeriodId: row.reportPeriodId,
      kpiName: row.kpiName,
    }))
    .sort((a, b) => a.kpiName.localeCompare(b.kpiName));
};

const normalizeTargetRows = (value: unknown): KpiTargetRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is KpiTargetRecord =>
        typeof item === "object" &&
        item != null &&
        Number.isInteger((item as KpiTargetRecord).year) &&
        (typeof (item as KpiTargetRecord).month === "undefined" ||
          Number.isInteger((item as KpiTargetRecord).month)) &&
        typeof (item as KpiTargetRecord).target_value === "string",
    )
    .map((item) => ({
      year: item.year,
      month: item.month,
      target_value: item.target_value,
    }));
};

export const upsertScorecardConfiguration = async (
  utilityId: number,
  updatedById: string | null,
  payload: ScorecardUpdatePayload,
) => {
  const reportPeriodCandidates = await db
    .select({
      id: reportPeriods.id,
      reportDate: reportPeriods.report_date,
      reportTypeName: managedListItems.name,
    })
    .from(reportPeriods)
    .innerJoin(
      managedListItems,
      eq(reportPeriods.report_type_id, managedListItems.id),
    )
    .where(eq(reportPeriods.utility_id, utilityId));

  const yearMatches = reportPeriodCandidates.filter((row) => {
    const date = new Date(row.reportDate);
    return date.getFullYear() === payload.target.year;
  });

  const resolvedPeriod = (() => {
    if (payload.target.month != null) {
      const monthlyMatches = yearMatches.filter((row) => {
        const date = new Date(row.reportDate);
        return date.getMonth() + 1 === payload.target.month;
      });

      if (monthlyMatches.length === 0) {
        return null;
      }

      const monthlyTypeMatches = monthlyMatches.filter((row) =>
        MONTHLY_TYPE_PATTERN.test(row.reportTypeName ?? ""),
      );

      return monthlyTypeMatches[0] ?? monthlyMatches[0];
    }

    const fyMatches = yearMatches.filter((row) =>
      FY_TYPE_PATTERN.test(row.reportTypeName ?? ""),
    );

    if (fyMatches.length > 0) {
      return fyMatches.sort(
        (a, b) =>
          new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime(),
      )[0];
    }

    if (yearMatches.length === 1) {
      return yearMatches[0];
    }

    return null;
  })();

  if (!resolvedPeriod) {
    throw new Error(
      "VALIDATION:Unable to resolve report period from target year/month.",
    );
  }

  const resolvedReportPeriodId = resolvedPeriod.id;

  const kpiLookupPredicate =
    payload.kpiId != null
      ? eq(kpi.id, payload.kpiId)
      : and(
          eq(kpi.report_period_id, resolvedReportPeriodId),
          eq(kpi.kpi_def_id, payload.kpiDefinitionId),
        );

  const [existingKpi] = await db
    .select({ id: kpi.id })
    .from(kpi)
    .where(kpiLookupPredicate)
    .limit(1);

  let resolvedKpiId = existingKpi?.id ?? null;
  if (resolvedKpiId == null) {
    const [createdKpi] = await db
      .insert(kpi)
      .values({
        report_period_id: resolvedReportPeriodId,
        kpi_def_id: payload.kpiDefinitionId,
        target_value: payload.target.targetValue,
        actual_value: "0",
      })
      .returning({ id: kpi.id });

    if (!createdKpi) {
      throw new Error("VALIDATION:Unable to create KPI record.");
    }
    resolvedKpiId = createdKpi.id;
  }

  const [existingBsc] = await db
    .select({
      id: bsc.id,
      targets: bsc.targets,
    })
    .from(bsc)
    .where(and(eq(bsc.kpi_id, resolvedKpiId), eq(bsc.utility_id, utilityId)))
    .limit(1);

  const normalizedTargets = normalizeTargetRows(existingBsc?.targets);
  const updatedTargets = normalizedTargets.filter(
    (item) =>
      !(
        item.year === payload.target.year &&
        (item.month ?? null) === (payload.target.month ?? null)
      ),
  );

  updatedTargets.push({
    year: payload.target.year,
    month: payload.target.month ?? undefined,
    target_value: payload.target.targetValue,
  });

  if (existingBsc) {
    await db
      .update(bsc)
      .set({
        utility_id: utilityId,
        perspective_level: payload.perspectiveLevel,
        objective: payload.objective,
        targets: updatedTargets,
        updated_by_id: updatedById,
        updated_at: new Date(),
      })
      .where(eq(bsc.id, existingBsc.id));
  } else {
    await db.insert(bsc).values({
      utility_id: utilityId,
      kpi_id: resolvedKpiId,
      perspective_level: payload.perspectiveLevel,
      objective: payload.objective,
      targets: updatedTargets,
      relationships: [],
      updated_by_id: updatedById,
      updated_at: new Date(),
    });
  }

  await db
    .update(kpi)
    .set({
      target_value: payload.target.targetValue,
      updated_at: new Date(),
    })
    .where(eq(kpi.id, resolvedKpiId));

  const reportDate = new Date(resolvedPeriod.reportDate);
  return {
    kpiId: resolvedKpiId,
    reportPeriodId: resolvedReportPeriodId,
    perspectiveLevel: payload.perspectiveLevel,
    objective: payload.objective,
    target: payload.target,
    reportDate: reportDate.toISOString(),
  };
};
