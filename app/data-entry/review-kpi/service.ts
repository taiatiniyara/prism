import { DEFAULT_DATA_ENTRY_FILTER_CONTEXT } from "@/app/data-entry/constants";
import { getReviewKpiFilterContextFromCookies } from "@/app/data-entry/review-kpi/filterContext.cookies";
import { applyFilterCascade } from "@/app/data-entry/filterContext.rules";
import { mapDataTypeToControlType } from "@/app/data-entry/inputControlType.mapper";
import {
  ReviewKpiFilterContext,
  ReviewKpiFilterOption,
  ReviewKpiFilterOptions,
  ReviewKpiInputValue,
  ReviewKpiPageViewModel,
  ReviewKpiRow,
} from "@/app/data-entry/review-kpi/types";
import { db } from "@/db/connection";
import {
  dataEntries,
  DataEntryComment,
  inputDefinitions,
} from "@/db/schema/dataEntry";
import { kpiDefinitions } from "@/db/schema/kpi";
import { kpi } from "@/db/schema/kpi";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { serviceAreas } from "@/db/schema/utility";
import { user as authUsers } from "@/db/schema/auth-schema";
import { triggerKpiWorkerAsync } from "@/app/data-entry/kpi-worker";
import { publishSyncEvent } from "@/app/data-entry/review-kpi/sync-store";
import { CurrentUser, getCurrentUser } from "@/lib/user.service";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  CustomKpiDecisionType,
  CustomKpiRequestStatus,
  CustomKpiVisibilityScope,
  customKpiDecisions,
  customKpiRequests,
} from "@/db/schema/custom-kpi-requests";
import {
  assertValidCustomKpiStatusTransition,
  enqueueCustomKpiDecisionOutcomeEmail,
  processPendingCustomKpiOutcomeEmailsForDecision,
  recordCustomKpiLifecycleEvent,
} from "@/app/settings/kpi/custom-kpi/service";

const EDIT_ROLES = new Set(["DEV", "BMO", "BLO", "DAOO", "DAOF"]);
const CUSTOM_KPI_REVIEWER_ROLES = new Set(["DEV"]);

const hasRoleAccess = (allowedRoles: Set<string>, role: string | null) => {
  const normalizedRole = role?.trim().toUpperCase();
  return normalizedRole != null && allowedRoles.has(normalizedRole);
};

export const assertReviewKpiReadAccess = (user: CurrentUser): void => {
  if (!user?.id) {
    throw new Error("FORBIDDEN:You are not allowed to access review KPI data.");
  }
};

export const assertReviewKpiWriteAccess = (user: CurrentUser): void => {
  assertReviewKpiReadAccess(user);

  if (!hasRoleAccess(EDIT_ROLES, user.role)) {
    throw new Error("FORBIDDEN:You are not allowed to edit review KPI data.");
  }
};

export const assertCustomKpiReviewerAccess = (user: CurrentUser): void => {
  assertReviewKpiReadAccess(user);

  if (!hasRoleAccess(CUSTOM_KPI_REVIEWER_ROLES, user.role)) {
    throw new Error(
      "FORBIDDEN:You are not allowed to review or promote custom KPI requests.",
    );
  }
};

const toPositiveIntOrNull = (value: number | null): number | null => {
  if (value == null) {
    return null;
  }

  return Number.isInteger(value) && value > 0 ? value : null;
};

export const sanitizeReviewKpiFilterContext = (
  context: ReviewKpiFilterContext,
): ReviewKpiFilterContext => {
  const sanitized: ReviewKpiFilterContext = {
    reportTypeId: toPositiveIntOrNull(context.reportTypeId),
    reportPeriodId: toPositiveIntOrNull(context.reportPeriodId),
    kpiCategoryId: toPositiveIntOrNull(context.kpiCategoryId),
    kpiSubcategoryId: toPositiveIntOrNull(context.kpiSubcategoryId),
    serviceAreaId: toPositiveIntOrNull(context.serviceAreaId),
  };

  if (sanitized.kpiCategoryId == null) {
    sanitized.kpiSubcategoryId = null;
  }

  return sanitized;
};

const mapOption = (id: number, name: string): ReviewKpiFilterOption => ({
  id,
  name,
});

export const buildReviewKpiFilterContextFromCookies =
  async (): Promise<ReviewKpiFilterContext> => {
    return getReviewKpiFilterContextFromCookies();
  };

export const applyReviewKpiFilterCascade = (
  current: ReviewKpiFilterContext,
  changedKey: keyof ReviewKpiFilterContext,
  nextValue: number | null,
): ReviewKpiFilterContext => {
  if (changedKey === "reportTypeId" || changedKey === "reportPeriodId") {
    const cascaded = applyFilterCascade(
      {
        ...DEFAULT_DATA_ENTRY_FILTER_CONTEXT,
        reportTypeId: current.reportTypeId,
        reportPeriodId: current.reportPeriodId,
        inputCategoryId: current.kpiCategoryId,
        inputSubcategoryId: current.kpiSubcategoryId,
        serviceAreaId: current.serviceAreaId,
      },
      changedKey,
      nextValue,
    );

    return {
      reportTypeId: cascaded.reportTypeId,
      reportPeriodId: cascaded.reportPeriodId,
      kpiCategoryId: cascaded.inputCategoryId,
      kpiSubcategoryId: cascaded.inputSubcategoryId,
      serviceAreaId: cascaded.serviceAreaId,
    };
  }

  const next: ReviewKpiFilterContext = {
    ...current,
    [changedKey]: nextValue,
  };

  if (changedKey === "kpiCategoryId") {
    next.kpiSubcategoryId = null;
    next.serviceAreaId = null;
  }

  return next;
};

