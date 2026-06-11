import type {
  ScorecardDraftInitiativeInput,
  ScorecardDraftKpiInput,
  ScorecardDraftObjectiveInput,
  ScorecardDraftSavePayload,
  ScorecardFilterContext,
  ScorecardInputRow,
  ScorecardKpiOption,
  ScorecardSavedDraftPerspective,
  ScorecardSavedBuild,
  ScorecardRelationshipsUpdatePayload,
  ScorecardRelationship,
  ScorecardUpdatePayload,
} from "@/app/data-entry/balanced-scorecard/types";
import { db } from "@/db/connection";
import {
  bsc,
  kpi,
  kpiDefinitions,
  PerspectiveLevel,
  type BscNodeRef,
  type BscRelationship,
  type Perspective,
} from "@/db/schema/kpi";
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getCurrentUser, hasGlobalUtilityAccess } from "@/lib/user.service";

const MONTHLY_TYPE_PATTERN = /month/i;
const FY_TYPE_PATTERN = /(financial|fiscal|fy|annual|year)/i;

const isGlobalKpiViewer = (user: {
  role: string | null;
  is_utility_context_scoped?: boolean;
}): boolean => hasGlobalUtilityAccess(user);

type HierarchyAssignment = {
  perspectiveLevel: number;
  perspectiveLabel: string;
  strategicObjective: string;
  keyInitiative: string;
  targetValue: string | null;
  trackingFrequency: "monthly" | "annually" | null;
};

const perspectiveLabel = (value: number | null): string => {
  switch (value) {
    case PerspectiveLevel.Financial:
      return "Financial";
    case PerspectiveLevel.Customer:
      return "Customer";
    case PerspectiveLevel.Operation:
      return "Operations";
    case PerspectiveLevel.Development:
      return "Development";
    default:
      return "Unassigned";
  }
};

