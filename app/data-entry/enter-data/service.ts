"use server";

import { DataEntryFilterContext } from "@/app/data-entry/constants";
import { applyOperationalVisibilityRule } from "@/app/data-entry/filterContext.rules";
import {
  getFilterContextFromCookies,
  saveFilterContextToCookies,
} from "@/app/data-entry/filterContext.cookies";
import {
  DataEntryFilterOption,
  DataEntryGeneratorGroupView,
  DataEntryFilterOptions,
  DataEntryInputRowView,
  DataEntryProgressSummary,
  DataEntryPageViewModel,
} from "@/app/data-entry/types";
import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { energyResources, serviceAreas } from "@/db/schema/utility";
import { CurrentUser, getCurrentUser } from "@/lib/user.service";
import {
  getOperationalCategoryId,
  sanitizeDependentFilterContext,
  sanitizePrimaryFilterContext,
} from "@/app/data-entry/enter-data/services/us1.contextPersistence.service";
import { DataEntryStatusId } from "@/db/schema/dataEntry";
import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { mapDataTypeToControlType } from "@/app/data-entry/inputControlType.mapper";
import {
  applyCascadedContextWithOptionValidation,
  buildInputRowsFromDefinitions,
  filterInputDefinitionsByContext,
  InputDefinitionCandidate,
} from "@/app/data-entry/enter-data/services/us2.cascadeFiltering.service";
import {
  buildGenerationGroups,
  isGenerationContext,
  isOperationalContext,
} from "@/app/data-entry/enter-data/services/us3.conditionalViews.service";
import { runAggregatedWorkerAsync } from "@/app/data-entry/enter-data/services/aggregated-worker/orchestrator";
import { triggerKpiWorker } from "@/app/data-entry/kpi-worker";

const isGlobalRole = (role: string) => role === "DEV" || role === "BMO";

const mapOption = (id: number, name: string): DataEntryFilterOption => ({
  id,
  name,
});

const getManagedListOptionsByName = async (
  listNamePattern: string,
  parentId?: number | null,
): Promise<DataEntryFilterOption[]> => {
  const conditions = [
    ilike(managedLists.name, `%${listNamePattern}%`),
    eq(managedLists.is_active, true),
    eq(managedListItems.is_active, true),
  ];

  if (parentId != null) {
    conditions.push(eq(managedListItems.parent_id, parentId));
  }

  const rows = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
    })
    .from(managedListItems)
    .leftJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(and(...conditions))
    .orderBy(asc(managedListItems.name));

  return rows.map((row) => mapOption(row.id, row.name));
};

const getManagedListOptionsByNamePatterns = async (
  listNamePatterns: string[],
  parentId?: number | null,
): Promise<DataEntryFilterOption[]> => {
  if (listNamePatterns.length === 0) {
    return [];
  }

  const nameCondition = or(
    ...listNamePatterns.map((pattern) =>
      ilike(managedLists.name, `%${pattern}%`),
    ),
  );

  if (!nameCondition) {
    return [];
  }

  const conditions = [
    nameCondition,
    eq(managedLists.is_active, true),
    eq(managedListItems.is_active, true),
  ];

  if (parentId != null) {
    conditions.push(eq(managedListItems.parent_id, parentId));
  }

  const rows = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
    })
    .from(managedListItems)
    .leftJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(and(...conditions))
    .orderBy(asc(managedListItems.name));

  return rows.map((row) => mapOption(row.id, row.name));
};

const getInputDefinitionsForContext = async (
  context: DataEntryFilterContext,
): Promise<InputDefinitionCandidate[]> => {
  const conditions = [
    and(
      eq(inputDefinitions.is_active, true),
      eq(inputDefinitions.is_aggregated, false),
    ),
  ];

  if (context.inputCategoryId != null) {
    conditions.push(eq(inputDefinitions.category_id, context.inputCategoryId));
  }

  if (context.inputSubcategoryId != null) {
    conditions.push(
      eq(inputDefinitions.subcategory_id, context.inputSubcategoryId),
    );
  }

  const rows = await db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      categoryId: inputDefinitions.category_id,
      subcategoryId: inputDefinitions.subcategory_id,
      dataTypeId: inputDefinitions.data_type_id,
      dataTypeName: managedListItems.name,
      unitName: sql<string | null>`(
        select mli.name
        from managed_list_items mli
        where mli.id = ${inputDefinitions.unit_id}
        limit 1
      )`,
    })
    .from(inputDefinitions)
    .leftJoin(
      managedListItems,
      eq(inputDefinitions.data_type_id, managedListItems.id),
    )
    .where(and(...conditions))
    .orderBy(asc(inputDefinitions.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    subcategoryId: row.subcategoryId,
    dataTypeName: row.dataTypeName,
    dataTypeId: row.dataTypeId,
    unitName: row.unitName,
  }));
};