export const getReviewKpiFilterOptions = async (
  user: CurrentUser,
  _context: ReviewKpiFilterContext,
): Promise<ReviewKpiFilterOptions> => {
  void _context;
  const reportPeriodWhere = [];
  const reportTypeWhere = [eq(managedListItems.is_active, true)];
  const serviceAreaWhere = [eq(serviceAreas.is_active, true)];

  if (user.org_id == null) {
    reportPeriodWhere.push(sql`1 = 0`);
    reportTypeWhere.push(sql`1 = 0`);
    serviceAreaWhere.push(sql`1 = 0`);
  } else {
    reportPeriodWhere.push(eq(reportPeriods.utility_id, user.org_id));
    reportTypeWhere.push(eq(reportPeriods.utility_id, user.org_id));
    serviceAreaWhere.push(eq(serviceAreas.utility_id, user.org_id));
  }

  const [reportTypeRows, reportPeriodRows, serviceAreaRows, kpiCategoryIdRows] =
    await Promise.all([
      db
        .select({ id: managedListItems.id, name: managedListItems.name })
        .from(reportPeriods)
        .innerJoin(
          managedListItems,
          eq(reportPeriods.report_type_id, managedListItems.id),
        )
        .where(and(...reportTypeWhere))
        .groupBy(managedListItems.id, managedListItems.name)
        .orderBy(asc(managedListItems.name))
        .limit(200),
      db
        .select({
          id: reportPeriods.id,
          name: sql<string>`to_char(${reportPeriods.report_date}, 'YYYY-MM')`,
        })
        .from(reportPeriods)
        .where(and(...reportPeriodWhere))
        .orderBy(asc(reportPeriods.report_date), asc(reportPeriods.id)),
      db
        .select({ id: serviceAreas.id, name: serviceAreas.name })
        .from(serviceAreas)
        .where(and(...serviceAreaWhere))
        .orderBy(asc(serviceAreas.name)),
      db
        .select({ id: kpiDefinitions.category_id })
        .from(kpiDefinitions)
        .where(
          and(
            eq(kpiDefinitions.is_active, true),
            sql`${kpiDefinitions.category_id} is not null`,
          ),
        )
        .groupBy(kpiDefinitions.category_id),
    ]);

  const kpiSubcategoryConditions = [
    eq(kpiDefinitions.is_active, true),
    sql`${kpiDefinitions.subcategory_id} is not null`,
  ];

  const subcategoryRows = await db
    .select({ id: kpiDefinitions.subcategory_id })
    .from(kpiDefinitions)
    .where(and(...kpiSubcategoryConditions))
    .groupBy(kpiDefinitions.subcategory_id);

  const subcategoryParentRows = await db
    .select({
      subcategoryId: kpiDefinitions.subcategory_id,
      categoryId: kpiDefinitions.category_id,
    })
    .from(kpiDefinitions)
    .where(
      and(
        eq(kpiDefinitions.is_active, true),
        sql`${kpiDefinitions.subcategory_id} is not null`,
        sql`${kpiDefinitions.category_id} is not null`,
      ),
    )
    .groupBy(kpiDefinitions.subcategory_id, kpiDefinitions.category_id);

  const subcategoryParentById = new Map<number, number>();
  for (const row of subcategoryParentRows) {
    if (
      row.subcategoryId != null &&
      row.categoryId != null &&
      !subcategoryParentById.has(row.subcategoryId)
    ) {
      subcategoryParentById.set(row.subcategoryId, row.categoryId);
    }
  }

  const kpiCategoryIds = [
    ...new Set(
      kpiCategoryIdRows
        .map((row) => row.id)
        .filter((id): id is number => id != null),
    ),
  ];
  const filteredKpiCategoryRows =
    kpiCategoryIds.length === 0
      ? []
      : await db
          .select({
            id: managedListItems.id,
            name: managedListItems.name,
            parentId: managedListItems.parent_id,
          })
          .from(managedListItems)
          .where(inArray(managedListItems.id, kpiCategoryIds))
          .orderBy(asc(managedListItems.name));

  const kpiSubcategoryIds = [
    ...new Set(
      subcategoryRows
        .map((row) => row.id)
        .filter((id): id is number => id != null),
    ),
  ];
  const filteredKpiSubcategoryRows =
    kpiSubcategoryIds.length === 0
      ? []
      : await db
          .select({
            id: managedListItems.id,
            name: managedListItems.name,
            parentId: managedListItems.parent_id,
          })
          .from(managedListItems)
          .where(inArray(managedListItems.id, kpiSubcategoryIds))
          .orderBy(asc(managedListItems.name));

  return {
    reportTypes: reportTypeRows.map((row) => mapOption(row.id, row.name)),
    reportPeriods: reportPeriodRows.map((row) => mapOption(row.id, row.name)),
    kpiCategories: filteredKpiCategoryRows.map((row) => ({
      id: row.id,
      name: row.name,
      parent_id: row.parentId,
    })),
    kpiSubcategories: filteredKpiSubcategoryRows.map((row) => ({
      id: row.id,
      name: row.name,
      parent_id: row.parentId ?? subcategoryParentById.get(row.id) ?? null,
    })),
    serviceAreas: serviceAreaRows.map((row) => mapOption(row.id, row.name)),
  };
};

