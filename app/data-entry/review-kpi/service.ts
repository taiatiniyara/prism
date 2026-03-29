import { DEFAULT_DATA_ENTRY_FILTER_CONTEXT } from "@/app/data-entry/constants";
import { getFilterContextFromCookies } from "@/app/data-entry/filterContext.cookies";
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
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { serviceAreas } from "@/db/schema/utility";
import { triggerKpiWorkerAsync } from "@/app/data-entry/kpi-worker";
import { publishSyncEvent } from "@/app/data-entry/review-kpi/sync-store";
import { CurrentUser, getCurrentUser } from "@/lib/user.service";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

const EDIT_ROLES = new Set(["DEV", "BMO"]);
const GLOBAL_ROLES = new Set(["DEV", "BMO"]);

export const assertReviewKpiReadAccess = (user: CurrentUser): void => {
  if (!user?.id) {
    throw new Error("FORBIDDEN:You are not allowed to access review KPI data.");
  }
};

export const assertReviewKpiWriteAccess = (user: CurrentUser): void => {
  assertReviewKpiReadAccess(user);

  if (!EDIT_ROLES.has(user.role)) {
    throw new Error("FORBIDDEN:You are not allowed to edit review KPI data.");
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
    const cookieContext = await getFilterContextFromCookies();

    return {
      reportTypeId: cookieContext.reportTypeId,
      reportPeriodId: cookieContext.reportPeriodId,
      kpiCategoryId: cookieContext.inputCategoryId,
      kpiSubcategoryId: cookieContext.inputSubcategoryId,
      serviceAreaId: cookieContext.serviceAreaId,
    };
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
  context: ReviewKpiFilterContext,
): Promise<ReviewKpiFilterOptions> => {
  const reportPeriodWhere = [];
  const reportTypeWhere = [eq(managedListItems.is_active, true)];
  const serviceAreaWhere = [eq(serviceAreas.is_active, true)];

  if (!GLOBAL_ROLES.has(user.role)) {
    if (user.org_id == null) {
      reportPeriodWhere.push(sql`1 = 0`);
      reportTypeWhere.push(sql`1 = 0`);
      serviceAreaWhere.push(sql`1 = 0`);
    } else {
      reportPeriodWhere.push(eq(reportPeriods.utility_id, user.org_id));
      reportTypeWhere.push(eq(reportPeriods.utility_id, user.org_id));
      serviceAreaWhere.push(eq(serviceAreas.utility_id, user.org_id));
    }
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
          name: sql<string>`to_char(${reportPeriods.report_date}, 'YYYY-MM-DD')`,
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
): ReviewKpiRow["inputs"][number]["comments"][number] => ({
  comment: comment.comment,
  commenterId: comment.commenterId,
  commenterRole: comment.commenterRole,
  date:
    comment.date instanceof Date
      ? comment.date.toISOString()
      : new Date(comment.date).toISOString(),
  resolved: comment.resolved,
  replies: comment.replies?.map(serializeComment),
});

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
        value: row.value,
        controlType: mapDataTypeToControlType(def?.dataTypeName),
        comments: (row.comments ?? []).map((comment) =>
          serializeComment(comment),
        ),
        updatedAt: row.updatedAt.toISOString(),
        updatedById: row.updatedById,
      }));
    });

    const result = kpiResultByDefId.get(kpiDefinition.id);

    return {
      kpiDefId: kpiDefinition.id,
      kpiName: kpiDefinition.name,
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
  dataTypeName?: string | null,
): ReviewKpiInputValue => ({
  dataEntryId: row.id,
  inputDefId: row.inputDefId,
  inputName,
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