const getInputRowsForContext = async (
  context: DataEntryFilterContext,
): Promise<DataEntryInputRowView[]> => {
  if (context.reportPeriodId == null) {
    return [];
  }

  const definitions = filterInputDefinitionsByContext(
    await getInputDefinitionsForContext(context),
    context,
  );

  if (definitions.length === 0) {
    return [];
  }

  const definitionIds = definitions.map((definition) => definition.id);
  const entryConditions = [
    eq(dataEntries.report_period_id, context.reportPeriodId),
    inArray(dataEntries.input_def_id, definitionIds),
    eq(dataEntries.is_deleted, false),
  ];

  if (context.serviceAreaId != null) {
    entryConditions.push(
      eq(dataEntries.service_area_id, context.serviceAreaId),
    );
  }

  const entries = await db
    .select({
      id: dataEntries.id,
      inputDefId: dataEntries.input_def_id,
      serviceAreaId: dataEntries.service_area_id,
      value: dataEntries.value,
      comments: dataEntries.comments,
    })
    .from(dataEntries)
    .where(and(...entryConditions));

  const baseRows = buildInputRowsFromDefinitions(definitions, entries, context);

  return baseRows.map((row) => {
    const definition = definitions.find((item) => item.id === row.inputDefId);

    return {
      ...row,
      unitName: definition?.unitName ?? null,
      dataTypeId: definition?.dataTypeId ?? 0,
      controlType: mapDataTypeToControlType(definition?.dataTypeName),
    };
  });
};

const getInputDefinitionRowsForContext = async (
  context: DataEntryFilterContext,
): Promise<DataEntryInputRowView[]> => {
  const definitions = filterInputDefinitionsByContext(
    await getInputDefinitionsForContext(context),
    context,
  );

  return definitions.map((definition) => ({
    inputDefId: definition.id,
    inputName: definition.name,
    unitName: definition.unitName,
    dataTypeId: definition.dataTypeId,
    controlType: mapDataTypeToControlType(definition.dataTypeName),
    value: null,
    comments: null,
  }));
};

const getGenerationGroupsForContext = async (
  user: CurrentUser,
  context: DataEntryFilterContext,
): Promise<DataEntryGeneratorGroupView[]> => {
  if (context.reportPeriodId == null || context.serviceAreaId == null) {
    return [];
  }

  const generatorConditions = [
    eq(energyResources.is_active, true),
    eq(energyResources.is_virtual, false),
    eq(energyResources.service_area_id, context.serviceAreaId),
    eq(energyResources.report_period_id, context.reportPeriodId),
  ];

  if (!isGlobalRole(user.role) && user.org_id != null) {
    generatorConditions.push(eq(energyResources.utility_id, user.org_id));
  }

  const generators = await db
    .select({
      id: energyResources.id,
      name: energyResources.name,
      serviceAreaId: energyResources.service_area_id,
    })
    .from(energyResources)
    .where(and(...generatorConditions))
    .orderBy(asc(energyResources.name));

  if (generators.length === 0) {
    return [];
  }

  const definitionRows = await getInputDefinitionRowsForContext(context);
  if (definitionRows.length === 0) {
    return [];
  }

  const entries = await db
    .select({
      id: dataEntries.id,
      inputDefId: dataEntries.input_def_id,
      energyResourceId: dataEntries.energy_resource_id,
      value: dataEntries.value,
      comments: dataEntries.comments,
    })
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.report_period_id, context.reportPeriodId),
        eq(dataEntries.is_deleted, false),
        inArray(
          dataEntries.input_def_id,
          definitionRows.map((row) => row.inputDefId),
        ),
        inArray(
          dataEntries.energy_resource_id,
          generators.map((generator) => generator.id),
        ),
      ),
    );

  return buildGenerationGroups(generators, definitionRows, entries);
};