export const sanitizeReviewKpiContextAgainstOptions = (
  context: ReviewKpiFilterContext,
  options: ReviewKpiFilterOptions,
): ReviewKpiFilterContext => {
  const hasOption = (value: number | null, list: ReviewKpiFilterOption[]) =>
    value != null && list.some((option) => option.id === value);

  const sanitized: ReviewKpiFilterContext = {
    reportTypeId: hasOption(context.reportTypeId, options.reportTypes)
      ? context.reportTypeId
      : null,
    reportPeriodId: hasOption(context.reportPeriodId, options.reportPeriods)
      ? context.reportPeriodId
      : null,
    kpiCategoryId: hasOption(context.kpiCategoryId, options.kpiCategories)
      ? context.kpiCategoryId
      : null,
    kpiSubcategoryId: hasOption(
      context.kpiSubcategoryId,
      options.kpiSubcategories,
    )
      ? context.kpiSubcategoryId
      : null,
    serviceAreaId: hasOption(context.serviceAreaId, options.serviceAreas)
      ? context.serviceAreaId
      : null,
  };

  if (sanitized.kpiCategoryId == null && sanitized.kpiSubcategoryId != null) {
    sanitized.kpiSubcategoryId = null;
  }

  if (
    sanitized.kpiCategoryId != null &&
    sanitized.kpiSubcategoryId != null &&
    !options.kpiSubcategories.some(
      (subcategory) =>
        subcategory.id === sanitized.kpiSubcategoryId &&
        subcategory.parent_id === sanitized.kpiCategoryId,
    )
  ) {
    sanitized.kpiSubcategoryId = null;
  }

  return sanitized;
};

export const bootstrapReviewKpiContextAndOptions = async () => {
  const user = await getCurrentUser();
  const context = sanitizeReviewKpiFilterContext(
    await buildReviewKpiFilterContextFromCookies(),
  );
  const options = await getReviewKpiFilterOptions(user, context);
  const sanitizedContext = sanitizeReviewKpiContextAgainstOptions(
    context,
    options,
  );

  return { context: sanitizedContext, options };
};

const buildKpiWhereConditions = (context: ReviewKpiFilterContext) => {
  const conditions = [eq(kpiDefinitions.is_active, true)];

  if (context.kpiCategoryId != null) {
    conditions.push(eq(kpiDefinitions.category_id, context.kpiCategoryId));
  }

  if (context.kpiSubcategoryId != null) {
    conditions.push(
      eq(kpiDefinitions.subcategory_id, context.kpiSubcategoryId),
    );
  }

  return conditions;
};

const serializeComment = (
  comment: DataEntryComment,
  commenterNameById?: Map<string, string>,
): ReviewKpiRow["inputs"][number]["comments"][number] => ({
  comment: comment.comment,
  commenterId: comment.commenterId,
  commenterName:
    comment.commenterName ??
    commenterNameById?.get(comment.commenterId) ??
    null,
  commenterRole: comment.commenterRole,
  date:
    comment.date instanceof Date
      ? comment.date.toISOString()
      : new Date(comment.date).toISOString(),
  resolved: comment.resolved,
  replies: comment.replies?.map((reply) =>
    serializeComment(reply, commenterNameById),
  ),
});

const collectCommenterIds = (
  comments: DataEntryComment[] | null | undefined,
  ids = new Set<string>(),
): Set<string> => {
  for (const comment of comments ?? []) {
    if (comment.commenterId) {
      ids.add(comment.commenterId);
    }

    if (comment.replies && comment.replies.length > 0) {
      collectCommenterIds(comment.replies, ids);
    }
  }

  return ids;
};

