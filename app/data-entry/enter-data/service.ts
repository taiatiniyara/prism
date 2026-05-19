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
import {
  CurrentUser,
  getCurrentUser,
  hasGlobalUtilityAccess,
} from "@/lib/user.service";
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
import { formatReportPeriodDisplay } from "@/lib/formatters";
import {
  DataEntryValidationMetadata,
  getDataTypeValidationMessage,
  getRangeOrPolarityValidationMessage,
  isValueValidForDataType,
} from "@/app/data-entry/enter-data/services/dataEntryValidation.service";
import { getDevValidationBuilderConfigFromDb } from "@/app/data-entry/enter-data/services/validation-builder/store";
import { shouldRunValidationBuilderRule } from "@/app/data-entry/enter-data/services/validation-builder/shared";
import {
  DevValidationBuilderConfig,
  ValidationCode,
} from "@/app/data-entry/enter-data/services/validation-builder/types";

const hasActiveEnergyResourcePeriod = (reportPeriodId: number) =>
  sql<boolean>`exists (
    select 1
    from jsonb_array_elements(${energyResources.period_entries}) as period_entry
    where (period_entry->>'report_period_id')::int = ${reportPeriodId}
      and coalesce((period_entry->>'is_active')::boolean, false) = true
  )`;

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

const normalizeAlternativeNames = (
  value: unknown,
): Record<string, string> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value).filter(
    ([, label]) => typeof label === "string" && label.trim().length > 0,
  );

  if (entries.length === 0) {
    return null;
  }

  return Object.fromEntries(entries) as Record<string, string>;
};

const resolveInputDisplayNameForEnergySource = (
  defaultName: string,
  alternativeNames: Record<string, string> | null | undefined,
  energySourceId?: number,
): string => {
  if (!alternativeNames || energySourceId == null) {
    return defaultName;
  }

  const direct = alternativeNames[String(energySourceId)]?.trim();
  if (direct) {
    return direct;
  }

  const scoped = alternativeNames[`source:${energySourceId}`]?.trim();
  if (scoped) {
    return scoped;
  }

  return defaultName;
};

const DATA_ENTRY_STATUS_OPTIONS: DataEntryFilterOption[] = [
  mapOption(DataEntryStatusId.Pending, "Pending"),
  mapOption(DataEntryStatusId.Entered, "Entered"),
  mapOption(DataEntryStatusId.Not_Available, "Not Available"),
];

const normalizeDataEntryStatusFilter = (
  statusId: number | null,
):
  | DataEntryStatusId.Pending
  | DataEntryStatusId.Entered
  | DataEntryStatusId.Not_Available
  | null => {
  if (
    statusId === DataEntryStatusId.Pending ||
    statusId === DataEntryStatusId.Entered ||
    statusId === DataEntryStatusId.Not_Available
  ) {
    return statusId;
  }

  return null;
};

const filterRowsByDataEntryStatus = (
  rows: DataEntryInputRowView[],
  statusId: number | null,
): DataEntryInputRowView[] => {
  const normalizedStatus = normalizeDataEntryStatusFilter(statusId);
  if (normalizedStatus == null) {
    return rows;
  }

  return rows.filter((row) => {
    const isNotAvailable = row.isDataNotAvailable === true;
    const hasEnteredValue = (row.value?.trim().length ?? 0) > 0;
    const isEntered = hasEnteredValue && !isNotAvailable;
    const isPending = !isEntered && !isNotAvailable;

    if (normalizedStatus === DataEntryStatusId.Pending) {
      return isPending;
    }

    if (normalizedStatus === DataEntryStatusId.Entered) {
      return isEntered;
    }

    return isNotAvailable;
  });
};

const filterGenerationGroupsByDataEntryStatus = (
  groups: DataEntryGeneratorGroupView[],
  statusId: number | null,
): DataEntryGeneratorGroupView[] =>
  groups
    .map((group) => ({
      ...group,
      rows: filterRowsByDataEntryStatus(group.rows, statusId),
    }))
    .filter((group) => group.rows.length > 0);