const getOverallProgressForContext = async (
  user: CurrentUser,
  context: DataEntryFilterContext,
): Promise<DataEntryProgressSummary> => {
  if (context.reportPeriodId == null) {
    return {
      completedInputs: 0,
      totalInputs: 0,
    };
  }

  const definitionRows = await db
    .select({
      inputDefId: inputDefinitions.id,
      subcategoryName: managedListItems.name,
    })
    .from(inputDefinitions)
    .leftJoin(
      managedListItems,
      eq(inputDefinitions.subcategory_id, managedListItems.id),
    )
    .where(
      and(
        eq(inputDefinitions.is_active, true),
        eq(inputDefinitions.is_aggregated, false),
      ),
    );

  const generationInputDefIds = definitionRows
    .filter((row) => row.subcategoryName?.trim().toLowerCase() === "generation")
    .map((row) => row.inputDefId);
  const nonGenerationInputDefIds = definitionRows
    .filter((row) => row.subcategoryName?.trim().toLowerCase() !== "generation")
    .map((row) => row.inputDefId);

  let generatorIds: number[] = [];

  if (context.serviceAreaId != null && generationInputDefIds.length > 0) {
    const generatorConditions = [
      eq(energyResources.is_active, true),
      eq(energyResources.is_virtual, false),
      eq(energyResources.service_area_id, context.serviceAreaId),
      eq(energyResources.report_period_id, context.reportPeriodId),
    ];

    if (!isGlobalRole(user.role) && user.org_id != null) {
      generatorConditions.push(eq(energyResources.utility_id, user.org_id));
    }

    const generators = await db
      .select({ id: energyResources.id })
      .from(energyResources)
      .where(and(...generatorConditions));

    generatorIds = generators.map((generator) => generator.id);
  }

  const expectedKeys = new Set<string>();

  nonGenerationInputDefIds.forEach((inputDefId) => {
    expectedKeys.add(`${inputDefId}:null`);
  });

  generationInputDefIds.forEach((inputDefId) => {
    generatorIds.forEach((generatorId) => {
      expectedKeys.add(`${inputDefId}:${generatorId}`);
    });
  });

  if (expectedKeys.size === 0) {
    return {
      completedInputs: 0,
      totalInputs: 0,
    };
  }

  const entryConditions = [
    eq(dataEntries.report_period_id, context.reportPeriodId),
    eq(dataEntries.is_deleted, false),
    sql`length(trim(coalesce(${dataEntries.value}, ''))) > 0`,
  ];

  if (context.serviceAreaId == null) {
    entryConditions.push(isNull(dataEntries.service_area_id));
  } else {
    entryConditions.push(
      eq(dataEntries.service_area_id, context.serviceAreaId),
    );
  }

  const completedEntries = await db
    .select({
      inputDefId: dataEntries.input_def_id,
      energyResourceId: dataEntries.energy_resource_id,
    })
    .from(dataEntries)
    .where(and(...entryConditions));

  const completedKeys = new Set<string>();

  completedEntries.forEach((entry) => {
    const key = `${entry.inputDefId}:${entry.energyResourceId ?? "null"}`;

    if (expectedKeys.has(key)) {
      completedKeys.add(key);
    }
  });

  return {
    completedInputs: completedKeys.size,
    totalInputs: expectedKeys.size,
  };
};

export const getReportTypeOptions = async (): Promise<
  DataEntryFilterOption[]
> => {
  return getManagedListOptionsByName("report type");
};

export const getReportPeriodOptions = async (
  user: CurrentUser,
  reportTypeId: number | null,
): Promise<DataEntryFilterOption[]> => {
  if (reportTypeId == null) {
    return [];
  }

  const conditions = [eq(reportPeriods.report_type_id, reportTypeId)];
  if (!isGlobalRole(user.role) && user.org_id != null) {
    conditions.push(eq(reportPeriods.utility_id, user.org_id));
  }

  const rows = await db
    .select({
      id: reportPeriods.id,
      reportDate: reportPeriods.report_date,
    })
    .from(reportPeriods)
    .where(and(...conditions))
    .orderBy(asc(reportPeriods.report_date));

  return rows.map((row) =>
    mapOption(row.id, row.reportDate.toISOString().split("T")[0]),
  );
};

export const getInputCategoryOptions = async (): Promise<
  DataEntryFilterOption[]
> => {
  return getManagedListOptionsByNamePatterns([
    "input categor",
    "data label categor",
  ]);
};

export const getInputSubcategoryOptions = async (
  categoryId: number | null,
): Promise<DataEntryFilterOption[]> => {
  return getManagedListOptionsByNamePatterns(
    ["input subcategor", "data label sub-categor"],
    categoryId,
  );
};