export const listReviewKpiRows = async (
  context: ReviewKpiFilterContext,
): Promise<ReviewKpiRow[]> => {
  if (context.reportPeriodId == null) {
    return [];
  }

  const kpiWhereConditions = buildKpiWhereConditions(context);

  const kpiDefinitionRows = await db
    .select({
      id: kpiDefinitions.id,
      name: kpiDefinitions.name,
      unitName: sql<string | null>`(
        select ${managedListItems.name}
        from ${managedListItems}
        where ${managedListItems.id} = ${kpiDefinitions.unit_id}
        limit 1
      )`,
      formula: kpiDefinitions.formula,
      formulaInputs: kpiDefinitions.formula_inputs,
      categoryId: kpiDefinitions.category_id,
      subcategoryId: kpiDefinitions.subcategory_id,
    })
    .from(kpiDefinitions)
    .where(and(...kpiWhereConditions))
    .orderBy(asc(kpiDefinitions.name));

  if (kpiDefinitionRows.length === 0) {
    return [];
  }

  const referencedInputDefIds = [
    ...new Set(
      kpiDefinitionRows.flatMap((row) =>
        (row.formulaInputs ?? []).map((input) => input.input_def_id),
      ),
    ),
  ];

  const inputDefinitionRows = referencedInputDefIds.length
    ? await db
        .select({
          id: inputDefinitions.id,
          name: inputDefinitions.name,
          unitName: sql<string | null>`(
            select ${managedListItems.name}
            from ${managedListItems}
            where ${managedListItems.id} = ${inputDefinitions.unit_id}
            limit 1
          )`,
          dataTypeName: managedListItems.name,
        })
        .from(inputDefinitions)
        .leftJoin(
          managedListItems,
          eq(inputDefinitions.data_type_id, managedListItems.id),
        )
        .where(inArray(inputDefinitions.id, referencedInputDefIds))
    : [];

  const inputDefinitionById = new Map(
    inputDefinitionRows.map((row) => [row.id, row]),
  );

  const dataEntryWhereConditions = [
    eq(dataEntries.report_period_id, context.reportPeriodId),
    eq(dataEntries.is_deleted, false),
  ];

  if (context.serviceAreaId != null) {
    dataEntryWhereConditions.push(
      eq(dataEntries.service_area_id, context.serviceAreaId),
    );
  }

  if (referencedInputDefIds.length > 0) {
    dataEntryWhereConditions.push(
      inArray(dataEntries.input_def_id, referencedInputDefIds),
    );
  }

  const dataEntryRows = referencedInputDefIds.length
    ? await db
        .select({
          id: dataEntries.id,
          inputDefId: dataEntries.input_def_id,
          value: dataEntries.value,
          comments: dataEntries.comments,
          updatedAt: dataEntries.updatedAt,
          updatedById: dataEntries.updatedById,
        })
        .from(dataEntries)
        .where(and(...dataEntryWhereConditions))
    : [];

  const dataEntryByInputDefId = new Map<
    number,
    (typeof dataEntryRows)[number][]
  >();
  for (const row of dataEntryRows) {
    const bucket = dataEntryByInputDefId.get(row.inputDefId) ?? [];
    bucket.push(row);
    dataEntryByInputDefId.set(row.inputDefId, bucket);
  }

  const kpiResultRows = await db
    .select({
      id: kpi.id,
      kpiDefId: kpi.kpi_def_id,
      actualValue: kpi.actual_value,
      calculatedAt: kpi.calculated_at,
      formulaVersion: kpi.calculation_formula_version,
    })
    .from(kpi)
    .where(eq(kpi.report_period_id, context.reportPeriodId));

  const kpiResultByDefId = new Map(
    kpiResultRows.map((row) => [row.kpiDefId, row]),
  );

  const commenterIds = [
    ...dataEntryRows.reduce((ids, row) => {
      collectCommenterIds(row.comments, ids);
      return ids;
    }, new Set<string>()),
  ];

  const commenterNameById =
    commenterIds.length === 0
      ? new Map<string, string>()
      : new Map(
          (
            await db
              .select({ id: authUsers.id, name: authUsers.name })
              .from(authUsers)
              .where(inArray(authUsers.id, commenterIds))
          ).map((row) => [row.id, row.name]),
        );

  return kpiDefinitionRows.map((kpiDefinition) => {
    const inputs: ReviewKpiInputValue[] = (
      kpiDefinition.formulaInputs ?? []
    ).flatMap((formulaInput) => {
      const def = inputDefinitionById.get(formulaInput.input_def_id);
      const sourceRows =
        dataEntryByInputDefId.get(formulaInput.input_def_id) ?? [];

      if (sourceRows.length === 0) {
        return [
          {
            dataEntryId: `missing-${formulaInput.input_def_id}`,
            inputDefId: formulaInput.input_def_id,
            inputName: def?.name ?? `Input ${formulaInput.input_def_id}`,
            unitName: def?.unitName ?? null,
            value: null,
            controlType: mapDataTypeToControlType(def?.dataTypeName),
            comments: [],
            updatedAt: new Date(0).toISOString(),
            updatedById: null,
          },
        ];
      }

      return sourceRows.map((row) => ({
        dataEntryId: row.id,
        inputDefId: row.inputDefId,
        inputName: def?.name ?? `Input ${row.inputDefId}`,
        unitName: def?.unitName ?? null,
        value: row.value,
        controlType: mapDataTypeToControlType(def?.dataTypeName),
        comments: (row.comments ?? []).map((comment) =>
          serializeComment(comment, commenterNameById),
        ),
        updatedAt: row.updatedAt.toISOString(),
        updatedById: row.updatedById,
      }));
    });

    const result = kpiResultByDefId.get(kpiDefinition.id);

    return {
      kpiDefId: kpiDefinition.id,
      kpiName: kpiDefinition.name,
      unitName: kpiDefinition.unitName,
      formulaText: kpiDefinition.formula,
      categoryId: kpiDefinition.categoryId,
      subcategoryId: kpiDefinition.subcategoryId,
      reportPeriodId: context.reportPeriodId!,
      serviceAreaId: context.serviceAreaId,
      inputs,
      result: {
        kpiId: result?.id ?? null,
        value: result?.actualValue ?? null,
        status: result?.actualValue == null ? "missing-input" : "calculated",
        calculatedAt: result?.calculatedAt?.toISOString() ?? null,
        formulaVersion: result?.formulaVersion ?? null,
      },
    };
  });
};

export const getReviewKpiPageViewModel =
  async (): Promise<ReviewKpiPageViewModel> => {
    const { context, options } = await bootstrapReviewKpiContextAndOptions();
    const rows = await listReviewKpiRows(context);

    return {
      context,
      options,
      rows,
    };
  };

