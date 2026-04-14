"use server";

import { roles, user as authUser } from "@/db/schema/auth-schema";

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
  DataEntryKpiWorkerSnapshot,
  DataEntryProgressSummary,
  DataEntryPageViewModel,
  DataEntryTariffPaymentModeGroupView,
} from "@/app/data-entry/types";
import { db } from "@/db/connection";
import {
  dataEntries,
  DataEntryComment,
  DataEntryStatusId,
  generationRelevance,
  inputDefinitions,
  inputRelevance,
} from "@/db/schema/dataEntry";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { energyResources, serviceAreas } from "@/db/schema/utility";
import { CurrentUser, getCurrentUser } from "@/lib/user.service";
import {
  getOperationalCategoryId,
  sanitizeDependentFilterContext,
  sanitizePrimaryFilterContext,
} from "@/app/data-entry/enter-data/services/us1.contextPersistence.service";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
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
  isTariffContext,
} from "@/app/data-entry/enter-data/services/us3.conditionalViews.service";
import { runAggregatedWorkerAsync } from "@/app/data-entry/enter-data/services/aggregated-worker/orchestrator";
import {
  listKpiWorkerStatuses,
  triggerKpiWorker,
  type KpiWorkerRunResult,
} from "@/app/data-entry/kpi-worker";

const isGlobalRole = (role: string) => role === "DEV" || role === "BMO";

const mapOption = (id: number, name: string): DataEntryFilterOption => ({
  id,
  name,
});

const isAllLikeOption = (name: string): boolean => {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === "all" ||
    normalized === "all options" ||
    normalized.startsWith("all ")
  );
};

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
      eq(inputDefinitions.is_system_generated, false),
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
      subcategoryName: sql<string | null>`(
        select mli.name
        from managed_list_items mli
        where mli.id = ${inputDefinitions.subcategory_id}
        limit 1
      )`,
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

  return rows
    .filter(
      (row) => row.subcategoryName?.trim().toLowerCase() !== "country context",
    )
    .map((row) => ({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      subcategoryId: row.subcategoryId,
      dataTypeName: row.dataTypeName,
      dataTypeId: row.dataTypeId,
      unitName: row.unitName,
    }));
};

const isServiceAreaScopedByDefinition = (
  categoryName: string | null,
  subcategoryName: string | null,
): boolean => {
  const normalizedCategory = categoryName?.trim().toLowerCase() ?? "";
  const normalizedSubcategory = subcategoryName?.trim().toLowerCase() ?? "";

  return (
    normalizedCategory === "operation" ||
    normalizedCategory === "operational" ||
    normalizedSubcategory === "tariff structure"
  );
};

const getServiceAreaScopedInputDefinitionIds = async (
  inputDefinitionIds: number[],
): Promise<Set<number>> => {
  if (inputDefinitionIds.length === 0) {
    return new Set<number>();
  }

  const rows = await db
    .select({
      id: inputDefinitions.id,
      categoryName: sql<string | null>`(
        select mli.name
        from managed_list_items mli
        where mli.id = ${inputDefinitions.category_id}
        limit 1
      )`,
      subcategoryName: sql<string | null>`(
        select mli.name
        from managed_list_items mli
        where mli.id = ${inputDefinitions.subcategory_id}
        limit 1
      )`,
    })
    .from(inputDefinitions)
    .where(inArray(inputDefinitions.id, inputDefinitionIds));

  return new Set(
    rows
      .filter((row) =>
        isServiceAreaScopedByDefinition(row.categoryName, row.subcategoryName),
      )
      .map((row) => row.id),
  );
};