export const getServiceAreaOptions = async (
  user: CurrentUser,
): Promise<DataEntryFilterOption[]> => {
  const conditions = [eq(serviceAreas.is_active, true)];

  if (!isGlobalRole(user.role) && user.org_id != null) {
    conditions.push(eq(serviceAreas.utility_id, user.org_id));
  }

  const rows = await db
    .select({
      id: serviceAreas.id,
      name: serviceAreas.name,
    })
    .from(serviceAreas)
    .where(and(...conditions))
    .orderBy(asc(serviceAreas.name));

  return rows.map((row) => mapOption(row.id, row.name));
};

export const getBaseFilterOptions = async (
  user: CurrentUser,
  context: DataEntryFilterContext,
): Promise<DataEntryFilterOptions> => {
  const [reportTypes, inputCategories, serviceAreasOptions] = await Promise.all(
    [
      getReportTypeOptions(),
      getInputCategoryOptions(),
      getServiceAreaOptions(user),
    ],
  );

  const [reportPeriods, inputSubcategories] = await Promise.all([
    getReportPeriodOptions(user, context.reportTypeId),
    getInputSubcategoryOptions(context.inputCategoryId),
  ]);

  return {
    reportTypes,
    reportPeriods,
    inputCategories,
    inputSubcategories,
    serviceAreas: serviceAreasOptions,
  };
};

export const bootstrapDataEntryFilterContext = async (
  user: CurrentUser,
): Promise<{
  context: DataEntryFilterContext;
  options: DataEntryFilterOptions;
}> => {
  const cookieContext = await getFilterContextFromCookies();

  const baseOptions = await getBaseFilterOptions(user, cookieContext);
  const primaryContext = sanitizePrimaryFilterContext(cookieContext, {
    reportTypes: baseOptions.reportTypes,
    inputCategories: baseOptions.inputCategories,
  });

  const options = await getBaseFilterOptions(user, primaryContext);
  const dependentContext = sanitizeDependentFilterContext(primaryContext, {
    reportPeriods: options.reportPeriods,
    inputSubcategories: options.inputSubcategories,
    serviceAreas: options.serviceAreas,
  });

  const operationalCategoryId = getOperationalCategoryId(
    options.inputCategories,
  );
  const context = applyOperationalVisibilityRule(
    dependentContext,
    operationalCategoryId,
  );

  return {
    context,
    options,
  };
};

const toPageModel = (
  context: DataEntryFilterContext,
  options: DataEntryFilterOptions,
  progress: DataEntryProgressSummary,
  inputs: DataEntryPageViewModel["inputs"],
): DataEntryPageViewModel => {
  const showServiceAreaSelector = isOperationalContext(
    context,
    options.inputCategories,
  );
  const generationMode = isGenerationContext(
    context,
    options.inputSubcategories,
  );

  return {
    context,
    options,
    progress,
    ui: {
      showServiceAreaSelector,
      generationMode,
    },
    inputs,
  };
};

export const getDataEntryFilterViewModel =
  async (): Promise<DataEntryPageViewModel> => {
    const user = await getCurrentUser();
    const { context, options } = await bootstrapDataEntryFilterContext(user);
    const progress = await getOverallProgressForContext(user, context);

    if (
      isGenerationContext(context, options.inputSubcategories) &&
      context.serviceAreaId != null
    ) {
      const groups = await getGenerationGroupsForContext(user, context);

      return toPageModel(context, options, progress, {
        mode: "grouped-by-generator",
        groups,
      });
    }

    const inputRows = await getInputRowsForContext(context);

    return toPageModel(context, options, progress, {
      mode: "flat",
      rows: inputRows,
    });
  };

export const updateFilterContextAction = async (
  key: keyof DataEntryFilterContext,
  value: number | null,
) => {
  const currentContext = await getFilterContextFromCookies();
  const user = await getCurrentUser();

  const tentativeContext = {
    ...currentContext,
    [key]: value,
  };

  const options = await getBaseFilterOptions(user, tentativeContext);
  const nextContext = applyCascadedContextWithOptionValidation(
    currentContext,
    key,
    value,
    {
      reportPeriods: options.reportPeriods,
      inputSubcategories: options.inputSubcategories,
      serviceAreas: options.serviceAreas,
    },
  );

  await saveFilterContextToCookies(nextContext);

  revalidatePath("/data-entry/enter-data");
};

interface UpdateDataEntryValuePayload {
  inputDefId: number;
  value: string | null;
  energyResourceId?: number | null;
  customerTypeId?: number | null;
  paymentModeId?: number | null;
}