const toReviewInputValue = (
  row: {
    id: string;
    inputDefId: number;
    value: string | null;
    comments: DataEntryComment[] | null;
    updatedAt: Date;
    updatedById: string | null;
  },
  inputName: string,
  unitName: string | null,
  dataTypeName?: string | null,
): ReviewKpiInputValue => ({
  dataEntryId: row.id,
  inputDefId: row.inputDefId,
  inputName,
  unitName,
  value: row.value,
  controlType: mapDataTypeToControlType(dataTypeName),
  comments: (row.comments ?? []).map((comment) => serializeComment(comment)),
  updatedAt: row.updatedAt.toISOString(),
  updatedById: row.updatedById,
});

const resolveKpiDefIdForInput = async (
  inputDefId: number,
): Promise<number | null> => {
  const definitions = await db
    .select({
      id: kpiDefinitions.id,
      formulaInputs: kpiDefinitions.formula_inputs,
    })
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.is_active, true));

  const definition = definitions.find((item) =>
    (item.formulaInputs ?? []).some(
      (formulaInput) => formulaInput.input_def_id === inputDefId,
    ),
  );

  return definition?.id ?? null;
};

const findLatestKpiResult = async (
  reportPeriodId: number,
  kpiDefId: number | null,
): Promise<ReviewKpiRow["result"]> => {
  if (kpiDefId == null) {
    return {
      kpiId: null,
      value: null,
      status: "stale",
      calculatedAt: null,
      formulaVersion: null,
    };
  }

  const [result] = await db
    .select({
      id: kpi.id,
      actualValue: kpi.actual_value,
      calculatedAt: kpi.calculated_at,
      formulaVersion: kpi.calculation_formula_version,
    })
    .from(kpi)
    .where(
      and(
        eq(kpi.report_period_id, reportPeriodId),
        eq(kpi.kpi_def_id, kpiDefId),
      ),
    )
    .limit(1);

  if (!result) {
    return {
      kpiId: null,
      value: null,
      status: "stale",
      calculatedAt: null,
      formulaVersion: null,
    };
  }

  return {
    kpiId: result.id,
    value: result.actualValue,
    status: result.actualValue == null ? "missing-input" : "calculated",
    calculatedAt: result.calculatedAt?.toISOString() ?? null,
    formulaVersion: result.formulaVersion,
  };
};

export const updateReviewKpiInputValue = async (
  dataEntryId: string,
  payload: { value: string | null; updatedAt: string },
  user: CurrentUser,
) => {
  assertReviewKpiWriteAccess(user);

  const [existing] = await db
    .select({
      id: dataEntries.id,
      inputDefId: dataEntries.input_def_id,
      reportPeriodId: dataEntries.report_period_id,
      serviceAreaId: dataEntries.service_area_id,
      comments: dataEntries.comments,
      value: dataEntries.value,
      updatedAt: dataEntries.updatedAt,
      updatedById: dataEntries.updatedById,
      inputName: inputDefinitions.name,
      unitName: sql<string | null>`(
        select ${managedListItems.name}
        from ${managedListItems}
        where ${managedListItems.id} = ${inputDefinitions.unit_id}
        limit 1
      )`,
      dataTypeName: managedListItems.name,
    })
    .from(dataEntries)
    .innerJoin(
      inputDefinitions,
      eq(dataEntries.input_def_id, inputDefinitions.id),
    )
    .leftJoin(
      managedListItems,
      eq(inputDefinitions.data_type_id, managedListItems.id),
    )
    .where(eq(dataEntries.id, dataEntryId))
    .limit(1);

  if (!existing) {
    throw new Error("VALIDATION:Input value does not exist.");
  }

  if (existing.updatedAt.toISOString() !== payload.updatedAt) {
    const latest = toReviewInputValue(
      {
        id: existing.id,
        inputDefId: existing.inputDefId,
        value: existing.value,
        comments: existing.comments,
        updatedAt: existing.updatedAt,
        updatedById: existing.updatedById,
      },
      existing.inputName,
      existing.unitName,
      existing.dataTypeName,
    );

    throw Object.assign(new Error("CONFLICT:Input value is stale."), {
      latest,
    });
  }

  await db
    .update(dataEntries)
    .set({
      value: payload.value?.trim() ? payload.value.trim() : null,
      updatedAt: new Date(),
      updatedById: user.id,
    })
    .where(eq(dataEntries.id, dataEntryId));

  const [updated] = await db
    .select({
      id: dataEntries.id,
      inputDefId: dataEntries.input_def_id,
      value: dataEntries.value,
      comments: dataEntries.comments,
      updatedAt: dataEntries.updatedAt,
      updatedById: dataEntries.updatedById,
      inputName: inputDefinitions.name,
      unitName: sql<string | null>`(
        select ${managedListItems.name}
        from ${managedListItems}
        where ${managedListItems.id} = ${inputDefinitions.unit_id}
        limit 1
      )`,
      dataTypeName: managedListItems.name,
      reportPeriodId: dataEntries.report_period_id,
      serviceAreaId: dataEntries.service_area_id,
    })
    .from(dataEntries)
    .innerJoin(
      inputDefinitions,
      eq(dataEntries.input_def_id, inputDefinitions.id),
    )
    .leftJoin(
      managedListItems,
      eq(inputDefinitions.data_type_id, managedListItems.id),
    )
    .where(eq(dataEntries.id, dataEntryId))
    .limit(1);

  if (!updated) {
    throw new Error("Unable to read updated input value.");
  }

  triggerKpiWorkerAsync(
    {
      sourceDataEntryId: updated.id,
      inputDefId: updated.inputDefId,
      triggeredByUserId: user.id,
      scope: {
        reportPeriodId: updated.reportPeriodId,
        organizationId: user.org_id,
        serviceAreaId: updated.serviceAreaId,
      },
    },
    user,
  );

  const kpiDefId = await resolveKpiDefIdForInput(updated.inputDefId);
  const result = await findLatestKpiResult(updated.reportPeriodId, kpiDefId);

  const input = toReviewInputValue(
    {
      id: updated.id,
      inputDefId: updated.inputDefId,
      value: updated.value,
      comments: updated.comments,
      updatedAt: updated.updatedAt,
      updatedById: updated.updatedById,
    },
    updated.inputName,
    updated.unitName,
    updated.dataTypeName,
  );

  publishSyncEvent({
    eventId: crypto.randomUUID(),
    eventType: "input-updated",
    occurredAt: new Date().toISOString(),
    reportPeriodId: updated.reportPeriodId,
    serviceAreaId: updated.serviceAreaId,
    kpiDefId: kpiDefId ?? 0,
    inputDefId: updated.inputDefId,
    dataEntryId: updated.id,
    payload: {
      input,
      result,
    },
  });

  return { input, result };
};