const getIrrelevantInputDefinitionIdsForContext = async (
  context: DataEntryFilterContext,
  inputDefinitionIds: number[],
  serviceAreaScopedInputDefinitionIds: Set<number>,
): Promise<Set<number>> => {
  if (context.reportPeriodId == null || inputDefinitionIds.length === 0) {
    return new Set<number>();
  }

  const relevanceConditions = [
    eq(dataEntries.report_period_id, context.reportPeriodId),
    inArray(dataEntries.input_def_id, inputDefinitionIds),
    eq(dataEntries.is_deleted, false),
    eq(dataEntries.is_relevant, false),
  ];

  const relevantRows = await db
    .select({
      inputDefId: dataEntries.input_def_id,
      serviceAreaId: dataEntries.service_area_id,
    })
    .from(dataEntries)
    .where(and(...relevanceConditions));

  const irrelevantIds = new Set<number>();

  relevantRows.forEach((row) => {
    const isScoped = serviceAreaScopedInputDefinitionIds.has(row.inputDefId);
    const targetServiceAreaId = isScoped ? context.serviceAreaId : null;

    if (targetServiceAreaId == null) {
      if (row.serviceAreaId == null) {
        irrelevantIds.add(row.inputDefId);
      }
      return;
    }

    if (row.serviceAreaId === targetServiceAreaId) {
      irrelevantIds.add(row.inputDefId);
    }
  });

  return irrelevantIds;
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

  const serviceAreaScopedInputDefinitionIds =
    await getServiceAreaScopedInputDefinitionIds(
      definitions.map((definition) => definition.id),
    );

  const irrelevantInputDefinitionIds =
    await getIrrelevantInputDefinitionIdsForContext(
      context,
      definitions.map((definition) => definition.id),
      serviceAreaScopedInputDefinitionIds,
    );
  const relevantDefinitions = definitions.filter(
    (definition) => !irrelevantInputDefinitionIds.has(definition.id),
  );

  if (relevantDefinitions.length === 0) {
    return [];
  }

  const definitionIds = relevantDefinitions.map((definition) => definition.id);
  const entryConditions = [
    eq(dataEntries.report_period_id, context.reportPeriodId),
    inArray(dataEntries.input_def_id, definitionIds),
    eq(dataEntries.is_deleted, false),
    eq(dataEntries.is_relevant, true),
  ];

  const entries = await db
    .select({
      id: dataEntries.id,
      inputDefId: dataEntries.input_def_id,
      serviceAreaId: dataEntries.service_area_id,
      statusId: dataEntries.status_id,
      updatedByName: authUser.name,
      updatedByRole: roles.name,
      updatedAt: dataEntries.updatedAt,
      value: dataEntries.value,
      comments: dataEntries.comments,
    })
    .from(dataEntries)
    .leftJoin(authUser, eq(dataEntries.updatedById, authUser.id))
    .leftJoin(roles, eq(authUser.role_id, roles.id))
    .where(and(...entryConditions));

  const baseRows = buildInputRowsFromDefinitions(
    relevantDefinitions,
    entries,
    context,
    serviceAreaScopedInputDefinitionIds,
  );

  return baseRows.map((row) => {
    const definition = relevantDefinitions.find(
      (item) => item.id === row.inputDefId,
    );

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

  const serviceAreaScopedInputDefinitionIds =
    await getServiceAreaScopedInputDefinitionIds(
      definitions.map((definition) => definition.id),
    );

  const irrelevantInputDefinitionIds =
    await getIrrelevantInputDefinitionIdsForContext(
      context,
      definitions.map((definition) => definition.id),
      serviceAreaScopedInputDefinitionIds,
    );
  const relevantDefinitions = definitions.filter(
    (definition) => !irrelevantInputDefinitionIds.has(definition.id),
  );

  return relevantDefinitions.map((definition) => ({
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
      energyProviderId: energyResources.energy_provider_id,
      energySourceId: energyResources.energy_source_id,
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

  const generationRelevanceRows = await db
    .select({
      inputDefId: generationRelevance.input_def_id,
      energyProviderId: generationRelevance.energy_provider_id,
      energySourceId: generationRelevance.energy_source_id,
      isRelevant: generationRelevance.is_relevant,
    })
    .from(generationRelevance)
    .where(
      and(
        eq(generationRelevance.report_period_id, context.reportPeriodId),
        eq(generationRelevance.service_area_id, context.serviceAreaId),
        eq(generationRelevance.is_deleted, false),
        inArray(
          generationRelevance.input_def_id,
          definitionRows.map((row) => row.inputDefId),
        ),
        inArray(
          generationRelevance.energy_provider_id,
          generators.map((generator) => generator.energyProviderId),
        ),
        inArray(
          generationRelevance.energy_source_id,
          generators.map((generator) => generator.energySourceId),
        ),
      ),
    )
    .orderBy(desc(generationRelevance.updatedAt));

  const relevanceByDimension = new Map<string, boolean>();

  for (const row of generationRelevanceRows) {
    const key = `${row.inputDefId}:${row.energyProviderId}:${row.energySourceId}`;

    if (relevanceByDimension.has(key)) {
      continue;
    }

    relevanceByDimension.set(key, row.isRelevant);
  }

  const inputRelevanceRows = await db
    .select({
      id: inputRelevance.id,
      inputDefId: inputRelevance.input_def_id,
      dimensionId: inputRelevance.dimension_id,
      isRelevant: inputRelevance.is_relevant,
    })
    .from(inputRelevance)
    .where(
      and(
        inArray(
          inputRelevance.input_def_id,
          definitionRows.map((row) => row.inputDefId),
        ),
        inArray(
          inputRelevance.dimension_id,
          generators.map((generator) => generator.energySourceId),
        ),
      ),
    )
    .orderBy(desc(inputRelevance.id));

  const sourceRelevanceByDimension = new Map<string, boolean>();

  for (const row of inputRelevanceRows) {
    const key = `${row.inputDefId}:${row.dimensionId}`;

    if (sourceRelevanceByDimension.has(key)) {
      continue;
    }

    sourceRelevanceByDimension.set(key, row.isRelevant);
  }

  const entries = await db
    .select({
      id: dataEntries.id,
      inputDefId: dataEntries.input_def_id,
      energyResourceId: dataEntries.energy_resource_id,
      statusId: dataEntries.status_id,
      updatedByName: authUser.name,
      updatedByRole: roles.name,
      updatedAt: dataEntries.updatedAt,
      value: dataEntries.value,
      comments: dataEntries.comments,
    })
    .from(dataEntries)
    .leftJoin(authUser, eq(dataEntries.updatedById, authUser.id))
    .leftJoin(roles, eq(authUser.role_id, roles.id))
    .where(
      and(
        eq(dataEntries.report_period_id, context.reportPeriodId),
        eq(dataEntries.is_deleted, false),
        eq(dataEntries.is_relevant, true),
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

  return buildGenerationGroups(
    generators,
    definitionRows,
    entries,
    (generator, definition) => {
      const generationKey = `${definition.inputDefId}:${generator.energyProviderId}:${generator.energySourceId}`;
      const sourceKey = `${definition.inputDefId}:${generator.energySourceId}`;

      const isGenerationRelevant =
        relevanceByDimension.get(generationKey) ?? true;
      const isSourceRelevant =
        sourceRelevanceByDimension.get(sourceKey) ?? true;

      return isGenerationRelevant && isSourceRelevant;
    },
    true,
  );
};

const isTariffSubcategorySelected = async (
  context: DataEntryFilterContext,
  options: DataEntryFilterOptions,
): Promise<boolean> => {
  if (isTariffContext(context, options.inputSubcategories)) {
    return true;
  }

  if (context.inputSubcategoryId == null) {
    return false;
  }

  const [selectedSubcategory] = await db
    .select({ name: managedListItems.name })
    .from(managedListItems)
    .where(eq(managedListItems.id, context.inputSubcategoryId))
    .limit(1);

  return selectedSubcategory?.name?.trim().toLowerCase() === "tariff structure";
};

const getTariffGroupsForContext = async (
  context: DataEntryFilterContext,
): Promise<DataEntryTariffPaymentModeGroupView[]> => {
  if (context.reportPeriodId == null || context.serviceAreaId == null) {
    return [];
  }

  const definitions = filterInputDefinitionsByContext(
    await getInputDefinitionsForContext(context),
    context,
  );

  if (definitions.length === 0) {
    return [];
  }

  const relevantDefinitions = definitions;

  const paymentModes = (
    await getManagedListOptionsByName("payment mode")
  ).filter((option) => !isAllLikeOption(option.name));
  const customerTypes = (
    await getManagedListOptionsByName("customer type")
  ).filter((option) => !isAllLikeOption(option.name));

  if (paymentModes.length === 0 || customerTypes.length === 0) {
    return [];
  }

  const entries = await db
    .select({
      id: dataEntries.id,
      inputDefId: dataEntries.input_def_id,
      paymentModeId: dataEntries.payment_mode_id,
      customerTypeId: dataEntries.customer_type_id,
      isRelevant: dataEntries.is_relevant,
      statusId: dataEntries.status_id,
      updatedByName: authUser.name,
      updatedByRole: roles.name,
      updatedAt: dataEntries.updatedAt,
      value: dataEntries.value,
      comments: dataEntries.comments,
    })
    .from(dataEntries)
    .leftJoin(authUser, eq(dataEntries.updatedById, authUser.id))
    .leftJoin(roles, eq(authUser.role_id, roles.id))
    .where(
      and(
        eq(dataEntries.report_period_id, context.reportPeriodId),
        eq(dataEntries.service_area_id, context.serviceAreaId),
        eq(dataEntries.is_deleted, false),
        isNull(dataEntries.energy_resource_id),
        inArray(
          dataEntries.input_def_id,
          relevantDefinitions.map((definition) => definition.id),
        ),
        inArray(
          dataEntries.payment_mode_id,
          paymentModes.map((paymentMode) => paymentMode.id),
        ),
        inArray(
          dataEntries.customer_type_id,
          customerTypes.map((customerType) => customerType.id),
        ),
      ),
    )
    .orderBy(desc(dataEntries.updatedAt));

  const entryByKey = new Map<
    string,
    {
      id: string;
      isRelevant: boolean;
      statusId: number | null;
      updatedByName: string | null;
      updatedByRole: string | null;
      updatedAt: Date | null;
      value: string | null;
      comments: DataEntryComment[] | null;
    }
  >();

  for (const entry of entries) {
    if (entry.paymentModeId == null || entry.customerTypeId == null) {
      continue;
    }

    const key = `${entry.inputDefId}:${entry.paymentModeId}:${entry.customerTypeId}`;
    if (entryByKey.has(key)) {
      continue;
    }

    entryByKey.set(key, {
      id: entry.id,
      isRelevant: entry.isRelevant,
      statusId: entry.statusId,
      updatedByName: entry.updatedByName,
      updatedByRole: entry.updatedByRole,
      updatedAt: entry.updatedAt,
      value: entry.value,
      comments: entry.comments,
    });
  }

  return paymentModes.map((paymentMode) => ({
    paymentModeId: paymentMode.id,
    paymentModeName: paymentMode.name,
    customerTypeGroups: customerTypes.map((customerType) => ({
      customerTypeId: customerType.id,
      customerTypeName: customerType.name,
      rows: relevantDefinitions
        .filter((definition) => {
          const key = `${definition.id}:${paymentMode.id}:${customerType.id}`;
          const latestEntry = entryByKey.get(key);

          return latestEntry?.isRelevant !== false;
        })
        .map((definition) => {
          const key = `${definition.id}:${paymentMode.id}:${customerType.id}`;
          const entry = entryByKey.get(key);

          return {
            dataEntryId: entry?.id,
            inputDefId: definition.id,
            energyResourceId: null,
            paymentModeId: paymentMode.id,
            paymentModeName: paymentMode.name,
            customerTypeId: customerType.id,
            customerTypeName: customerType.name,
            inputName: definition.name,
            unitName: definition.unitName,
            dataTypeId: definition.dataTypeId,
            controlType: mapDataTypeToControlType(definition.dataTypeName),
            isDataNotAvailable:
              entry?.statusId === DataEntryStatusId.DataNotAvailable,
            updatedByName: entry?.updatedByName ?? null,
            updatedByRole: entry?.updatedByRole ?? null,
            updatedAt: entry?.updatedAt?.toISOString() ?? null,
            value: entry?.value ?? null,
            comments: entry?.comments ? JSON.stringify(entry.comments) : null,
          };
        }),
    })),
  }));
};

const getOverallProgressForContext = async (
  user: CurrentUser,
  context: DataEntryFilterContext,
): Promise<DataEntryProgressSummary> => {
  if (context.reportPeriodId == null) {
    return {
      completedInputs: 0,
      totalInputs: 0,
      breakdown: [],
    };
  }

  const definitionRows = await db
    .select({
      inputDefId: inputDefinitions.id,
      categoryName: sql<string | null>`(
        select mli.name
        from managed_list_items mli
        where mli.id = ${inputDefinitions.category_id}
        limit 1
      )`,
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
        eq(inputDefinitions.is_system_generated, false),
        sql`lower(${managedListItems.name}) <> 'country context'`,
      ),
    );

  const generationInputDefIds = definitionRows
    .filter((row) => row.subcategoryName?.trim().toLowerCase() === "generation")
    .map((row) => row.inputDefId);
  const nonGenerationInputDefIds = definitionRows
    .filter((row) => row.subcategoryName?.trim().toLowerCase() !== "generation")
    .map((row) => row.inputDefId);

  const serviceAreaScopedInputDefinitionIds = new Set(
    definitionRows
      .filter((row) =>
        isServiceAreaScopedByDefinition(row.categoryName, row.subcategoryName),
      )
      .map((row) => row.inputDefId),
  );

  const serviceAreaConditions = [eq(serviceAreas.is_active, true)];
  if (!isGlobalRole(user.role) && user.org_id != null) {
    serviceAreaConditions.push(eq(serviceAreas.utility_id, user.org_id));
  }

  const serviceAreaRows = await db
    .select({ id: serviceAreas.id })
    .from(serviceAreas)
    .where(and(...serviceAreaConditions));
  const serviceAreaIds = serviceAreaRows.map((row) => row.id);

  const irrelevantRows = await db
    .select({
      inputDefId: dataEntries.input_def_id,
      serviceAreaId: dataEntries.service_area_id,
    })
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.report_period_id, context.reportPeriodId),
        eq(dataEntries.is_deleted, false),
        eq(dataEntries.is_relevant, false),
        inArray(
          dataEntries.input_def_id,
          definitionRows.map((row) => row.inputDefId),
        ),
      ),
    );

  const irrelevantByServiceArea = new Map<number | null, Set<number>>();
  irrelevantRows.forEach((row) => {
    const existing =
      irrelevantByServiceArea.get(row.serviceAreaId) ?? new Set<number>();
    existing.add(row.inputDefId);
    irrelevantByServiceArea.set(row.serviceAreaId, existing);
  });

  const generatorConditions = [
    eq(energyResources.is_active, true),
    eq(energyResources.is_virtual, false),
    eq(energyResources.report_period_id, context.reportPeriodId),
  ];

  if (!isGlobalRole(user.role) && user.org_id != null) {
    generatorConditions.push(eq(energyResources.utility_id, user.org_id));
  }

  const generators = await db
    .select({
      id: energyResources.id,
      serviceAreaId: energyResources.service_area_id,
    })
    .from(energyResources)
    .where(and(...generatorConditions));

  const expectedKeys = new Set<string>();

  nonGenerationInputDefIds.forEach((inputDefId) => {
    const isScoped = serviceAreaScopedInputDefinitionIds.has(inputDefId);
    const scopedServiceAreaIds = isScoped ? serviceAreaIds : [null];

    scopedServiceAreaIds.forEach((serviceAreaId) => {
      const irrelevantForScope =
        irrelevantByServiceArea.get(serviceAreaId) ?? new Set<number>();

      if (irrelevantForScope.has(inputDefId)) {
        return;
      }

      expectedKeys.add(`${inputDefId}:${serviceAreaId}:null`);
    });
  });

  generators.forEach((generator) => {
    const irrelevantForServiceArea =
      irrelevantByServiceArea.get(generator.serviceAreaId) ?? new Set<number>();

    generationInputDefIds.forEach((inputDefId) => {
      if (irrelevantForServiceArea.has(inputDefId)) {
        return;
      }

      expectedKeys.add(
        `${inputDefId}:${generator.serviceAreaId}:${generator.id}`,
      );
    });
  });

  if (expectedKeys.size === 0) {
    return {
      completedInputs: 0,
      totalInputs: 0,
      breakdown: [],
    };
  }

  const inputDefinitionMeta = new Map<
    number,
    { categoryName: string; subcategoryName: string }
  >();

  definitionRows.forEach((row) => {
    inputDefinitionMeta.set(row.inputDefId, {
      categoryName: row.categoryName?.trim() || "Uncategorized",
      subcategoryName: row.subcategoryName?.trim() || "Unspecified",
    });
  });

  const entryConditions = [
    eq(dataEntries.report_period_id, context.reportPeriodId),
    eq(dataEntries.is_deleted, false),
    eq(dataEntries.is_relevant, true),
    or(
      sql`length(trim(coalesce(${dataEntries.value}, ''))) > 0`,
      eq(dataEntries.status_id, DataEntryStatusId.DataNotAvailable),
    ),
  ];

  const completedEntries = await db
    .select({
      inputDefId: dataEntries.input_def_id,
      serviceAreaId: dataEntries.service_area_id,
      energyResourceId: dataEntries.energy_resource_id,
    })
    .from(dataEntries)
    .where(and(...entryConditions));

  const completedKeys = new Set<string>();

  completedEntries.forEach((entry) => {
    const key = `${entry.inputDefId}:${entry.serviceAreaId ?? "null"}:${entry.energyResourceId ?? "null"}`;

    if (expectedKeys.has(key)) {
      completedKeys.add(key);
    }
  });

  const breakdownMap = new Map<
    string,
    {
      categoryName: string;
      subcategoryName: string;
      completedInputs: number;
      totalInputs: number;
    }
  >();

  expectedKeys.forEach((expectedKey) => {
    const inputDefId = Number.parseInt(expectedKey.split(":")[0] ?? "", 10);
    if (!Number.isFinite(inputDefId)) {
      return;
    }

    const meta = inputDefinitionMeta.get(inputDefId);
    if (!meta) {
      return;
    }

    const bucketKey = `${meta.categoryName}::${meta.subcategoryName}`;
    const existing = breakdownMap.get(bucketKey) ?? {
      categoryName: meta.categoryName,
      subcategoryName: meta.subcategoryName,
      completedInputs: 0,
      totalInputs: 0,
    };

    existing.totalInputs += 1;
    if (completedKeys.has(expectedKey)) {
      existing.completedInputs += 1;
    }

    breakdownMap.set(bucketKey, existing);
  });

  const breakdown = Array.from(breakdownMap.values()).sort((a, b) => {
    const byCategory = a.categoryName.localeCompare(b.categoryName);
    if (byCategory !== 0) {
      return byCategory;
    }

    return a.subcategoryName.localeCompare(b.subcategoryName);
  });

  return {
    completedInputs: completedKeys.size,
    totalInputs: expectedKeys.size,
    breakdown,
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
    mapOption(row.id, row.reportDate.toISOString().slice(0, 7)),
  );
};

export const getInputCategoryOptions = async (): Promise<
  DataEntryFilterOption[]
> => {
  const categories = await getManagedListOptionsByNamePatterns([
    "input categor",
    "data label categor",
  ]);

  return categories.filter((category) => !isAllLikeOption(category.name));
};

export const getInputSubcategoryOptions = async (
  categoryId: number | null,
): Promise<DataEntryFilterOption[]> => {
  const subcategories = await getManagedListOptionsByNamePatterns(
    ["input subcategor", "data label sub-categor"],
    categoryId,
  );

  return subcategories.filter(
    (subcategory) =>
      subcategory.name.trim().toLowerCase() !== "country context" &&
      !isAllLikeOption(subcategory.name),
  );
};

export const getServiceAreaOptions = async (
  user: CurrentUser,
): Promise<DataEntryFilterOption[]> => {
  const conditions = [
    eq(serviceAreas.is_active, true),
    sql`lower(${serviceAreas.name}) not like '%utility%'`,
  ];

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
  const operationalContext = applyOperationalVisibilityRule(
    dependentContext,
    operationalCategoryId,
  );

  const tariffContext = isTariffContext(
    dependentContext,
    options.inputSubcategories,
  );

  const context = tariffContext ? dependentContext : operationalContext;

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
  kpiWorker: DataEntryKpiWorkerSnapshot,
): DataEntryPageViewModel => {
  const showServiceAreaSelector =
    isOperationalContext(context, options.inputCategories) ||
    isTariffContext(context, options.inputSubcategories);
  const generationMode = isGenerationContext(
    context,
    options.inputSubcategories,
  );

  return {
    context,
    options,
    progress,
    kpiWorker,
    ui: {
      showServiceAreaSelector,
      generationMode,
    },
    inputs,
  };
};

const getLatestKpiFailureForContext = async (
  context: DataEntryFilterContext,
): Promise<DataEntryKpiWorkerSnapshot> => {
  if (context.reportPeriodId == null) {
    return {
      latestFailureReason: null,
      latestFailureUpdatedAt: null,
    };
  }

  try {
    const attempts = await listKpiWorkerStatuses({
      reportPeriodId: context.reportPeriodId,
      serviceAreaId: context.serviceAreaId,
      energyResourceId: null,
    });

    const latestFailure = attempts.find(
      (attempt) =>
        attempt.status === "failed" &&
        typeof attempt.failureReason === "string" &&
        attempt.failureReason.trim().length > 0,
    );

    return {
      latestFailureReason: latestFailure?.failureReason ?? null,
      latestFailureUpdatedAt: latestFailure?.updatedAt ?? null,
    };
  } catch {
    return {
      latestFailureReason: null,
      latestFailureUpdatedAt: null,
    };
  }
};

export const getDataEntryFilterViewModel =
  async (): Promise<DataEntryPageViewModel> => {
    const user = await getCurrentUser();
    const { context, options } = await bootstrapDataEntryFilterContext(user);
    const progress = await getOverallProgressForContext(user, context);
    const kpiWorker = await getLatestKpiFailureForContext(context);

    if (
      isGenerationContext(context, options.inputSubcategories) &&
      context.serviceAreaId != null
    ) {
      const groups = await getGenerationGroupsForContext(user, context);

      return toPageModel(
        context,
        options,
        progress,
        {
          mode: "grouped-by-generator",
          groups,
        },
        kpiWorker,
      );
    }

    if (
      (await isTariffSubcategorySelected(context, options)) &&
      context.serviceAreaId != null
    ) {
      const groups = await getTariffGroupsForContext(context);

      return toPageModel(
        context,
        options,
        progress,
        {
          mode: "grouped-by-payment-mode",
          groups,
        },
        kpiWorker,
      );
    }

    const inputRows = await getInputRowsForContext(context);

    return toPageModel(
      context,
      options,
      progress,
      {
        mode: "flat",
        rows: inputRows,
      },
      kpiWorker,
    );
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

interface UpdateDataEntryCommentPayload {
  inputDefId: number;
  comment: string;
  energyResourceId?: number | null;
  customerTypeId?: number | null;
  paymentModeId?: number | null;
}

interface UpdateDataEntryAvailabilityPayload {
  inputDefId: number;
  isDataNotAvailable: boolean;
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
): Promise<{ kpiRunResult: KpiWorkerRunResult | null }> => {
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

  const serviceAreaScopedInputDefinitionIds =
    await getServiceAreaScopedInputDefinitionIds([payload.inputDefId]);
  const scopedServiceAreaId = serviceAreaScopedInputDefinitionIds.has(
    payload.inputDefId,
  )
    ? context.serviceAreaId
    : null;

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

  if (scopedServiceAreaId == null) {
    existingConditions.push(isNull(dataEntries.service_area_id));
  } else {
    existingConditions.push(
      eq(dataEntries.service_area_id, scopedServiceAreaId),
    );
  }

  if (energyResourceId == null) {
    existingConditions.push(isNull(dataEntries.energy_resource_id));
  } else {
    existingConditions.push(
      eq(dataEntries.energy_resource_id, energyResourceId),
    );
  }

  if (payload.customerTypeId == null) {
    existingConditions.push(isNull(dataEntries.customer_type_id));
  } else {
    existingConditions.push(
      eq(dataEntries.customer_type_id, payload.customerTypeId),
    );
  }

  if (payload.paymentModeId == null) {
    existingConditions.push(isNull(dataEntries.payment_mode_id));
  } else {
    existingConditions.push(
      eq(dataEntries.payment_mode_id, payload.paymentModeId),
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
    service_area_id: scopedServiceAreaId,
    energy_resource_id: energyResourceId,
    value: normalizeDataEntryValue(payload.value),
    status_id: DataEntryStatusId.Entered,
    energy_source_id: energyMetadata?.energySourceId,
    energy_type_id: energyMetadata?.energyTypeId,
    energy_provider_id: energyMetadata?.energyProviderId,
    customer_type_id: payload.customerTypeId,
    payment_mode_id: payload.paymentModeId,
    is_deleted: false,
    updatedAt: new Date(),
    updatedById: user.id,
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
    serviceAreaId: scopedServiceAreaId,
    energyResourceId,
  });

  let kpiRunResult: KpiWorkerRunResult | null = null;

  if (sourceDataEntryId) {
    kpiRunResult = await triggerKpiWorker(
      {
        sourceDataEntryId,
        inputDefId: payload.inputDefId,
        triggeredByUserId: user.id,
        scope: {
          reportPeriodId: context.reportPeriodId,
          organizationId: user.org_id,
          serviceAreaId: scopedServiceAreaId,
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

  return {
    kpiRunResult,
  };
};

export const updateDataEntryCommentAction = async (
  payload: UpdateDataEntryCommentPayload,
): Promise<void> => {
  const user = await getCurrentUser();
  const { context, options } = await bootstrapDataEntryFilterContext(user);

  if (context.reportPeriodId == null) {
    throw new Error("A report period is required before saving comments.");
  }

  const normalizedComment = payload.comment.trim();
  if (normalizedComment.length === 0) {
    throw new Error("A comment is required.");
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

  const serviceAreaScopedInputDefinitionIds =
    await getServiceAreaScopedInputDefinitionIds([payload.inputDefId]);
  const scopedServiceAreaId = serviceAreaScopedInputDefinitionIds.has(
    payload.inputDefId,
  )
    ? context.serviceAreaId
    : null;

  const generationMode = isGenerationContext(
    context,
    options.inputSubcategories,
  );
  const energyResourceId = generationMode
    ? (payload.energyResourceId ?? null)
    : null;

  if (generationMode && energyResourceId == null) {
    throw new Error("Generation mode requires a generator to save comments.");
  }

  const existingConditions = [
    eq(dataEntries.report_period_id, context.reportPeriodId),
    eq(dataEntries.input_def_id, payload.inputDefId),
  ];

  if (scopedServiceAreaId == null) {
    existingConditions.push(isNull(dataEntries.service_area_id));
  } else {
    existingConditions.push(
      eq(dataEntries.service_area_id, scopedServiceAreaId),
    );
  }

  if (energyResourceId == null) {
    existingConditions.push(isNull(dataEntries.energy_resource_id));
  } else {
    existingConditions.push(
      eq(dataEntries.energy_resource_id, energyResourceId),
    );
  }

  if (payload.customerTypeId == null) {
    existingConditions.push(isNull(dataEntries.customer_type_id));
  } else {
    existingConditions.push(
      eq(dataEntries.customer_type_id, payload.customerTypeId),
    );
  }

  if (payload.paymentModeId == null) {
    existingConditions.push(isNull(dataEntries.payment_mode_id));
  } else {
    existingConditions.push(
      eq(dataEntries.payment_mode_id, payload.paymentModeId),
    );
  }

  const [existing] = await db
    .select({
      id: dataEntries.id,
      value: dataEntries.value,
      comments: dataEntries.comments,
    })
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

  const nextComments: DataEntryComment[] = [
    ...((existing?.comments ?? []) as DataEntryComment[]),
    {
      comment: normalizedComment,
      commenterId: user.id,
      commenterName: user.name,
      commenterRole: user.role,
      date: new Date(),
    },
  ];

  if (existing) {
    await db
      .update(dataEntries)
      .set({
        comments: nextComments,
        updatedAt: new Date(),
        updatedById: user.id,
      })
      .where(eq(dataEntries.id, existing.id));
  } else {
    await db.insert(dataEntries).values({
      report_period_id: context.reportPeriodId,
      input_def_id: payload.inputDefId,
      service_area_id: scopedServiceAreaId,
      energy_resource_id: energyResourceId,
      value: null,
      comments: nextComments,
      status_id: DataEntryStatusId.Entered,
      energy_source_id: energyMetadata?.energySourceId,
      energy_provider_id: energyMetadata?.energyProviderId,
      customer_type_id: payload.customerTypeId,
      payment_mode_id: payload.paymentModeId,
      is_deleted: false,
      updatedAt: new Date(),
      updatedById: user.id,
    });
  }

  revalidatePath("/data-entry/enter-data");
};

export const updateDataEntryAvailabilityAction = async (
  payload: UpdateDataEntryAvailabilityPayload,
): Promise<{ kpiRunResult: KpiWorkerRunResult | null }> => {
  const user = await getCurrentUser();
  const { context, options } = await bootstrapDataEntryFilterContext(user);

  if (context.reportPeriodId == null) {
    throw new Error("A report period is required before updating status.");
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

  const serviceAreaScopedInputDefinitionIds =
    await getServiceAreaScopedInputDefinitionIds([payload.inputDefId]);
  const scopedServiceAreaId = serviceAreaScopedInputDefinitionIds.has(
    payload.inputDefId,
  )
    ? context.serviceAreaId
    : null;

  const generationMode = isGenerationContext(
    context,
    options.inputSubcategories,
  );
  const energyResourceId = generationMode
    ? (payload.energyResourceId ?? null)
    : null;

  if (generationMode && energyResourceId == null) {
    throw new Error("Generation mode requires a generator to update status.");
  }

  const existingConditions = [
    eq(dataEntries.report_period_id, context.reportPeriodId),
    eq(dataEntries.input_def_id, payload.inputDefId),
  ];

  if (scopedServiceAreaId == null) {
    existingConditions.push(isNull(dataEntries.service_area_id));
  } else {
    existingConditions.push(
      eq(dataEntries.service_area_id, scopedServiceAreaId),
    );
  }

  if (energyResourceId == null) {
    existingConditions.push(isNull(dataEntries.energy_resource_id));
  } else {
    existingConditions.push(
      eq(dataEntries.energy_resource_id, energyResourceId),
    );
  }

  if (payload.customerTypeId == null) {
    existingConditions.push(isNull(dataEntries.customer_type_id));
  } else {
    existingConditions.push(
      eq(dataEntries.customer_type_id, payload.customerTypeId),
    );
  }

  if (payload.paymentModeId == null) {
    existingConditions.push(isNull(dataEntries.payment_mode_id));
  } else {
    existingConditions.push(
      eq(dataEntries.payment_mode_id, payload.paymentModeId),
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

  const nextStatusId = payload.isDataNotAvailable
    ? DataEntryStatusId.DataNotAvailable
    : DataEntryStatusId.Entered;

  let sourceDataEntryId = existing?.id ?? null;

  if (existing) {
    await db
      .update(dataEntries)
      .set({
        status_id: nextStatusId,
        customer_type_id: payload.customerTypeId,
        payment_mode_id: payload.paymentModeId,
        is_deleted: false,
        updatedAt: new Date(),
        updatedById: user.id,
      })
      .where(eq(dataEntries.id, existing.id));
  } else {
    const [inserted] = await db
      .insert(dataEntries)
      .values({
        report_period_id: context.reportPeriodId,
        input_def_id: payload.inputDefId,
        service_area_id: scopedServiceAreaId,
        energy_resource_id: energyResourceId,
        value: null,
        comments: null,
        status_id: nextStatusId,
        energy_source_id: energyMetadata?.energySourceId,
        energy_provider_id: energyMetadata?.energyProviderId,
        customer_type_id: payload.customerTypeId,
        payment_mode_id: payload.paymentModeId,
        is_deleted: false,
        updatedAt: new Date(),
        updatedById: user.id,
      })
      .returning({ id: dataEntries.id });

    sourceDataEntryId = inserted?.id ?? null;
  }

  runAggregatedWorkerAsync(user, {
    reportPeriodId: context.reportPeriodId,
    serviceAreaId: scopedServiceAreaId,
    energyResourceId,
  });

  let kpiRunResult: KpiWorkerRunResult | null = null;

  if (sourceDataEntryId) {
    kpiRunResult = await triggerKpiWorker(
      {
        sourceDataEntryId,
        inputDefId: payload.inputDefId,
        triggeredByUserId: user.id,
        scope: {
          reportPeriodId: context.reportPeriodId,
          organizationId: user.org_id,
          serviceAreaId: scopedServiceAreaId,
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

  return {
    kpiRunResult,
  };
};