const normalizeDataEntryValue = (value: string | null): string | null => {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const updateDataEntryValueAction = async (
  payload: UpdateDataEntryValuePayload,
) => {
  const user = await getCurrentUser();
  const { context, options } = await bootstrapDataEntryFilterContext(user);

  if (context.reportPeriodId == null) {
    throw new Error("A report period is required before saving data entries.");
  }

  const definitions = filterInputDefinitionsByContext(
    await getInputDefinitionsForContext(context),
    context,
  );
  const validInputDefIds = new Set(
    definitions.map((definition) => definition.id),
  );

  if (!validInputDefIds.has(payload.inputDefId)) {
    throw new Error("The selected input is not valid for the active context.");
  }

  const generationMode = isGenerationContext(
    context,
    options.inputSubcategories,
  );
  const energyResourceId = generationMode
    ? (payload.energyResourceId ?? null)
    : null;

  if (generationMode && energyResourceId == null) {
    throw new Error("Generation mode requires a generator to save values.");
  }

  const existingConditions = [
    eq(dataEntries.report_period_id, context.reportPeriodId),
    eq(dataEntries.input_def_id, payload.inputDefId),
  ];

  if (context.serviceAreaId == null) {
    existingConditions.push(isNull(dataEntries.service_area_id));
  } else {
    existingConditions.push(
      eq(dataEntries.service_area_id, context.serviceAreaId),
    );
  }

  if (energyResourceId == null) {
    existingConditions.push(isNull(dataEntries.energy_resource_id));
  } else {
    existingConditions.push(
      eq(dataEntries.energy_resource_id, energyResourceId),
    );
  }

  const [existing] = await db
    .select({ id: dataEntries.id })
    .from(dataEntries)
    .where(and(...existingConditions))
    .limit(1);

  let energyMetadata: {
    energySourceId: number;
    energyTypeId: number;
    energyProviderId: number;
  } | null = null;

  if (energyResourceId != null) {
    const [resource] = await db
      .select({
        energySourceId: energyResources.energy_source_id,
        energyTypeId: energyResources.energy_type_id,
        energyProviderId: energyResources.energy_provider_id,
      })
      .from(energyResources)
      .where(eq(energyResources.id, energyResourceId))
      .limit(1);

    if (!resource) {
      throw new Error("Selected generator metadata could not be resolved.");
    }

    energyMetadata = resource;
  }

  const values = {
    report_period_id: context.reportPeriodId,
    input_def_id: payload.inputDefId,
    service_area_id: context.serviceAreaId,
    energy_resource_id: energyResourceId,
    value: normalizeDataEntryValue(payload.value),
    status_id: DataEntryStatusId.Entered,
    energy_source_id: energyMetadata?.energySourceId,
    energy_type_id: energyMetadata?.energyTypeId,
    energy_provider_id: energyMetadata?.energyProviderId,
    customer_type_id: payload.customerTypeId,
    payment_mode_id: payload.paymentModeId,
    is_deleted: false,
    updated_at: new Date(),
    updated_by_id: user.id,
  };

  let sourceDataEntryId = existing?.id ?? null;

  if (existing) {
    await db
      .update(dataEntries)
      .set(values)
      .where(eq(dataEntries.id, existing.id));
  } else {
    const [inserted] = await db
      .insert(dataEntries)
      .values(values)
      .returning({ id: dataEntries.id });
    sourceDataEntryId = inserted?.id ?? null;
  }

  runAggregatedWorkerAsync(user, {
    reportPeriodId: context.reportPeriodId,
    serviceAreaId: context.serviceAreaId,
    energyResourceId,
  });

  if (sourceDataEntryId) {
    await triggerKpiWorker(
      {
        sourceDataEntryId,
        inputDefId: payload.inputDefId,
        triggeredByUserId: user.id,
        scope: {
          reportPeriodId: context.reportPeriodId,
          organizationId: user.org_id,
          serviceAreaId: context.serviceAreaId,
          energyResourceId,
          energyProviderId: energyMetadata?.energyProviderId ?? null,
          energyTypeId: energyMetadata?.energyTypeId ?? null,
          energySourceId: energyMetadata?.energySourceId ?? null,
          customerTypeId: payload.customerTypeId ?? null,
          paymentModeId: payload.paymentModeId ?? null,
        },
      },
      user,
    );
  }

  revalidatePath("/data-entry/enter-data");
};