export const addReviewKpiInputComment = async (
  dataEntryId: string,
  comment: string,
  user: CurrentUser,
) => {
  assertReviewKpiWriteAccess(user);

  const [existing] = await db
    .select({
      id: dataEntries.id,
      comments: dataEntries.comments,
      inputDefId: dataEntries.input_def_id,
      reportPeriodId: dataEntries.report_period_id,
      serviceAreaId: dataEntries.service_area_id,
    })
    .from(dataEntries)
    .where(eq(dataEntries.id, dataEntryId))
    .limit(1);

  if (!existing) {
    throw new Error("VALIDATION:Input value does not exist.");
  }

  const nextComment: DataEntryComment = {
    comment,
    commenterId: user.id,
    commenterName: user.name,
    commenterRole: user.role,
    date: new Date(),
    resolved: false,
  };

  const nextComments = [...(existing.comments ?? []), nextComment];

  await db
    .update(dataEntries)
    .set({
      comments: nextComments,
      updatedAt: new Date(),
      updatedById: user.id,
    })
    .where(eq(dataEntries.id, dataEntryId));

  const serializedComments = nextComments.map((entry) =>
    serializeComment(entry),
  );
  const kpiDefId = await resolveKpiDefIdForInput(existing.inputDefId);

  publishSyncEvent({
    eventId: crypto.randomUUID(),
    eventType: "comment-added",
    occurredAt: new Date().toISOString(),
    reportPeriodId: existing.reportPeriodId,
    serviceAreaId: existing.serviceAreaId,
    kpiDefId: kpiDefId ?? 0,
    inputDefId: existing.inputDefId,
    dataEntryId: existing.id,
    payload: {
      comments: serializedComments,
    },
  });

  return { comments: serializedComments };
};

export type ApplyCustomKpiDecisionInput = {
  decisionType: CustomKpiDecisionType;
  rationale: string;
  replacementKpiId: number | null;
  categoryId: number | null;
  subcategoryId: number | null;
  override: boolean;
  priorDecisionId: string | null;
};

export type CustomKpiApprovalCategoryOption = {
  id: number;
  name: string;
};

export type CustomKpiApprovalSubcategoryOption = {
  id: number;
  name: string;
  categoryId: number | null;
};

export type CustomKpiApprovalTaxonomyOptions = {
  categories: CustomKpiApprovalCategoryOption[];
  subcategories: CustomKpiApprovalSubcategoryOption[];
};

export const listCustomKpiApprovalTaxonomyOptions =
  async (): Promise<CustomKpiApprovalTaxonomyOptions> => {
    const [lists] = await Promise.all([
      db
        .select({ id: managedLists.id, name: managedLists.name })
        .from(managedLists)
        .where(
          and(
            eq(managedLists.is_active, true),
            inArray(managedLists.name, ["KPI Category", "KPI Sub-Category"]),
          ),
        ),
    ]);

    const categoryListId =
      lists.find((item) => item.name === "KPI Category")?.id ?? null;
    const subcategoryListId =
      lists.find((item) => item.name === "KPI Sub-Category")?.id ?? null;

    if (categoryListId == null || subcategoryListId == null) {
      return { categories: [], subcategories: [] };
    }

    const [categoryRows, subcategoryRows] = await Promise.all([
      db
        .select({ id: managedListItems.id, name: managedListItems.name })
        .from(managedListItems)
        .where(
          and(
            eq(managedListItems.list_id, categoryListId),
            eq(managedListItems.is_active, true),
          ),
        )
        .orderBy(asc(managedListItems.name)),
      db
        .select({
          id: managedListItems.id,
          name: managedListItems.name,
          categoryId: managedListItems.parent_id,
        })
        .from(managedListItems)
        .where(
          and(
            eq(managedListItems.list_id, subcategoryListId),
            eq(managedListItems.is_active, true),
          ),
        )
        .orderBy(asc(managedListItems.name)),
    ]);

    return {
      categories: categoryRows,
      subcategories: subcategoryRows,
    };
  };