const filterTariffGroupsByDataEntryStatus = (
  groups: DataEntryTariffPaymentModeGroupView[],
  statusId: number | null,
): DataEntryTariffPaymentModeGroupView[] =>
  groups
    .map((paymentModeGroup) => ({
      ...paymentModeGroup,
      customerTypeGroups: paymentModeGroup.customerTypeGroups
        .map((customerTypeGroup) => ({
          ...customerTypeGroup,
          rows: filterRowsByDataEntryStatus(customerTypeGroup.rows, statusId),
        }))
        .filter((customerTypeGroup) => customerTypeGroup.rows.length > 0),
    }))
    .filter(
      (paymentModeGroup) => paymentModeGroup.customerTypeGroups.length > 0,
    );

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
      alternativeNames: inputDefinitions.alternative_names,
      categoryId: inputDefinitions.category_id,
      subcategoryId: inputDefinitions.subcategory_id,
      isMandatory: inputDefinitions.is_mandatory,
      subcategoryName: sql<string | null>`(
        select mli.name
        from managed_list_items mli
        where mli.id = ${inputDefinitions.subcategory_id}
        limit 1
      )`,
      dataTypeId: inputDefinitions.data_type_id,
      dataTypeName: managedListItems.name,
      validRangeMin: inputDefinitions.valid_range_min,
      validRangeMax: inputDefinitions.valid_range_max,
      validPolarityId: inputDefinitions.valid_polarity_id,
      validPolarityName: sql<string | null>`(
        select mli.name
        from managed_list_items mli
        where mli.id = ${inputDefinitions.valid_polarity_id}
        limit 1
      )`,
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
    .orderBy(asc(inputDefinitions.sort_order), asc(inputDefinitions.id));

  return rows
    .filter(
      (row) => row.subcategoryName?.trim().toLowerCase() !== "country context",
    )
    .map((row) => ({
      id: row.id,
      name: row.name,
      alternativeNames: normalizeAlternativeNames(row.alternativeNames),
      categoryId: row.categoryId,
      subcategoryId: row.subcategoryId,
      dataTypeName: row.dataTypeName,
      dataTypeId: row.dataTypeId,
      isMandatory: row.isMandatory,
      validRangeMin: row.validRangeMin,
      validRangeMax: row.validRangeMax,
      validPolarityId: row.validPolarityId,
      validPolarityName: row.validPolarityName,
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
      dataTypeName: definition?.dataTypeName ?? null,
      isMandatory: definition?.isMandatory ?? false,
      validRangeMin: definition?.validRangeMin ?? null,
      validRangeMax: definition?.validRangeMax ?? null,
      validPolarityId: definition?.validPolarityId ?? null,
      validPolarityName: definition?.validPolarityName ?? null,
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
    dataTypeName: definition.dataTypeName,
    isMandatory: definition.isMandatory,
    validRangeMin: definition.validRangeMin,
    validRangeMax: definition.validRangeMax,
    validPolarityId: definition.validPolarityId,
    validPolarityName: definition.validPolarityName,
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
    eq(energyResources.is_virtual, false),
    eq(energyResources.service_area_id, context.serviceAreaId),
    hasActiveEnergyResourcePeriod(context.reportPeriodId),
  ];

  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
    generatorConditions.push(eq(energyResources.utility_id, user.org_id));
  }

  const generators = await db
    .select({
      id: energyResources.id,
      name: energyResources.name,
      serviceAreaId: energyResources.service_area_id,
      energyProviderId: energyResources.energy_provider_id,
      energySourceId: energyResources.energy_source_id,
      isVirtual: energyResources.is_virtual,
    })
    .from(energyResources)
    .where(and(...generatorConditions))
    .orderBy(asc(energyResources.name));

  if (generators.length === 0) {
    return [];
  }

  const definitionCandidates = filterInputDefinitionsByContext(
    await getInputDefinitionsForContext(context),
    context,
  );
  const alternativeNamesByInputDefId = new Map(
    definitionCandidates.map((definition) => [
      definition.id,
      definition.alternativeNames,
    ]),
  );

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
    (row, generator) => ({
      ...row,
      inputName: resolveInputDisplayNameForEnergySource(
        row.inputName,
        alternativeNamesByInputDefId.get(row.inputDefId),
        generator.energySourceId,
      ),
    }),
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
            dataTypeName: definition.dataTypeName,
            isMandatory: definition.isMandatory,
            validRangeMin: definition.validRangeMin,
            validRangeMax: definition.validRangeMax,
            validPolarityId: definition.validPolarityId,
            validPolarityName: definition.validPolarityName,
            controlType: mapDataTypeToControlType(definition.dataTypeName),
            isDataNotAvailable:
              entry?.statusId === DataEntryStatusId.Not_Available,
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
  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
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
    eq(energyResources.is_virtual, false),
    hasActiveEnergyResourcePeriod(context.reportPeriodId),
  ];

  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
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
      eq(dataEntries.status_id, DataEntryStatusId.Not_Available),
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
  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
    conditions.push(eq(reportPeriods.utility_id, user.org_id));
  }

  const rows = await db
    .select({
      id: reportPeriods.id,
      reportDate: reportPeriods.report_date,
      reportTypeName: managedListItems.name,
    })
    .from(reportPeriods)
    .leftJoin(
      managedListItems,
      eq(reportPeriods.report_type_id, managedListItems.id),
    )
    .where(and(...conditions))
    .orderBy(asc(reportPeriods.report_date));

  return rows.map((row) =>
    mapOption(
      row.id,
      formatReportPeriodDisplay(row.reportDate, row.reportTypeName),
    ),
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
  user: CurrentUser,
  reportPeriodId: number | null,
  categoryId: number | null,
): Promise<DataEntryFilterOption[]> => {
  const subcategories = await getManagedListOptionsByNamePatterns(
    ["input subcategor", "data label sub-categor"],
    categoryId,
  );

  const baseSubcategories = subcategories.filter(
    (subcategory) =>
      subcategory.name.trim().toLowerCase() !== "country context" &&
      !isAllLikeOption(subcategory.name),
  );

  if (
    hasGlobalUtilityAccess(user) ||
    user.org_id == null ||
    reportPeriodId == null ||
    baseSubcategories.length === 0
  ) {
    return baseSubcategories;
  }

  const relevanceConditions = [
    eq(dataEntries.report_period_id, reportPeriodId),
    eq(dataEntries.is_deleted, false),
    eq(reportPeriods.utility_id, user.org_id),
    eq(inputDefinitions.is_active, true),
    eq(inputDefinitions.is_aggregated, false),
    eq(inputDefinitions.is_system_generated, false),
  ];

  if (categoryId != null) {
    relevanceConditions.push(eq(inputDefinitions.category_id, categoryId));
  }

  const subcategoryDefinitionRows = await db
    .select({
      inputDefId: inputDefinitions.id,
      subcategoryId: inputDefinitions.subcategory_id,
    })
    .from(inputDefinitions)
    .where(
      and(
        eq(inputDefinitions.is_active, true),
        eq(inputDefinitions.is_aggregated, false),
        eq(inputDefinitions.is_system_generated, false),
        inArray(
          inputDefinitions.subcategory_id,
          baseSubcategories.map((subcategory) => subcategory.id),
        ),
        ...(categoryId != null
          ? [eq(inputDefinitions.category_id, categoryId)]
          : []),
      ),
    );

  if (subcategoryDefinitionRows.length === 0) {
    return baseSubcategories;
  }

  const relevanceRows = await db
    .select({
      inputDefId: inputDefinitions.id,
      subcategoryId: inputDefinitions.subcategory_id,
      isRelevant: dataEntries.is_relevant,
    })
    .from(dataEntries)
    .innerJoin(
      inputDefinitions,
      eq(dataEntries.input_def_id, inputDefinitions.id),
    )
    .innerJoin(
      reportPeriods,
      eq(dataEntries.report_period_id, reportPeriods.id),
    )
    .where(and(...relevanceConditions));

  const definitionIdsBySubcategory = new Map<number, Set<number>>();
  for (const row of subcategoryDefinitionRows) {
    const set = definitionIdsBySubcategory.get(row.subcategoryId) ?? new Set();
    set.add(row.inputDefId);
    definitionIdsBySubcategory.set(row.subcategoryId, set);
  }

  const touchedDefinitionIdsBySubcategory = new Map<number, Set<number>>();
  const hasRelevantRowBySubcategory = new Map<number, boolean>();

  for (const row of relevanceRows) {
    const touchedSet =
      touchedDefinitionIdsBySubcategory.get(row.subcategoryId) ?? new Set();
    touchedSet.add(row.inputDefId);
    touchedDefinitionIdsBySubcategory.set(row.subcategoryId, touchedSet);

    if (row.isRelevant) {
      hasRelevantRowBySubcategory.set(row.subcategoryId, true);
    }
  }

  return baseSubcategories.filter((subcategory) => {
    const definitionIds = definitionIdsBySubcategory.get(subcategory.id);
    if (!definitionIds || definitionIds.size === 0) {
      return true;
    }

    if (hasRelevantRowBySubcategory.get(subcategory.id) === true) {
      return true;
    }

    const touchedDefinitionCount =
      touchedDefinitionIdsBySubcategory.get(subcategory.id)?.size ?? 0;

    return touchedDefinitionCount < definitionIds.size;
  });
};