const buildDraftKpiKey = (input: {
  kpiDefinitionId?: number | null;
  pendingCustomKpiRequestId?: string | null;
  trackingFrequency: "monthly" | "annually";
}): string => {
  if (
    Number.isInteger(input.kpiDefinitionId) &&
    (input.kpiDefinitionId ?? 0) > 0
  ) {
    return `${input.kpiDefinitionId}|${input.trackingFrequency}`;
  }

  const pendingId = input.pendingCustomKpiRequestId?.trim();
  if (pendingId) {
    return `pending:${pendingId}|${input.trackingFrequency}`;
  }

  return `pending:unknown|${input.trackingFrequency}`;
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

const normalize = (value: string): string => value.trim().toLowerCase();

const isPerspectiveLevel = (value: unknown): value is 1 | 2 | 3 | 4 =>
  value === 1 || value === 2 || value === 3 || value === 4;

const toDbNodeRef = (
  ref: ScorecardRelationship["source"] | ScorecardRelationship["target"],
): BscNodeRef => ({
  level: ref.level,
  perspective_level: ref.perspectiveLevel,
  objective_description: ref.objectiveDescription,
  key_initiative_description: ref.keyInitiativeDescription,
  kpi_id: ref.kpiId,
});

const toDbRelationship = (
  relationship: ScorecardRelationship,
): BscRelationship => ({
  id: relationship.id,
  source: toDbNodeRef(relationship.source),
  target: toDbNodeRef(relationship.target),
  relationship_type: relationship.relationshipType,
  weight: relationship.weight,
  note: relationship.note,
});

const toScorecardRelationship = (
  value: BscRelationship,
): ScorecardRelationship | null => {
  if (
    typeof value !== "object" ||
    value == null ||
    typeof value.id !== "string" ||
    typeof value.relationship_type !== "string"
  ) {
    return null;
  }

  const source = value.source;
  const target = value.target;

  if (
    source == null ||
    target == null ||
    !isPerspectiveLevel(source.perspective_level) ||
    !isPerspectiveLevel(target.perspective_level)
  ) {
    return null;
  }

  if (
    value.relationship_type !== "influences" &&
    value.relationship_type !== "depends_on" &&
    value.relationship_type !== "contributes_to" &&
    value.relationship_type !== "blocks"
  ) {
    return null;
  }

  return {
    id: value.id,
    source: {
      level: source.level,
      perspectiveLevel: source.perspective_level,
      objectiveDescription: source.objective_description,
      keyInitiativeDescription: source.key_initiative_description,
      kpiId: source.kpi_id,
    },
    target: {
      level: target.level,
      perspectiveLevel: target.perspective_level,
      objectiveDescription: target.objective_description,
      keyInitiativeDescription: target.key_initiative_description,
      kpiId: target.kpi_id,
    },
    relationshipType: value.relationship_type,
    weight: value.weight,
    note: value.note,
  };
};

const toDefaultPerspective = (
  level: PerspectiveLevel,
  description: string,
): Perspective => ({
  perspective_level: level,
  description,
  strategic_objective: [],
});

const flattenHierarchy = (
  perspective: Perspective,
): Map<number, HierarchyAssignment> => {
  const assignments = new Map<number, HierarchyAssignment>();

  for (const objective of perspective.strategic_objective ?? []) {
    for (const initiative of objective.key_initiatives ?? []) {
      for (const linkedKpi of initiative.kpis ?? []) {
        const kpiId = linkedKpi.kpi_id;
        if (
          typeof kpiId !== "number" ||
          !Number.isInteger(kpiId) ||
          kpiId <= 0
        ) {
          continue;
        }

        if (assignments.has(kpiId)) {
          continue;
        }

        assignments.set(kpiId, {
          perspectiveLevel: perspective.perspective_level,
          perspectiveLabel: perspectiveLabel(perspective.perspective_level),
          strategicObjective: objective.description,
          keyInitiative: initiative.description,
          targetValue:
            linkedKpi.targets
              ?.slice()
              .sort(
                (a, b) => b.year - a.year || (b.month ?? 0) - (a.month ?? 0),
              )
              .find((target) => target.value.trim().length > 0)?.value ?? null,
          trackingFrequency:
            linkedKpi.tracking_frequency === "annually"
              ? "annually"
              : "monthly",
        });
      }
    }
  }

  return assignments;
};

export const listScorecardInputRows = async (
  context: ScorecardFilterContext,
  userOrgId?: number | null,
  options?: { includeAllDefinitions?: boolean },
): Promise<ScorecardInputRow[]> => {
  const includeAllDefs = options?.includeAllDefinitions === true;
  const predicates = [];

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

  if (userOrgId != null) {
    predicates.push(eq(reportPeriods.utility_id, userOrgId));
  }

  let rows;

  if (includeAllDefs) {
    const allDefsPredicates = [
      eq(kpiDefinitions.is_active, true),
      ...predicates,
    ];
    rows = await db
      .select({
        kpiId: kpi.id,
        kpiDefinitionId: kpiDefinitions.id,
        kpiName: kpiDefinitions.name,
        targetValue: kpi.target_value,
        actualValue: kpi.actual_value,
        calculatedAt: kpi.calculated_at,
        utilityId: reportPeriods.utility_id,
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
      .where(and(...allDefsPredicates));
  } else {
    rows = await db
      .select({
        kpiId: kpi.id,
        kpiDefinitionId: kpi.kpi_def_id,
        kpiName: kpiDefinitions.name,
        targetValue: kpi.target_value,
        actualValue: kpi.actual_value,
        calculatedAt: kpi.calculated_at,
        utilityId: reportPeriods.utility_id,
      })
      .from(kpi)
      .innerJoin(kpiDefinitions, eq(kpi.kpi_def_id, kpiDefinitions.id))
      .innerJoin(reportPeriods, eq(kpi.report_period_id, reportPeriods.id))
      .where(and(...predicates));
  }

  const utilityIds = Array.from(new Set(rows.map((row) => row.utilityId)));
  const hierarchyByUtility = new Map<
    number,
    Map<number, HierarchyAssignment>
  >();

  if (utilityIds.length > 0) {
    const bscRows = await db
      .select({
        utilityId: bsc.utility_id,
        perspective: bsc.perspective,
      })
      .from(bsc)
      .where(
        utilityIds.length === 1
          ? eq(bsc.utility_id, utilityIds[0])
          : inArray(bsc.utility_id, utilityIds),
      )
      .orderBy(desc(bsc.updated_at));

    for (const row of bscRows) {
      if (row.perspective == null) {
        continue;
      }

      const existingAssignments =
        hierarchyByUtility.get(row.utilityId) ??
        new Map<number, HierarchyAssignment>();
      const perspectiveAssignments = flattenHierarchy(row.perspective);

      for (const [kpiDefinitionId, assignment] of perspectiveAssignments) {
        if (!existingAssignments.has(kpiDefinitionId)) {
          existingAssignments.set(kpiDefinitionId, assignment);
        }
      }

      hierarchyByUtility.set(row.utilityId, existingAssignments);
    }
  }

  return rows.map((row) => {
    const assignment = hierarchyByUtility
      .get(row.utilityId)
      ?.get(row.kpiDefinitionId);

    const actualValue = parseMetric(row.actualValue);
    const targetValue = parseMetric(
      row.targetValue ?? assignment?.targetValue ?? null,
    );

    return {
      kpiId: row.kpiId ?? `kpi-def-${row.kpiDefinitionId}`,
      kpiDefinitionId: row.kpiDefinitionId,
      kpiName: row.kpiName,
      objective: assignment?.strategicObjective ?? null,
      keyInitiative: assignment?.keyInitiative ?? null,
      trackingFrequency: assignment?.trackingFrequency ?? null,
      perspectiveLevel:
        assignment?.perspectiveLevel ?? PerspectiveLevel.Development,
      perspectiveLabel:
        assignment?.perspectiveLabel ??
        perspectiveLabel(PerspectiveLevel.Development),
      perspectiveWeight: 1,
      kpiWeight: 1,
      actualValue,
      targetValue,
      status: inferStatus(actualValue, targetValue),
      approvalStateId: 5,
      updatedAt: row.calculatedAt ?? new Date(),
      filterScopeKey:
        context.reportPeriodId > 0
          ? `period:${context.reportPeriodId}`
          : "period:all",
    } satisfies ScorecardInputRow;
  });
};

export const listScorecardKpiOptions = async (
  context: ScorecardFilterContext,
): Promise<ScorecardKpiOption[]> => {
  const currentUser = await getCurrentUser();
  const currentUserUtilityId =
    (
      currentUser as {
        utilityId?: number | null;
        utility_id?: number | null;
      }
    ).utilityId ??
    (
      currentUser as {
        utilityId?: number | null;
        utility_id?: number | null;
      }
    ).utility_id ??
    null;
  const predicates = [eq(kpiDefinitions.is_active, true)];

  if (!isGlobalKpiViewer(currentUser)) {
    const visibilityPredicate =
      currentUserUtilityId == null
        ? eq(kpiDefinitions.is_private, false)
        : or(
            eq(kpiDefinitions.is_private, false),
            eq(kpiDefinitions.owner_utility_id, currentUserUtilityId),
          );

    if (visibilityPredicate) {
      predicates.push(visibilityPredicate);
    }
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
      kpiDefinitionId: kpiDefinitions.id,
      kpiName: kpiDefinitions.name,
      categoryId: kpiDefinitions.category_id,
      subcategoryId: kpiDefinitions.subcategory_id,
      kpiId: kpi.id,
      targetValue: kpi.target_value,
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
      categoryId: row.categoryId,
      subcategoryId: row.subcategoryId,
      targetValue: row.targetValue,
    }))
    .sort((a, b) => a.kpiName.localeCompare(b.kpiName));
};

export const listScorecardRelationships = async (
  context: ScorecardFilterContext,
): Promise<ScorecardRelationship[]> => {
  if (context.reportPeriodId <= 0) {
    const rows = await db
      .select({ relationships: bsc.relationships })
      .from(bsc)
      .orderBy(desc(bsc.updated_at));

    const relationshipById = new Map<string, ScorecardRelationship>();
    for (const row of rows) {
      for (const relationship of row.relationships ?? []) {
        const parsed = toScorecardRelationship(relationship);
        if (parsed == null || relationshipById.has(parsed.id)) {
          continue;
        }

        relationshipById.set(parsed.id, parsed);
      }
    }

    return [...relationshipById.values()];
  }

  const [period] = await db
    .select({ utilityId: reportPeriods.utility_id })
    .from(reportPeriods)
    .where(eq(reportPeriods.id, context.reportPeriodId))
    .limit(1);

  if (period == null) {
    return [];
  }

  const rows = await db
    .select({ relationships: bsc.relationships })
    .from(bsc)
    .where(eq(bsc.utility_id, period.utilityId))
    .orderBy(desc(bsc.updated_at));

  const relationshipById = new Map<string, ScorecardRelationship>();
  for (const row of rows) {
    for (const relationship of row.relationships ?? []) {
      const parsed = toScorecardRelationship(relationship);
      if (parsed == null || relationshipById.has(parsed.id)) {
        continue;
      }

      relationshipById.set(parsed.id, parsed);
    }
  }

  return [...relationshipById.values()];
};

export const listScorecardDrafts = async (
  utilityId: number,
): Promise<ScorecardSavedBuild[]> => {
  const rows = await db
    .select({
      id: bsc.id,
      perspective: bsc.perspective,
      updatedAt: bsc.updated_at,
    })
    .from(bsc)
    .where(eq(bsc.utility_id, utilityId))
    .orderBy(desc(bsc.updated_at));

  return rows
    .filter((row) => row.perspective != null)
    .map((row) => {
      const perspective = row.perspective!;
      const objectives = perspective.strategic_objective ?? [];
      const objectiveNames = objectives
        .map((objective) => objective.description.trim())
        .filter((description) => description.length > 0);
      const initiativeCount = objectives.reduce(
        (sum, objective) => sum + (objective.key_initiatives?.length ?? 0),
        0,
      );
      const kpiCount = objectives.reduce(
        (sum, objective) =>
          sum +
          (objective.key_initiatives ?? []).reduce(
            (initiativeSum, initiative) =>
              initiativeSum + (initiative.kpis?.length ?? 0),
            0,
          ),
        0,
      );

      return {
        id: row.id,
        perspectiveLevel: perspective.perspective_level,
        perspectiveDescription:
          perspective.description ||
          perspectiveLabel(perspective.perspective_level),
        objectiveCount: objectives.length,
        initiativeCount,
        kpiCount,
        objectiveNames,
        updatedAt: row.updatedAt.toISOString(),
      } satisfies ScorecardSavedBuild;
    });
};

export const listScorecardDraftHierarchies = async (
  utilityId: number,
): Promise<ScorecardSavedDraftPerspective[]> => {
  const rows = await db
    .select({
      perspective: bsc.perspective,
      updatedAt: bsc.updated_at,
    })
    .from(bsc)
    .where(eq(bsc.utility_id, utilityId))
    .orderBy(desc(bsc.updated_at));

  const latestByPerspective = new Map<
    1 | 2 | 3 | 4,
    ScorecardSavedDraftPerspective
  >();

  for (const row of rows) {
    if (row.perspective == null) {
      continue;
    }

    const perspective = row.perspective;
    if (!isPerspectiveLevel(perspective.perspective_level)) {
      continue;
    }

    const level = perspective.perspective_level;
    if (latestByPerspective.has(level)) {
      continue;
    }

    const objectives: ScorecardDraftObjectiveInput[] = (
      perspective.strategic_objective ?? []
    )
      .map((objective) => {
        const keyInitiatives: ScorecardDraftInitiativeInput[] = (
          objective.key_initiatives ?? []
        )
          .map((initiative) => {
            const kpis = (initiative.kpis ?? [])
              .map((kpiEntry): ScorecardDraftKpiInput | null => {
                const pendingCustomKpi = kpiEntry.pending_custom_kpi;
                const hasLinkedDefinition =
                  Number.isInteger(kpiEntry.kpi_id) &&
                  (kpiEntry.kpi_id ?? 0) > 0;

                if (
                  !hasLinkedDefinition &&
                  (!pendingCustomKpi || !pendingCustomKpi.request_id)
                ) {
                  return null;
                }

                return {
                  kpiDefinitionId: hasLinkedDefinition
                    ? (kpiEntry.kpi_id ?? null)
                    : null,
                  trackingFrequency:
                    kpiEntry.tracking_frequency === "annually"
                      ? "annually"
                      : "monthly",
                  pendingCustomKpiRequestId:
                    pendingCustomKpi?.request_id ?? null,
                  pendingCustomKpiTitle: pendingCustomKpi?.title ?? null,
                  pendingCustomKpiStatus:
                    pendingCustomKpi?.status ?? "PENDING_REVIEW",
                  approvedKpiDefinitionId:
                    pendingCustomKpi?.approved_kpi_definition_id ?? null,
                };
              })
              .filter(
                (kpiEntry): kpiEntry is ScorecardDraftKpiInput =>
                  kpiEntry != null,
              );

            return {
              description: initiative.description,
              kpis,
            };
          })
          .filter(
            (initiative) =>
              initiative.description.trim().length > 0 &&
              initiative.kpis.length > 0,
          );

        return {
          description: objective.description,
          keyInitiatives,
        };
      })
      .filter(
        (objective) =>
          objective.description.trim().length > 0 &&
          objective.keyInitiatives.length > 0,
      );

    latestByPerspective.set(level, {
      perspectiveLevel: level,
      perspectiveDescription:
        perspective.description ||
        perspectiveLabel(perspective.perspective_level),
      objectives,
    });
  }

  return [1, 2, 3, 4]
    .map((level) => latestByPerspective.get(level as 1 | 2 | 3 | 4) ?? null)
    .filter((entry): entry is ScorecardSavedDraftPerspective => entry != null);
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

  const resolvedPeriod = (() => {
    if (payload.reportPeriodId != null) {
      return (
        reportPeriodCandidates.find(
          (row) => row.id === payload.reportPeriodId,
        ) ?? null
      );
    }

    const targetYear = payload.target.year;
    if (targetYear == null) {
      return null;
    }

    const yearMatches = reportPeriodCandidates.filter((row) => {
      const date = new Date(row.reportDate);
      return date.getFullYear() === targetYear;
    });

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

    if (fyMatches.length > 1) {
      throw new Error(
        "VALIDATION:Multiple financial-year periods found for target year. Provide month to select a monthly period.",
      );
    }

    if (fyMatches.length === 1) {
      return fyMatches[0];
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

  const existingBscRows = await db
    .select({
      id: bsc.id,
      perspective: bsc.perspective,
      relationships: bsc.relationships,
    })
    .from(bsc)
    .where(eq(bsc.utility_id, utilityId))
    .orderBy(desc(bsc.updated_at));

  const existingBsc =
    existingBscRows.find(
      (row) => row.perspective?.perspective_level === payload.perspectiveLevel,
    ) ?? null;

  const resolvedPerspectiveDescription =
    payload.perspectiveDescription.trim() ||
    existingBsc?.perspective?.description?.trim() ||
    perspectiveLabel(payload.perspectiveLevel);

  const currentPerspective =
    existingBsc?.perspective?.perspective_level === payload.perspectiveLevel
      ? existingBsc.perspective
      : toDefaultPerspective(
          payload.perspectiveLevel,
          resolvedPerspectiveDescription,
        );

  const nextPerspective: Perspective = {
    ...currentPerspective,
    perspective_level: payload.perspectiveLevel,
    description: resolvedPerspectiveDescription,
    strategic_objective: [...(currentPerspective.strategic_objective ?? [])],
  };

  const objectiveKey = normalize(payload.strategicObjective);
  let objective = nextPerspective.strategic_objective.find(
    (item) => normalize(item.description) === objectiveKey,
  );

  if (!objective) {
    objective = {
      description: payload.strategicObjective,
      key_initiatives: [],
    };
    nextPerspective.strategic_objective.push(objective);
  }

  const initiativeKey = normalize(payload.keyInitiative);
  let initiative = objective.key_initiatives.find(
    (item) => normalize(item.description) === initiativeKey,
  );

  if (!initiative) {
    initiative = {
      description: payload.keyInitiative,
      kpis: [],
    };
    objective.key_initiatives.push(initiative);
  }

  const reportDate = new Date(resolvedPeriod.reportDate);
  const resolvedYear = payload.target.year ?? reportDate.getFullYear();
  const resolvedMonth =
    payload.trackingFrequency === "monthly"
      ? (payload.target.month ?? reportDate.getMonth() + 1)
      : null;

  if (
    !Number.isInteger(resolvedYear) ||
    resolvedYear < 1900 ||
    resolvedYear > 3000
  ) {
    throw new Error("VALIDATION:Unable to resolve target year.");
  }

  if (
    resolvedMonth != null &&
    (!Number.isInteger(resolvedMonth) ||
      resolvedMonth < 1 ||
      resolvedMonth > 12)
  ) {
    throw new Error("VALIDATION:Unable to resolve target month.");
  }

  if (!initiative) {
    throw new Error("VALIDATION:Unable to resolve key initiative.");
  }

  const ensuredInitiative = initiative;

  const existingLinkedKpi = ensuredInitiative.kpis.find(
    (item) =>
      item.kpi_id === payload.kpiDefinitionId &&
      item.tracking_frequency === payload.trackingFrequency,
  );

  const normalizedTargetValue = payload.target.targetValue.trim();

  if (existingLinkedKpi) {
    const existingTarget = (existingLinkedKpi.targets ?? []).find(
      (target) =>
        target.year === resolvedYear &&
        (target.month ?? null) === resolvedMonth,
    );

    if (existingTarget) {
      existingTarget.value = normalizedTargetValue;
    } else {
      existingLinkedKpi.targets = [
        ...(existingLinkedKpi.targets ?? []),
        {
          year: resolvedYear,
          month: resolvedMonth,
          value: normalizedTargetValue,
        },
      ];
    }
  } else {
    ensuredInitiative.kpis.push({
      kpi_id: payload.kpiDefinitionId,
      tracking_frequency: payload.trackingFrequency,
      targets: [
        {
          year: resolvedYear,
          month: resolvedMonth,
          value: normalizedTargetValue,
        },
      ],
    });
  }

  if (existingBsc) {
    await db
      .update(bsc)
      .set({
        utility_id: utilityId,
        perspective: nextPerspective,
        relationships:
          payload.relationships?.map(toDbRelationship) ??
          existingBsc.relationships ??
          [],
        updated_by_id: updatedById,
        updated_at: new Date(),
      })
      .where(eq(bsc.id, existingBsc.id));
  } else {
    await db.insert(bsc).values({
      utility_id: utilityId,
      perspective: nextPerspective,
      relationships: payload.relationships?.map(toDbRelationship) ?? [],
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

  return {
    kpiId: resolvedKpiId,
    reportPeriodId: resolvedReportPeriodId,
    perspectiveLevel: payload.perspectiveLevel,
    perspectiveDescription: resolvedPerspectiveDescription,
    strategicObjective: payload.strategicObjective,
    keyInitiative: payload.keyInitiative,
    trackingFrequency: payload.trackingFrequency,
    target: payload.target,
    reportDate: reportDate.toISOString(),
  };
};

export const upsertScorecardRelationships = async (
  utilityId: number,
  updatedById: string | null,
  payload: ScorecardRelationshipsUpdatePayload,
) => {
  const existingBscRows = await db
    .select({
      id: bsc.id,
      perspective: bsc.perspective,
    })
    .from(bsc)
    .where(eq(bsc.utility_id, utilityId))
    .orderBy(desc(bsc.updated_at));

  const nextRelationships = payload.relationships.map(toDbRelationship);

  if (existingBscRows.length === 0) {
    await db.insert(bsc).values({
      utility_id: utilityId,
      perspective: toDefaultPerspective(
        PerspectiveLevel.Development,
        perspectiveLabel(PerspectiveLevel.Development),
      ),
      relationships: nextRelationships,
      updated_by_id: updatedById,
      updated_at: new Date(),
    });

    return {
      reportPeriodId: payload.reportPeriodId,
      relationships: payload.relationships,
    };
  }

  for (const row of existingBscRows) {
    await db
      .update(bsc)
      .set({
        relationships: nextRelationships,
        updated_by_id: updatedById,
        updated_at: new Date(),
      })
      .where(eq(bsc.id, row.id));
  }

  return {
    reportPeriodId: payload.reportPeriodId,
    relationships: payload.relationships,
  };
};

export const upsertScorecardDraft = async (
  utilityId: number,
  updatedById: string | null,
  payload: ScorecardDraftSavePayload,
) => {
  const [period] = await db
    .select({ id: reportPeriods.id, utilityId: reportPeriods.utility_id })
    .from(reportPeriods)
    .where(eq(reportPeriods.id, payload.reportPeriodId))
    .limit(1);

  if (period == null || period.utilityId !== utilityId) {
    throw new Error("VALIDATION:Invalid report period for this utility.");
  }

  const existingBscRows = await db
    .select({
      id: bsc.id,
      perspective: bsc.perspective,
      relationships: bsc.relationships,
    })
    .from(bsc)
    .where(eq(bsc.utility_id, utilityId))
    .orderBy(desc(bsc.updated_at));

  const existingBsc =
    existingBscRows.find(
      (row) => row.perspective?.perspective_level === payload.perspectiveLevel,
    ) ?? null;

  const currentPerspective =
    existingBsc?.perspective?.perspective_level === payload.perspectiveLevel
      ? existingBsc.perspective
      : toDefaultPerspective(
          payload.perspectiveLevel,
          payload.perspectiveDescription.trim() ||
            perspectiveLabel(payload.perspectiveLevel),
        );

  const existingTargetsByKpiAndFrequency = new Map<
    string,
    { year: number; month?: number | null; value: string }[]
  >();
  for (const objective of currentPerspective.strategic_objective ?? []) {
    for (const initiative of objective.key_initiatives ?? []) {
      for (const linkedKpi of initiative.kpis ?? []) {
        const key = buildDraftKpiKey({
          kpiDefinitionId: linkedKpi.kpi_id,
          pendingCustomKpiRequestId: linkedKpi.pending_custom_kpi?.request_id,
          trackingFrequency:
            linkedKpi.tracking_frequency === "annually"
              ? "annually"
              : "monthly",
        });
        if (!existingTargetsByKpiAndFrequency.has(key)) {
          existingTargetsByKpiAndFrequency.set(key, [
            ...(linkedKpi.targets ?? []),
          ]);
        }
      }
    }
  }

  const nextPerspective: Perspective = {
    perspective_level: payload.perspectiveLevel,
    description:
      payload.perspectiveDescription.trim() ||
      currentPerspective.description ||
      perspectiveLabel(payload.perspectiveLevel),
    strategic_objective: payload.objectives.map((objective) => ({
      description: objective.description,
      key_initiatives: objective.keyInitiatives.map((initiative) => ({
        description: initiative.description,
        kpis: initiative.kpis.map((kpiItem) => {
          const resolvedKpiDefinitionId =
            kpiItem.kpiDefinitionId ?? kpiItem.approvedKpiDefinitionId ?? null;
          const key = buildDraftKpiKey({
            kpiDefinitionId: resolvedKpiDefinitionId,
            pendingCustomKpiRequestId: kpiItem.pendingCustomKpiRequestId,
            trackingFrequency: kpiItem.trackingFrequency,
          });
          const hasLinkedDefinition =
            Number.isInteger(resolvedKpiDefinitionId) &&
            (resolvedKpiDefinitionId ?? 0) > 0;
          const hasPendingRequestLink =
            (kpiItem.pendingCustomKpiRequestId?.trim().length ?? 0) > 0;
          return {
            kpi_id: hasLinkedDefinition ? resolvedKpiDefinitionId : null,
            pending_custom_kpi:
              hasLinkedDefinition || !hasPendingRequestLink
                ? undefined
                : {
                    request_id: kpiItem.pendingCustomKpiRequestId!,
                    title:
                      kpiItem.pendingCustomKpiTitle ?? "Pending custom KPI",
                    status: kpiItem.pendingCustomKpiStatus ?? "PENDING_REVIEW",
                    approved_kpi_definition_id:
                      kpiItem.approvedKpiDefinitionId ?? null,
                  },
            tracking_frequency: kpiItem.trackingFrequency,
            targets: existingTargetsByKpiAndFrequency.get(key) ?? [],
          };
        }),
      })),
    })),
  };

  const uniqueKpiDefinitionIds = Array.from(
    new Set(
      payload.objectives.flatMap((objective) =>
        objective.keyInitiatives.flatMap((initiative) =>
          initiative.kpis
            .map(
              (item) =>
                item.kpiDefinitionId ?? item.approvedKpiDefinitionId ?? null,
            )
            .filter(
              (kpiDefinitionId): kpiDefinitionId is number =>
                typeof kpiDefinitionId === "number" &&
                Number.isInteger(kpiDefinitionId) &&
                kpiDefinitionId > 0,
            ),
        ),
      ),
    ),
  );

  if (uniqueKpiDefinitionIds.length > 0) {
    const existingKpis = await db
      .select({ kpiDefId: kpi.kpi_def_id })
      .from(kpi)
      .where(
        and(
          eq(kpi.report_period_id, payload.reportPeriodId),
          inArray(kpi.kpi_def_id, uniqueKpiDefinitionIds),
        ),
      );

    const existingKpiDefIds = new Set(existingKpis.map((row) => row.kpiDefId));

    const missingRows = uniqueKpiDefinitionIds
      .filter((kpiDefId) => !existingKpiDefIds.has(kpiDefId))
      .map((kpiDefId) => ({
        report_period_id: payload.reportPeriodId,
        kpi_def_id: kpiDefId,
        target_value: null,
        actual_value: "0",
      }));

    if (missingRows.length > 0) {
      await db.insert(kpi).values(missingRows);
    }
  }

  if (existingBsc) {
    await db
      .update(bsc)
      .set({
        perspective: nextPerspective,
        updated_by_id: updatedById,
        updated_at: new Date(),
      })
      .where(eq(bsc.id, existingBsc.id));
  } else {
    await db.insert(bsc).values({
      utility_id: utilityId,
      perspective: nextPerspective,
      relationships: existingBscRows[0]?.relationships ?? [],
      updated_by_id: updatedById,
      updated_at: new Date(),
    });
  }

  return {
    reportPeriodId: payload.reportPeriodId,
    perspectiveLevel: payload.perspectiveLevel,
    objectiveCount: payload.objectives.length,
  };
};