const mapDecisionTypeToStatus = (
  decisionType: CustomKpiDecisionType,
): CustomKpiRequestStatus => {
  switch (decisionType) {
    case "APPROVE":
      return "APPROVED";
    case "REJECT":
      return "REJECTED";
    case "REPLACE":
      return "REPLACED";
    default:
      return "REJECTED";
  }
};

export const canPromoteCustomKpiVisibility = (
  status: CustomKpiRequestStatus,
  scope: CustomKpiVisibilityScope,
): boolean => status === "APPROVED" && scope === "SUBMITTER_ONLY";

export const resolveOverrideDecisionLineage = (input: {
  currentStatus: CustomKpiRequestStatus;
  overrideRequested: boolean;
  priorDecisionId: string | null;
}): { requiresOverride: boolean; overrideDecisionId: string | null } => {
  const requiresOverride = input.currentStatus !== "PENDING_REVIEW";

  if (!requiresOverride) {
    return { requiresOverride: false, overrideDecisionId: null };
  }

  if (!input.overrideRequested) {
    throw new Error(
      "CONFLICT:Request already has a final decision. Set override=true.",
    );
  }

  if (!input.priorDecisionId) {
    throw new Error("VALIDATION:priorDecisionId is required for overrides.");
  }

  return { requiresOverride: true, overrideDecisionId: input.priorDecisionId };
};