export const getServiceAreaOptions = async (
  user: CurrentUser,
): Promise<DataEntryFilterOption[]> => {
  const conditions = [
    eq(serviceAreas.is_active, true),
    sql`lower(${serviceAreas.name}) not like '%utility%'`,
  ];

  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
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

export const getDataEntryStatusOptions = async (): Promise<
  DataEntryFilterOption[]
> => {
  return DATA_ENTRY_STATUS_OPTIONS;
};

export const getBaseFilterOptions = async (
  user: CurrentUser,
  context: DataEntryFilterContext,
): Promise<DataEntryFilterOptions> => {
  const [reportTypes, inputCategories, serviceAreasOptions, dataEntryStatuses] =
    await Promise.all([
      getReportTypeOptions(),
      getInputCategoryOptions(),
      getServiceAreaOptions(user),
      getDataEntryStatusOptions(),
    ]);

  const [reportPeriods, inputSubcategories] = await Promise.all([
    getReportPeriodOptions(user, context.reportTypeId),
    getInputSubcategoryOptions(
      user,
      context.reportPeriodId,
      context.inputCategoryId,
    ),
  ]);

  return {
    reportTypes,
    reportPeriods,
    inputCategories,
    inputSubcategories,
    serviceAreas: serviceAreasOptions,
    dataEntryStatuses,
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

  const statusAwareContext = {
    ...(tariffContext ? dependentContext : operationalContext),
    dataEntryStatusId: options.dataEntryStatuses.some(
      (status) => status.id === dependentContext.dataEntryStatusId,
    )
      ? dependentContext.dataEntryStatusId
      : null,
  };

  await saveFilterContextToCookies(statusAwareContext);

  return {
    context: statusAwareContext,
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
      const groups = filterGenerationGroupsByDataEntryStatus(
        await getGenerationGroupsForContext(user, context),
        context.dataEntryStatusId,
      );

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
      const groups = filterTariffGroupsByDataEntryStatus(
        await getTariffGroupsForContext(context),
        context.dataEntryStatusId,
      );

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

    const inputRows = filterRowsByDataEntryStatus(
      await getInputRowsForContext(context),
      context.dataEntryStatusId,
    );

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

export const getTemplateInputsForDownloadAction = async (
  scope: "subcategory" | "category",
): Promise<DataEntryPageViewModel["inputs"]> => {
  if (scope === "subcategory") {
    const viewModel = await getDataEntryFilterViewModel();
    return viewModel.inputs;
  }

  const user = await getCurrentUser();
  const { context } = await bootstrapDataEntryFilterContext(user);
  const categoryContext = {
    ...context,
    inputSubcategoryId: null,
  };

  const rows = filterRowsByDataEntryStatus(
    await getInputRowsForContext(categoryContext),
    categoryContext.dataEntryStatusId,
  );

  return {
    mode: "flat",
    rows,
  };
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
      dataEntryStatuses: options.dataEntryStatuses,
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

export interface DataEntryTemplateUploadRowPayload {
  inputDefId: number;
  value: string | null;
  isDataNotAvailable: boolean;
  energyResourceId?: number | null;
  customerTypeId?: number | null;
  paymentModeId?: number | null;
}

interface DataEntryTemplateUploadResult {
  processed: number;
  skipped: number;
}

const normalizeDataEntryValue = (value: string | null): string | null => {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getDataEntryValidationMetadata = async (
  inputDefId: number,
): Promise<DataEntryValidationMetadata | null> => {
  const [definition] = await db
    .select({
      inputName: inputDefinitions.name,
      isMandatory: inputDefinitions.is_mandatory,
      dataTypeName: sql<string | null>`(
        select mli.name
        from managed_list_items mli
        where mli.id = ${inputDefinitions.data_type_id}
        limit 1
      )`,
      validRangeMin: inputDefinitions.valid_range_min,
      validRangeMax: inputDefinitions.valid_range_max,
      validPolarityId: inputDefinitions.valid_polarity_id,
      validPolarityName: sql<string | null>`(
        select mli.name
        from managed_list_items mli
        where mli.id = ${inputDefinitions.valid_polarity_id}
        limit 1
      )`,
    })
    .from(inputDefinitions)
    .where(eq(inputDefinitions.id, inputDefId))
    .limit(1);

  return definition ?? null;
};

const getDevValidationBuilderConfig = async (
  user: CurrentUser,
): Promise<DevValidationBuilderConfig | null> => {
  if (user.role !== "DEV") {
    return null;
  }

  return getDevValidationBuilderConfigFromDb();
};

const resolveBuilderValidationMessage = (params: {
  config: DevValidationBuilderConfig | null;
  code: ValidationCode;
  fallbackMessage: string;
}) => params.config?.customMessages[params.code] ?? params.fallbackMessage;

type DataEntryScopedPayload = {
  inputDefId: number;
  energyResourceId?: number | null;
  customerTypeId?: number | null;
  paymentModeId?: number | null;
};

type EnergyMetadata = {
  energySourceId: number;
  energyTypeId: number;
  energyProviderId: number;
};

const resolveEnergyMetadata = async (
  energyResourceId: number | null,
): Promise<EnergyMetadata | null> => {
  if (energyResourceId == null) {
    return null;
  }

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

  return resource;
};

const buildExistingDataEntryConditions = (params: {
  reportPeriodId: number;
  inputDefId: number;
  serviceAreaId: number | null;
  energyResourceId: number | null;
  customerTypeId: number | null;
  paymentModeId: number | null;
}) => {
  const conditions = [
    eq(dataEntries.report_period_id, params.reportPeriodId),
    eq(dataEntries.input_def_id, params.inputDefId),
  ];

  if (params.serviceAreaId == null) {
    conditions.push(isNull(dataEntries.service_area_id));
  } else {
    conditions.push(eq(dataEntries.service_area_id, params.serviceAreaId));
  }

  if (params.energyResourceId == null) {
    conditions.push(isNull(dataEntries.energy_resource_id));
  } else {
    conditions.push(
      eq(dataEntries.energy_resource_id, params.energyResourceId),
    );
  }

  if (params.customerTypeId == null) {
    conditions.push(isNull(dataEntries.customer_type_id));
  } else {
    conditions.push(eq(dataEntries.customer_type_id, params.customerTypeId));
  }

  if (params.paymentModeId == null) {
    conditions.push(isNull(dataEntries.payment_mode_id));
  } else {
    conditions.push(eq(dataEntries.payment_mode_id, params.paymentModeId));
  }

  return conditions;
};

const resolveDataEntryActionScope = async (
  payload: DataEntryScopedPayload,
  errors: {
    missingReportPeriod: string;
    missingGenerationResource: string;
  },
): Promise<{
  user: CurrentUser;
  context: DataEntryFilterContext;
  scopedServiceAreaId: number | null;
  energyResourceId: number | null;
  energyMetadata: EnergyMetadata | null;
}> => {
  const user = await getCurrentUser();
  const { context, options } = await bootstrapDataEntryFilterContext(user);

  if (context.reportPeriodId == null) {
    throw new Error(errors.missingReportPeriod);
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
    throw new Error(errors.missingGenerationResource);
  }

  const energyMetadata = await resolveEnergyMetadata(energyResourceId);

  return {
    user,
    context,
    scopedServiceAreaId,
    energyResourceId,
    energyMetadata,
  };
};

const revalidateEnterData = () => {
  revalidatePath("/data-entry/enter-data");
};

export const updateDataEntryValueAction = async (
  payload: UpdateDataEntryValuePayload,
): Promise<{ kpiRunResult: KpiWorkerRunResult | null }> => {
  const {
    user,
    context,
    scopedServiceAreaId,
    energyResourceId,
    energyMetadata,
  } = await resolveDataEntryActionScope(payload, {
    missingReportPeriod:
      "A report period is required before saving data entries.",
    missingGenerationResource:
      "Generation mode requires a generator to save values.",
  });

  const reportPeriodId = context.reportPeriodId;
  if (reportPeriodId == null) {
    throw new Error("A report period is required before saving data entries.");
  }

  const builderConfig = await getDevValidationBuilderConfig(user);
  const normalizedValue = normalizeDataEntryValue(payload.value);
  const validationMetadata = await getDataEntryValidationMetadata(
    payload.inputDefId,
  );
  if (!validationMetadata) {
    throw new Error("Unable to validate the selected input definition.");
  }

  if (
    shouldRunValidationBuilderRule({
      config: builderConfig,
      ruleName: "required-value",
      code: "REQUIRED",
      inputDefId: payload.inputDefId,
    }) &&
    validationMetadata.isMandatory &&
    normalizedValue == null
  ) {
    throw new Error(
      resolveBuilderValidationMessage({
        config: builderConfig,
        code: "REQUIRED",
        fallbackMessage: `${validationMetadata.inputName} is required.`,
      }),
    );
  }

  if (
    shouldRunValidationBuilderRule({
      config: builderConfig,
      ruleName: "data-type",
      code: "INVALID_TYPE",
      inputDefId: payload.inputDefId,
    }) &&
    !isValueValidForDataType(validationMetadata.dataTypeName, normalizedValue)
  ) {
    throw new Error(
      resolveBuilderValidationMessage({
        config: builderConfig,
        code: "INVALID_TYPE",
        fallbackMessage: getDataTypeValidationMessage(validationMetadata),
      }),
    );
  }

  if (
    shouldRunValidationBuilderRule({
      config: builderConfig,
      ruleName: "relevance",
      code: "NOT_RELEVANT",
      inputDefId: payload.inputDefId,
    })
  ) {
    const serviceAreaScopedInputDefinitionIds =
      await getServiceAreaScopedInputDefinitionIds([payload.inputDefId]);
    const irrelevantInputDefinitionIds =
      await getIrrelevantInputDefinitionIdsForContext(
        context,
        [payload.inputDefId],
        serviceAreaScopedInputDefinitionIds,
      );
    if (irrelevantInputDefinitionIds.has(payload.inputDefId)) {
      throw new Error(
        resolveBuilderValidationMessage({
          config: builderConfig,
          code: "NOT_RELEVANT",
          fallbackMessage:
            "This field is not relevant for the selected report context.",
        }),
      );
    }
  }

  const rangeOrPolarityError = getRangeOrPolarityValidationMessage(
    validationMetadata,
    normalizedValue,
  );
  if (
    shouldRunValidationBuilderRule({
      config: builderConfig,
      ruleName: "range-polarity",
      code: "RANGE_OR_POLARITY",
      inputDefId: payload.inputDefId,
    }) &&
    rangeOrPolarityError
  ) {
    throw new Error(
      resolveBuilderValidationMessage({
        config: builderConfig,
        code: "RANGE_OR_POLARITY",
        fallbackMessage: rangeOrPolarityError,
      }),
    );
  }

  const existingConditions = buildExistingDataEntryConditions({
    reportPeriodId,
    inputDefId: payload.inputDefId,
    serviceAreaId: scopedServiceAreaId,
    energyResourceId,
    customerTypeId: payload.customerTypeId ?? null,
    paymentModeId: payload.paymentModeId ?? null,
  });

  const [existing] = await db
    .select({ id: dataEntries.id })
    .from(dataEntries)
    .where(and(...existingConditions))
    .limit(1);

  const values = {
    report_period_id: reportPeriodId,
    input_def_id: payload.inputDefId,
    service_area_id: scopedServiceAreaId,
    energy_resource_id: energyResourceId,
    value: normalizedValue,
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
    reportPeriodId,
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
          reportPeriodId,
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

  revalidateEnterData();

  return {
    kpiRunResult,
  };
};

export const updateDataEntryCommentAction = async (
  payload: UpdateDataEntryCommentPayload,
): Promise<void> => {
  const {
    user,
    context,
    scopedServiceAreaId,
    energyResourceId,
    energyMetadata,
  } = await resolveDataEntryActionScope(payload, {
    missingReportPeriod: "A report period is required before saving comments.",
    missingGenerationResource:
      "Generation mode requires a generator to save comments.",
  });

  const reportPeriodId = context.reportPeriodId;
  if (reportPeriodId == null) {
    throw new Error("A report period is required before saving comments.");
  }

  const normalizedComment = payload.comment.trim();
  if (normalizedComment.length === 0) {
    throw new Error("A comment is required.");
  }

  const existingConditions = buildExistingDataEntryConditions({
    reportPeriodId,
    inputDefId: payload.inputDefId,
    serviceAreaId: scopedServiceAreaId,
    energyResourceId,
    customerTypeId: payload.customerTypeId ?? null,
    paymentModeId: payload.paymentModeId ?? null,
  });

  const [existing] = await db
    .select({
      id: dataEntries.id,
      value: dataEntries.value,
      comments: dataEntries.comments,
    })
    .from(dataEntries)
    .where(and(...existingConditions))
    .limit(1);

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
      report_period_id: reportPeriodId,
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

  revalidateEnterData();
};

export const updateDataEntryAvailabilityAction = async (
  payload: UpdateDataEntryAvailabilityPayload,
): Promise<{ kpiRunResult: KpiWorkerRunResult | null }> => {
  const {
    user,
    context,
    scopedServiceAreaId,
    energyResourceId,
    energyMetadata,
  } = await resolveDataEntryActionScope(payload, {
    missingReportPeriod: "A report period is required before updating status.",
    missingGenerationResource:
      "Generation mode requires a generator to update status.",
  });

  const reportPeriodId = context.reportPeriodId;
  if (reportPeriodId == null) {
    throw new Error("A report period is required before updating status.");
  }

  const existingConditions = buildExistingDataEntryConditions({
    reportPeriodId,
    inputDefId: payload.inputDefId,
    serviceAreaId: scopedServiceAreaId,
    energyResourceId,
    customerTypeId: payload.customerTypeId ?? null,
    paymentModeId: payload.paymentModeId ?? null,
  });

  const [existing] = await db
    .select({ id: dataEntries.id })
    .from(dataEntries)
    .where(and(...existingConditions))
    .limit(1);

  const nextStatusId = payload.isDataNotAvailable
    ? DataEntryStatusId.Not_Available
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
        report_period_id: reportPeriodId,
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
    reportPeriodId,
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
          reportPeriodId,
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

  revalidateEnterData();

  return {
    kpiRunResult,
  };
};

export const uploadDataEntryTemplateAction = async (
  rows: DataEntryTemplateUploadRowPayload[],
): Promise<DataEntryTemplateUploadResult> => {
  if (rows.length === 0) {
    return {
      processed: 0,
      skipped: 0,
    };
  }

  let processed = 0;
  let skipped = 0;

  for (const [index, row] of rows.entries()) {
    const hasValue = (row.value?.trim().length ?? 0) > 0;

    if (!hasValue && !row.isDataNotAvailable) {
      skipped += 1;
      continue;
    }

    if (hasValue && row.isDataNotAvailable) {
      throw new Error(
        `Row ${index + 2} cannot include both a value and a not-available flag.`,
      );
    }

    if (row.isDataNotAvailable) {
      await updateDataEntryAvailabilityAction({
        inputDefId: row.inputDefId,
        energyResourceId: row.energyResourceId ?? null,
        customerTypeId: row.customerTypeId ?? null,
        paymentModeId: row.paymentModeId ?? null,
        isDataNotAvailable: true,
      });
      processed += 1;
      continue;
    }

    await updateDataEntryValueAction({
      inputDefId: row.inputDefId,
      energyResourceId: row.energyResourceId ?? null,
      customerTypeId: row.customerTypeId ?? null,
      paymentModeId: row.paymentModeId ?? null,
      value: row.value,
    });
    processed += 1;
  }

  return {
    processed,
    skipped,
  };
};