export const applyCustomKpiReviewDecision = async (
  requestId: string,
  input: ApplyCustomKpiDecisionInput,
  user: CurrentUser,
) => {
  assertCustomKpiReviewerAccess(user);

  if (input.decisionType === "REPLACE" && input.replacementKpiId == null) {
    throw new Error("VALIDATION:replacementKpiId is required for REPLACE.");
  }

  if (
    input.decisionType === "APPROVE" &&
    (input.categoryId == null || input.subcategoryId == null)
  ) {
    throw new Error(
      "VALIDATION:categoryId and subcategoryId are required for APPROVE.",
    );
  }

  const [request] = await db
    .select({
      id: customKpiRequests.id,
      submitterUserId: customKpiRequests.submitter_user_id,
      title: customKpiRequests.title,
      description: customKpiRequests.description,
      formulaExpression: customKpiRequests.formula_expression,
      businessContext: customKpiRequests.business_context,
      selectedInputDefinitionIds:
        customKpiRequests.selected_input_definition_ids,
      existingKpiDefinitionId: customKpiRequests.replacement_kpi_def_id,
      status: customKpiRequests.status,
      visibilityScope: customKpiRequests.visibility_scope,
      createdAt: customKpiRequests.created_at,
    })
    .from(customKpiRequests)
    .where(eq(customKpiRequests.id, requestId))
    .limit(1);

  if (!request) {
    throw new Error("VALIDATION:Custom KPI request does not exist.");
  }

  const nextStatus = mapDecisionTypeToStatus(input.decisionType);
  const lineage = resolveOverrideDecisionLineage({
    currentStatus: request.status,
    overrideRequested: input.override,
    priorDecisionId: input.priorDecisionId,
  });

  assertValidCustomKpiStatusTransition(request.status, nextStatus, {
    override: lineage.requiresOverride,
  });

  const [decision] = await db
    .insert(customKpiDecisions)
    .values({
      request_id: requestId,
      reviewer_user_id: user.id,
      decision_type: input.decisionType,
      rationale: input.rationale,
      override_of_decision_id: lineage.overrideDecisionId,
    })
    .returning({ id: customKpiDecisions.id });

  let approvedKpiDefinitionId: number | null = null;
  if (input.decisionType === "APPROVE") {
    const selectedInputDefinitions =
      request.selectedInputDefinitionIds.length > 0
        ? await db
            .select({
              id: inputDefinitions.id,
              variableName: inputDefinitions.variable_name,
            })
            .from(inputDefinitions)
            .where(
              inArray(inputDefinitions.id, request.selectedInputDefinitionIds),
            )
        : [];

    const formulaInputs = selectedInputDefinitions
      .filter(
        (item) =>
          typeof item.variableName === "string" &&
          item.variableName.trim().length > 0,
      )
      .map((item) => ({
        input_def_id: item.id,
        variable_name: item.variableName as string,
      }));

    const [categoryItem] =
      input.categoryId != null
        ? await db
            .select({ id: managedListItems.id })
            .from(managedListItems)
            .innerJoin(
              managedLists,
              eq(managedListItems.list_id, managedLists.id),
            )
            .where(
              and(
                eq(managedListItems.id, input.categoryId),
                eq(managedListItems.is_active, true),
                eq(managedLists.name, "KPI Category"),
              ),
            )
            .limit(1)
        : [];

    const [subcategoryItem] =
      input.subcategoryId != null
        ? await db
            .select({
              id: managedListItems.id,
              categoryId: managedListItems.parent_id,
            })
            .from(managedListItems)
            .innerJoin(
              managedLists,
              eq(managedListItems.list_id, managedLists.id),
            )
            .where(
              and(
                eq(managedListItems.id, input.subcategoryId),
                eq(managedListItems.is_active, true),
                eq(managedLists.name, "KPI Sub-Category"),
              ),
            )
            .limit(1)
        : [];

    if (!categoryItem || !subcategoryItem) {
      throw new Error(
        "VALIDATION:Selected KPI category or subcategory is invalid.",
      );
    }

    if (subcategoryItem.categoryId !== categoryItem.id) {
      throw new Error(
        "VALIDATION:Selected KPI subcategory does not match the selected category.",
      );
    }

    if (
      request.status === "APPROVED" &&
      request.existingKpiDefinitionId != null &&
      lineage.requiresOverride
    ) {
      await db
        .update(kpiDefinitions)
        .set({
          formula: request.formulaExpression,
          formula_inputs: formulaInputs.length > 0 ? formulaInputs : null,
          category_id: categoryItem.id,
          subcategory_id: subcategoryItem.id,
        })
        .where(eq(kpiDefinitions.id, request.existingKpiDefinitionId));

      approvedKpiDefinitionId = request.existingKpiDefinitionId;
    } else {
      const [submitter] = await db
        .select({ organisationId: authUsers.organisation_id })
        .from(authUsers)
        .where(eq(authUsers.id, request.submitterUserId))
        .limit(1);

      if (!submitter || submitter.organisationId == null) {
        throw new Error(
          "VALIDATION:Submitter must belong to an organisation before approval.",
        );
      }

      const [createdKpiDefinition] = await db
        .insert(kpiDefinitions)
        .values({
          name: request.title,
          description: request.description ?? request.businessContext,
          formula: request.formulaExpression,
          formula_inputs: formulaInputs.length > 0 ? formulaInputs : null,
          category_id: categoryItem.id,
          subcategory_id: subcategoryItem.id,
          type: "custom",
          owner_utility_id: submitter.organisationId,
          utilities: [submitter.organisationId],
        })
        .returning({ id: kpiDefinitions.id });

      approvedKpiDefinitionId = createdKpiDefinition.id;
    }
  }

  const nextScope: CustomKpiVisibilityScope =
    input.decisionType === "APPROVE"
      ? "SUBMITTER_ONLY"
      : request.visibilityScope;

  await db
    .update(customKpiRequests)
    .set({
      status: nextStatus,
      visibility_scope: nextScope,
      replacement_kpi_def_id:
        input.decisionType === "APPROVE"
          ? approvedKpiDefinitionId
          : input.decisionType === "REPLACE"
            ? input.replacementKpiId
            : null,
      updated_at: new Date(),
    })
    .where(eq(customKpiRequests.id, requestId));

  await recordCustomKpiLifecycleEvent({
    requestId,
    eventType:
      input.decisionType === "APPROVE"
        ? "DECISION_APPROVED"
        : input.decisionType === "REJECT"
          ? "DECISION_REJECTED"
          : "DECISION_REPLACED",
    actorUserId: user.id,
    metadata: {
      decisionId: decision.id,
      rationale: input.rationale,
      approvedKpiDefinitionId,
      replacementKpiId: input.replacementKpiId,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      override: lineage.requiresOverride,
      priorDecisionId: lineage.overrideDecisionId,
    },
  });

  if (lineage.requiresOverride) {
    await recordCustomKpiLifecycleEvent({
      requestId,
      eventType: "DECISION_OVERRIDDEN",
      actorUserId: user.id,
      metadata: {
        decisionId: decision.id,
        priorDecisionId: lineage.overrideDecisionId,
      },
    });
  }

  // SC-002 decision cycle-time telemetry for finalized decisions.
  console.info("metric.custom_kpi.decision_cycle_time_ms", {
    requestId,
    decisionId: decision.id,
    durationMs: Date.now() - request.createdAt.getTime(),
    decisionType: input.decisionType,
  });

  try {
    await enqueueCustomKpiDecisionOutcomeEmail({
      requestId,
      decisionId: decision.id,
    });

    // Send immediately when possible; retry flow still handles transient failures.
    await processPendingCustomKpiOutcomeEmailsForDecision(decision.id, 200);
  } catch (error) {
    console.error("Failed to enqueue custom KPI outcome email", {
      requestId,
      decisionId: decision.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return {
    requestId,
    decisionId: decision.id,
    status: nextStatus,
    visibilityScope: nextScope,
  };
};

export const promoteCustomKpiRequestVisibility = async (
  requestId: string,
  user: CurrentUser,
) => {
  assertCustomKpiReviewerAccess(user);

  const [request] = await db
    .select({
      id: customKpiRequests.id,
      status: customKpiRequests.status,
      visibilityScope: customKpiRequests.visibility_scope,
    })
    .from(customKpiRequests)
    .where(eq(customKpiRequests.id, requestId))
    .limit(1);

  if (!request) {
    throw new Error("VALIDATION:Custom KPI request does not exist.");
  }

  if (!canPromoteCustomKpiVisibility(request.status, request.visibilityScope)) {
    throw new Error(
      "CONFLICT:Only approved submitter-only requests can be promoted.",
    );
  }

  await db
    .update(customKpiRequests)
    .set({ visibility_scope: "GLOBAL", updated_at: new Date() })
    .where(eq(customKpiRequests.id, requestId));

  await recordCustomKpiLifecycleEvent({
    requestId,
    eventType: "VISIBILITY_PROMOTED",
    actorUserId: user.id,
    metadata: {
      from: "SUBMITTER_ONLY",
      to: "GLOBAL",
    },
  });

  return {
    requestId,
    visibilityScope: "GLOBAL" as const,
  };
};
