"use server";

import { db } from "@/db/connection";
import {
  dataEntries,
  energyResources,
  generationRelevance,
  generationToggleRelevance,
  inputRelevance,
  inputDefinitions,
  organisations,
  serviceAreas,
  user as authUsers,
} from "@/db/schema";
import { kpiDefinitions } from "@/db/schema/kpi";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { getCurrentUser } from "@/lib/user.service";
import { formatReportPeriodDisplay } from "@/lib/formatters";
import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { GetManagedListItemByName } from "../managed-lists/service";
import { DataEntryStatusId } from "@/db/schema/dataEntry";

interface RelevanceFilterOption {
  id: number;
  name: string;
}

interface UtilityTariffRelevanceFilter {
  reportPeriodId?: number | null;
  serviceAreaId?: number | null;
}

interface UtilityTransmissionRelevanceFilter {
  reportPeriodId?: number | null;
  serviceAreaId?: number | null;
}

interface UtilityGenerationRelevanceFilter {
  reportPeriodId?: number | null;
  serviceAreaId?: number | null;
}

interface InputDefinitionOption {
  id: number;
  name: string;
  sortOrder: number | null;
}

type UtilityScopedRelevanceFilter = {
  reportPeriodId?: number | null;
  serviceAreaId?: number | null;
};

const isGlobalKpiViewer = (role: string | null): boolean => {
  const normalizedRole = role?.trim().toUpperCase();
  return normalizedRole === "DEV" || normalizedRole === "BMO";
};

export interface UtilityTariffRelevanceCell {
  customerTypeId: number;
  customerType: string;
  isRelevant: boolean;
  relevantCount: number;
  totalCount: number;
  dataLabels: UtilityTariffRelevanceDataLabel[];
}

export interface UtilityTariffRelevanceDataLabel {
  inputDefId: number;
  dataLabel: string;
  isRelevant: boolean;
  dataEntryId: string | null;
}

export interface UtilityTariffRelevanceRow {
  paymentModeId: number;
  paymentMode: string;
  cells: UtilityTariffRelevanceCell[];
}

export interface SetUtilityTariffDataLabelRelevancePayload {
  reportPeriodId: number;
  serviceAreaId: number;
  paymentModeId: number;
  customerTypeId: number;
  inputDefId: number;
  isRelevant: boolean;
}

export interface UtilityTariffRelevanceResult {
  filters: {
    reportPeriodId: number | null;
    serviceAreaId: number | null;
  };
  options: {
    reportPeriods: RelevanceFilterOption[];
    serviceAreas: RelevanceFilterOption[];
  };
  customerTypes: RelevanceFilterOption[];
  rows: UtilityTariffRelevanceRow[];
}

export interface UtilityTransmissionRelevanceItem {
  inputDefId: number;
  dataLabel: string;
  isRelevant: boolean;
  dataEntryId: string | null;
}

export interface UtilityTransmissionRelevanceResult {
  filters: {
    reportPeriodId: number | null;
    serviceAreaId: number | null;
  };
  options: {
    reportPeriods: RelevanceFilterOption[];
    serviceAreas: RelevanceFilterOption[];
  };
  relevantCount: number;
  totalCount: number;
  items: UtilityTransmissionRelevanceItem[];
}

export interface SetTransmissionDataLabelRelevancePayload {
  reportPeriodId: number;
  serviceAreaId: number;
  inputDefId: number;
  isRelevant: boolean;
}

export interface UtilityGenerationRelevanceCell {
  energyProviderId: number;
  energyProvider: string;
  isRelevant: boolean;
  relatedInputCount: number;
}

export interface UtilityGenerationRelevanceRow {
  energySourceId: number;
  energySource: string;
  energyResourceTypeId: number;
  energyResourceType: string;
  cells: UtilityGenerationRelevanceCell[];
}

export interface UtilityGenerationRelevanceResult {
  filters: {
    reportPeriodId: number | null;
    serviceAreaId: number | null;
  };
  options: {
    reportPeriods: RelevanceFilterOption[];
    serviceAreas: RelevanceFilterOption[];
  };
  energyProviders: string[];
  energyResourceTypes: string[];
  rows: UtilityGenerationRelevanceRow[];
}

export interface SetUtilityGenerationDataLabelRelevancePayload {
  reportPeriodId: number;
  serviceAreaId: number;
  energySourceId: number;
  energyProviderId: number;
  isRelevant: boolean;
}

export interface CustomKpiRelevanceInput {
  inputDefId: number;
  dataLabel: string;
}

export interface CustomKpiRelevanceItem {
  kpiDefId: number;
  kpiName: string;
  description: string | null;
  formula: string | null;
  ownerUserId: string | null;
  ownerUserName: string | null;
  ownerUserOrgAcronym: string | null;
  ownerUtilityId: number | null;
  ownerUtilityName: string | null;
  utilityIds: number[];
  isRelevant: boolean;
  inputs: CustomKpiRelevanceInput[];
}

export interface SetCustomKpiRelevancePayload {
  kpiDefId: number;
  isRelevant: boolean;
}

export interface DevInputRelevanceItem {
  id: number;
  inputDefId: number;
  inputDef: string;
  dimensionId: number;
  dimension: string;
  isRelevant: boolean;
}

export interface DevInputRelevanceOption {
  id: number;
  name: string;
}

const resolveSelectedId = (
  requestedId: number | null | undefined,
  options: RelevanceFilterOption[],
): number | null => {
  if (options.length === 0) {
    return null;
  }

  if (
    requestedId != null &&
    options.some((option) => option.id === requestedId)
  ) {
    return requestedId;
  }

  return options[0].id;
};

const getUtilityRelevanceFilterContext = async (
  utilityId: number,
  currentUserRole: string,
  filters: UtilityScopedRelevanceFilter,
): Promise<{
  serviceAreaOptions: RelevanceFilterOption[];
  reportPeriodOptions: RelevanceFilterOption[];
  selectedReportPeriodId: number | null;
  selectedServiceAreaId: number | null;
}> => {
  const serviceAreaConditions = [eq(serviceAreas.utility_id, utilityId)];

  if (currentUserRole !== "DEV") {
    serviceAreaConditions.push(eq(serviceAreas.is_virtual, false));
  }

  const serviceAreaList = await db
    .select({
      id: serviceAreas.id,
      name: serviceAreas.name,
    })
    .from(serviceAreas)
    .orderBy(serviceAreas.name)
    .where(and(...serviceAreaConditions));

  const reportPeriodList = await db
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
    .where(eq(reportPeriods.utility_id, utilityId))
    .orderBy(desc(reportPeriods.report_date));

  const serviceAreaOptions: RelevanceFilterOption[] = serviceAreaList.map(
    (item) => ({
      id: item.id,
      name: item.name,
    }),
  );

  const reportPeriodOptions: RelevanceFilterOption[] = reportPeriodList.map(
    (item) => ({
      id: item.id,
      name: formatReportPeriodDisplay(item.reportDate, item.reportTypeName),
    }),
  );

  return {
    serviceAreaOptions,
    reportPeriodOptions,
    selectedReportPeriodId: resolveSelectedId(
      filters.reportPeriodId,
      reportPeriodOptions,
    ),
    selectedServiceAreaId: resolveSelectedId(
      filters.serviceAreaId,
      serviceAreaOptions,
    ),
  };
};

const hasValidUtilityContext = async (
  utilityId: number,
  serviceAreaId: number,
  reportPeriodId: number,
): Promise<boolean> => {
  const [validServiceArea] = await db
    .select({ id: serviceAreas.id })
    .from(serviceAreas)
    .where(
      and(
        eq(serviceAreas.id, serviceAreaId),
        eq(serviceAreas.utility_id, utilityId),
      ),
    )
    .limit(1);

  const [validReportPeriod] = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods)
    .where(
      and(
        eq(reportPeriods.id, reportPeriodId),
        eq(reportPeriods.utility_id, utilityId),
      ),
    )
    .limit(1);

  return !!validServiceArea && !!validReportPeriod;
};

const revalidateRelevanceAndDataEntry = () => {
  revalidatePath("/settings/relevance");
  revalidatePath("/data-entry");
  revalidatePath("/data-entry/enter-data");
};

const getInputDefinitionsForStructure = async (
  structureName: string,
): Promise<InputDefinitionOption[]> => {
  const structureManagedListItem =
    await GetManagedListItemByName(structureName);

  if (!structureManagedListItem) {
    throw new Error(`${structureName} managed list item not found`);
  }

  const rows = await db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      sortOrder: inputDefinitions.sort_order,
    })
    .from(inputDefinitions)
    .where(
      and(
        eq(inputDefinitions.is_active, true),
        eq(inputDefinitions.is_aggregated, false),
        or(
          eq(inputDefinitions.subcategory_id, structureManagedListItem.id),
          eq(inputDefinitions.category_id, structureManagedListItem.id),
        ),
      ),
    )
    .orderBy(asc(inputDefinitions.sort_order), asc(inputDefinitions.name));

  return rows;
};

const getManagedDimensionItems = async (
  listName: string,
): Promise<{ id: number; name: string }[]> => {
  const exactRows = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
    })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedLists.name, listName),
        eq(managedLists.is_active, true),
        eq(managedListItems.is_active, true),
      ),
    )
    .orderBy(managedListItems.name);

  const rows =
    exactRows.length > 0
      ? exactRows
      : await db
          .select({
            id: managedListItems.id,
            name: managedListItems.name,
          })
          .from(managedListItems)
          .innerJoin(
            managedLists,
            eq(managedListItems.list_id, managedLists.id),
          )
          .where(
            and(
              ilike(managedLists.name, `%${listName}%`),
              eq(managedLists.is_active, true),
              eq(managedListItems.is_active, true),
            ),
          )
          .orderBy(managedListItems.name);

  const normalizedListName = listName.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    const normalizedName = row.name.trim().toLowerCase();

    const isAllLikeOption =
      normalizedName === "all" ||
      normalizedName === "all options" ||
      normalizedName.startsWith("all ");

    return normalizedName !== normalizedListName && !isAllLikeOption;
  });

  if (filtered.length > 0) {
    return filtered;
  }

  return rows;
};

const getManagedDimensionItemsByAliases = async (
  listNames: string[],
): Promise<{ id: number; name: string }[]> => {
  for (const listName of listNames) {
    const rows = await getManagedDimensionItems(listName);
    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
};

const filterGenerationResourceTypes = <T extends { name: string }>(
  items: T[],
): T[] => {
  return items.filter((item) => item.name.trim().toLowerCase() !== "nill");
};

const getInputDefinitionsForAnyStructure = async (
  structureNames: string[],
): Promise<InputDefinitionOption[]> => {
  for (const structureName of structureNames) {
    try {
      const rows = await getInputDefinitionsForStructure(structureName);

      if (rows.length > 0) {
        return rows;
      }
    } catch {
      // Continue trying aliases when a specific managed list item is unavailable.
    }
  }

  return [];
};

const getGenerationInputDefinitions = async (): Promise<
  InputDefinitionOption[]
> => {
  const structureScoped = await getInputDefinitionsForAnyStructure([
    "Generation",
    "Energy Resources",
    "Energy Resource",
    "Generation Structure",
  ]);

  if (structureScoped.length > 0) {
    return structureScoped;
  }

  // Fallback for environments where generation structure labels were renamed.
  const activeRows = await db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      sortOrder: inputDefinitions.sort_order,
    })
    .from(inputDefinitions)
    .where(
      and(
        eq(inputDefinitions.is_active, true),
        eq(inputDefinitions.is_aggregated, false),
      ),
    )
    .orderBy(asc(inputDefinitions.sort_order), asc(inputDefinitions.name));

  if (activeRows.length > 0) {
    return activeRows;
  }

  // Final fallback for partially migrated datasets where active flags were reset.
  return db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      sortOrder: inputDefinitions.sort_order,
    })
    .from(inputDefinitions)
    .where(eq(inputDefinitions.is_aggregated, false))
    .orderBy(asc(inputDefinitions.sort_order), asc(inputDefinitions.name));
};

const getGenerationDimensionsFromResources = async (
  utilityId: number,
  serviceAreaId: number,
  includeVirtual: boolean,
): Promise<{
  energyProviders: { id: number; name: string }[];
  energySources: { id: number; name: string }[];
  energyResourceTypes: { id: number; name: string }[];
}> => {
  const resourceConditions = [
    eq(energyResources.utility_id, utilityId),
    eq(energyResources.service_area_id, serviceAreaId),
  ];

  if (!includeVirtual) {
    resourceConditions.push(eq(energyResources.is_virtual, false));
  }

  const resources = await db
    .select({
      energyProviderId: energyResources.energy_provider_id,
      energySourceId: energyResources.energy_source_id,
      energyResourceTypeId: energyResources.type_id,
    })
    .from(energyResources)
    .where(and(...resourceConditions));

  const providerIds = Array.from(
    new Set(resources.map((row) => row.energyProviderId)),
  );
  const sourceIds = Array.from(
    new Set(resources.map((row) => row.energySourceId)),
  );
  const typeIds = Array.from(
    new Set(resources.map((row) => row.energyResourceTypeId)),
  );

  const allIds = Array.from(
    new Set([...providerIds, ...sourceIds, ...typeIds]),
  );

  if (allIds.length === 0) {
    return {
      energyProviders: [],
      energySources: [],
      energyResourceTypes: [],
    };
  }

  const managedItems = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
    })
    .from(managedListItems)
    .where(inArray(managedListItems.id, allIds));

  const nameById = new Map(managedItems.map((item) => [item.id, item.name]));

  const mapIdsToOptions = (ids: number[]) =>
    ids
      .map((id) => ({
        id,
        name: nameById.get(id),
      }))
      .filter(
        (item): item is { id: number; name: string } =>
          typeof item.name === "string",
      )
      .sort((a, b) => a.name.localeCompare(b.name));

  return {
    energyProviders: mapIdsToOptions(providerIds),
    energySources: mapIdsToOptions(sourceIds),
    energyResourceTypes: mapIdsToOptions(typeIds),
  };
};

export async function GetUtilityTariffRelevance(
  filters: UtilityTariffRelevanceFilter = {},
): Promise<UtilityTariffRelevanceResult> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const {
    serviceAreaOptions,
    reportPeriodOptions,
    selectedReportPeriodId,
    selectedServiceAreaId,
  } = await getUtilityRelevanceFilterContext(user.org_id!, user.role, filters);

  const inputList = await getInputDefinitionsForStructure("Tariff Structure");

  const paymentModes = (await getManagedDimensionItems("Payment Mode")).sort(
    (a, b) => a.id - b.id,
  );

  const customerTypes = (await getManagedDimensionItems("Customer Type")).sort(
    (a, b) => a.id - b.id,
  );

  const tariffInputList = [...inputList].sort((a, b) => {
    const aIsGst = a.name.trim().toLowerCase() === "gst";
    const bIsGst = b.name.trim().toLowerCase() === "gst";

    if (aIsGst && !bIsGst) {
      return -1;
    }

    if (!aIsGst && bIsGst) {
      return 1;
    }

    const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return a.id - b.id;
  });

  const dataLabels = tariffInputList.map((input) => ({
    inputDefId: input.id,
    dataLabel: input.name,
  }));

  if (
    selectedReportPeriodId == null ||
    selectedServiceAreaId == null ||
    inputList.length === 0
  ) {
    return {
      filters: {
        reportPeriodId: selectedReportPeriodId,
        serviceAreaId: selectedServiceAreaId,
      },
      options: {
        reportPeriods: reportPeriodOptions,
        serviceAreas: serviceAreaOptions,
      },
      customerTypes: customerTypes.map((customerType) => ({
        id: customerType.id,
        name: customerType.name,
      })),
      rows: paymentModes.map((paymentMode) => ({
        paymentModeId: paymentMode.id,
        paymentMode: paymentMode.name,
        cells: customerTypes.map((customerType) => ({
          customerTypeId: customerType.id,
          customerType: customerType.name,
          isRelevant: dataLabels.length > 0,
          relevantCount: dataLabels.length,
          totalCount: dataLabels.length,
          dataLabels: dataLabels.map((label) => ({
            inputDefId: label.inputDefId,
            dataLabel: label.dataLabel,
            isRelevant: true,
            dataEntryId: null,
          })),
        })),
      })),
    };
  }

  const dataEntry = await db
    .select({
      report_period_id: dataEntries.report_period_id,
      payment_mode_id: dataEntries.payment_mode_id,
      customer_type_id: dataEntries.customer_type_id,
      input_def_id: dataEntries.input_def_id,
      is_relevant: dataEntries.is_relevant,
      id: dataEntries.id,
      updatedAt: dataEntries.updatedAt,
    })
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.report_period_id, selectedReportPeriodId),
        eq(dataEntries.service_area_id, selectedServiceAreaId),
        eq(dataEntries.is_deleted, false),
        isNull(dataEntries.energy_resource_id),
        inArray(
          dataEntries.input_def_id,
          inputList.map((i) => i.id),
        ),
      ),
    )
    .orderBy(desc(dataEntries.updatedAt));

  const relevanceByDimension = new Map<
    string,
    Map<number, { isRelevant: boolean; dataEntryId: string }>
  >();

  for (const entry of dataEntry) {
    if (
      entry.report_period_id == null ||
      entry.payment_mode_id == null ||
      entry.customer_type_id == null
    ) {
      continue;
    }

    const key = `${entry.report_period_id}:${entry.payment_mode_id}:${entry.customer_type_id}`;
    const existing =
      relevanceByDimension.get(key) ??
      new Map<number, { isRelevant: boolean; dataEntryId: string }>();

    if (existing.has(entry.input_def_id)) {
      continue;
    }

    existing.set(entry.input_def_id, {
      isRelevant: entry.is_relevant,
      dataEntryId: entry.id,
    });
    relevanceByDimension.set(key, existing);
  }

  return {
    filters: {
      reportPeriodId: selectedReportPeriodId,
      serviceAreaId: selectedServiceAreaId,
    },
    options: {
      reportPeriods: reportPeriodOptions,
      serviceAreas: serviceAreaOptions,
    },
    customerTypes: customerTypes.map((customerType) => ({
      id: customerType.id,
      name: customerType.name,
    })),
    rows: paymentModes.map((paymentMode) => ({
      paymentModeId: paymentMode.id,
      paymentMode: paymentMode.name,
      cells: customerTypes.map((customerType) => {
        const combinationKey = `${selectedReportPeriodId}:${paymentMode.id}:${customerType.id}`;
        const labelMap = relevanceByDimension.get(combinationKey) ?? new Map();
        const labels = dataLabels.map((label) => ({
          inputDefId: label.inputDefId,
          dataLabel: label.dataLabel,
          isRelevant: labelMap.get(label.inputDefId)?.isRelevant ?? true,
          dataEntryId: labelMap.get(label.inputDefId)?.dataEntryId ?? null,
        }));

        const relevantCount = labels.filter((label) => label.isRelevant).length;

        return {
          customerTypeId: customerType.id,
          customerType: customerType.name,
          isRelevant: relevantCount === labels.length,
          relevantCount,
          totalCount: labels.length,
          dataLabels: labels,
        };
      }),
    })),
  };
}

export async function SetUtilityTariffDataLabelRelevance(
  payload: SetUtilityTariffDataLabelRelevancePayload,
): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      message: "User not authenticated",
    };
  }

  const isValidContext = await hasValidUtilityContext(
    user.org_id!,
    payload.serviceAreaId,
    payload.reportPeriodId,
  );

  if (!isValidContext) {
    return {
      success: false,
      message: "Invalid relevance context for this utility.",
    };
  }

  const inputList = await getInputDefinitionsForStructure("Tariff Structure");

  if (!inputList.some((input) => input.id === payload.inputDefId)) {
    return {
      success: false,
      message: "Selected data label is not a Tariff input.",
    };
  }

  const [existing] = await db
    .select({ id: dataEntries.id })
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.report_period_id, payload.reportPeriodId),
        eq(dataEntries.service_area_id, payload.serviceAreaId),
        eq(dataEntries.input_def_id, payload.inputDefId),
        eq(dataEntries.payment_mode_id, payload.paymentModeId),
        eq(dataEntries.customer_type_id, payload.customerTypeId),
        isNull(dataEntries.energy_resource_id),
      ),
    )
    .orderBy(desc(dataEntries.updatedAt))
    .limit(1);

  if (!existing && payload.isRelevant) {
    return {
      success: true,
      message: "Relevance already set by default.",
    };
  }

  if (existing) {
    await db
      .update(dataEntries)
      .set({
        is_relevant: payload.isRelevant,
        is_deleted: false,
        updatedAt: new Date(),
        updatedById: user.id,
      })
      .where(eq(dataEntries.id, existing.id));
  } else {
    await db.insert(dataEntries).values({
      report_period_id: payload.reportPeriodId,
      service_area_id: payload.serviceAreaId,
      input_def_id: payload.inputDefId,
      payment_mode_id: payload.paymentModeId,
      customer_type_id: payload.customerTypeId,
      value: null,
      comments: null,
      status_id: DataEntryStatusId.Entered,
      is_relevant: payload.isRelevant,
      is_deleted: false,
      updatedAt: new Date(),
      updatedById: user.id,
    });
  }

  revalidateRelevanceAndDataEntry();

  return {
    success: true,
    message: "Tariff relevance updated.",
  };
}

export async function GetTransmissionRelevance(
  filters: UtilityTransmissionRelevanceFilter = {},
): Promise<UtilityTransmissionRelevanceResult> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const {
    serviceAreaOptions,
    reportPeriodOptions,
    selectedReportPeriodId,
    selectedServiceAreaId,
  } = await getUtilityRelevanceFilterContext(user.org_id!, user.role, filters);

  const inputList = await getInputDefinitionsForStructure("Transmission");

  const fallbackItems: UtilityTransmissionRelevanceItem[] = inputList.map(
    (input) => ({
      inputDefId: input.id,
      dataLabel: input.name,
      isRelevant: true,
      dataEntryId: null,
    }),
  );

  if (
    selectedReportPeriodId == null ||
    selectedServiceAreaId == null ||
    inputList.length === 0
  ) {
    return {
      filters: {
        reportPeriodId: selectedReportPeriodId,
        serviceAreaId: selectedServiceAreaId,
      },
      options: {
        reportPeriods: reportPeriodOptions,
        serviceAreas: serviceAreaOptions,
      },
      relevantCount: fallbackItems.length,
      totalCount: fallbackItems.length,
      items: fallbackItems,
    };
  }

  const entries = await db
    .select({
      inputDefId: dataEntries.input_def_id,
      isRelevant: dataEntries.is_relevant,
      id: dataEntries.id,
      updatedAt: dataEntries.updatedAt,
    })
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.report_period_id, selectedReportPeriodId),
        eq(dataEntries.service_area_id, selectedServiceAreaId),
        eq(dataEntries.is_deleted, false),
        isNull(dataEntries.energy_resource_id),
        isNull(dataEntries.payment_mode_id),
        isNull(dataEntries.customer_type_id),
        inArray(
          dataEntries.input_def_id,
          inputList.map((input) => input.id),
        ),
      ),
    )
    .orderBy(desc(dataEntries.updatedAt));

  const entryByInputDefId = new Map<
    number,
    { isRelevant: boolean; dataEntryId: string }
  >();

  for (const entry of entries) {
    if (entryByInputDefId.has(entry.inputDefId)) {
      continue;
    }

    entryByInputDefId.set(entry.inputDefId, {
      isRelevant: entry.isRelevant,
      dataEntryId: entry.id,
    });
  }

  const items: UtilityTransmissionRelevanceItem[] = inputList.map((input) => ({
    inputDefId: input.id,
    dataLabel: input.name,
    isRelevant: entryByInputDefId.get(input.id)?.isRelevant ?? true,
    dataEntryId: entryByInputDefId.get(input.id)?.dataEntryId ?? null,
  }));

  return {
    filters: {
      reportPeriodId: selectedReportPeriodId,
      serviceAreaId: selectedServiceAreaId,
    },
    options: {
      reportPeriods: reportPeriodOptions,
      serviceAreas: serviceAreaOptions,
    },
    relevantCount: items.filter((item) => item.isRelevant).length,
    totalCount: items.length,
    items,
  };
}

export async function SetTransmissionDataLabelRelevance(
  payload: SetTransmissionDataLabelRelevancePayload,
): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      message: "User not authenticated",
    };
  }

  const isValidContext = await hasValidUtilityContext(
    user.org_id!,
    payload.serviceAreaId,
    payload.reportPeriodId,
  );

  if (!isValidContext) {
    return {
      success: false,
      message: "Invalid relevance context for this utility.",
    };
  }

  const inputList = await getInputDefinitionsForStructure("Transmission");

  if (!inputList.some((input) => input.id === payload.inputDefId)) {
    return {
      success: false,
      message: "Selected data label is not a Transmission input.",
    };
  }

  const [existing] = await db
    .select({ id: dataEntries.id })
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.report_period_id, payload.reportPeriodId),
        eq(dataEntries.service_area_id, payload.serviceAreaId),
        eq(dataEntries.input_def_id, payload.inputDefId),
        isNull(dataEntries.energy_resource_id),
        isNull(dataEntries.payment_mode_id),
        isNull(dataEntries.customer_type_id),
      ),
    )
    .orderBy(desc(dataEntries.updatedAt))
    .limit(1);

  if (!existing && payload.isRelevant) {
    return {
      success: true,
      message: "Relevance already set by default.",
    };
  }

  if (existing) {
    await db
      .update(dataEntries)
      .set({
        is_relevant: payload.isRelevant,
        is_deleted: false,
        updatedAt: new Date(),
        updatedById: user.id,
      })
      .where(eq(dataEntries.id, existing.id));
  } else {
    await db.insert(dataEntries).values({
      report_period_id: payload.reportPeriodId,
      service_area_id: payload.serviceAreaId,
      input_def_id: payload.inputDefId,
      payment_mode_id: null,
      customer_type_id: null,
      value: null,
      comments: null,
      status_id: DataEntryStatusId.Entered,
      is_relevant: payload.isRelevant,
      is_deleted: false,
      updatedAt: new Date(),
      updatedById: user.id,
    });
  }

  revalidateRelevanceAndDataEntry();

  return {
    success: true,
    message: "Transmission relevance updated.",
  };
}

export async function GetUtilityGenerationRelevance(
  filters: UtilityGenerationRelevanceFilter = {},
): Promise<UtilityGenerationRelevanceResult> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const {
    serviceAreaOptions,
    reportPeriodOptions,
    selectedReportPeriodId,
    selectedServiceAreaId,
  } = await getUtilityRelevanceFilterContext(user.org_id!, user.role, filters);

  const inputList = await getGenerationInputDefinitions();
  let energyProviders = await getManagedDimensionItems("Energy Provider");
  let energySources = await getManagedDimensionItems("Energy Source");
  let energyResourceTypes = filterGenerationResourceTypes(
    await getManagedDimensionItemsByAliases([
      "Energy Resource Type",
      "Energy Resouce Type",
      "Energy Type",
    ]),
  );

  if (
    selectedServiceAreaId != null &&
    (energyProviders.length === 0 ||
      energySources.length === 0 ||
      energyResourceTypes.length === 0)
  ) {
    const fromResources = await getGenerationDimensionsFromResources(
      user.org_id!,
      selectedServiceAreaId,
      user.role === "DEV",
    );

    if (energyProviders.length === 0) {
      energyProviders = fromResources.energyProviders;
    }

    if (energySources.length === 0) {
      energySources = fromResources.energySources;
    }

    if (energyResourceTypes.length === 0) {
      energyResourceTypes = filterGenerationResourceTypes(
        fromResources.energyResourceTypes,
      );
    }
  }
  const inputDefIds = inputList.map((input) => input.id);

  if (
    selectedReportPeriodId == null ||
    selectedServiceAreaId == null ||
    inputList.length === 0
  ) {
    return {
      filters: {
        reportPeriodId: selectedReportPeriodId,
        serviceAreaId: selectedServiceAreaId,
      },
      options: {
        reportPeriods: reportPeriodOptions,
        serviceAreas: serviceAreaOptions,
      },
      energyProviders: energyProviders.map((provider) => provider.name),
      energyResourceTypes: energyResourceTypes.map((type) => type.name),
      rows: energySources.flatMap((energySource) =>
        energyResourceTypes.map((energyResourceType) => ({
          energySourceId: energySource.id,
          energySource: energySource.name,
          energyResourceTypeId: energyResourceType.id,
          energyResourceType: energyResourceType.name,
          cells: energyProviders.map((energyProvider) => ({
            energyProviderId: energyProvider.id,
            energyProvider: energyProvider.name,
            energyResourceTypeId: energyResourceType.id,
            energyResourceType: energyResourceType.name,
            isRelevant: true,
            relatedInputCount: inputDefIds.length,
          })),
        })),
      ),
    };
  }

  const toggleEntries =
    energyProviders.length > 0 && energySources.length > 0
      ? await db
          .select({
            reportPeriodId: generationToggleRelevance.report_period_id,
            energySourceId: generationToggleRelevance.energy_source_id,
            energyProviderId: generationToggleRelevance.energy_provider_id,
            isRelevant: generationToggleRelevance.is_relevant,
          })
          .from(generationToggleRelevance)
          .where(
            and(
              eq(
                generationToggleRelevance.report_period_id,
                selectedReportPeriodId,
              ),
              eq(
                generationToggleRelevance.service_area_id,
                selectedServiceAreaId,
              ),
              eq(generationToggleRelevance.is_deleted, false),
              inArray(
                generationToggleRelevance.energy_provider_id,
                energyProviders.map((provider) => provider.id),
              ),
              inArray(
                generationToggleRelevance.energy_source_id,
                energySources.map((source) => source.id),
              ),
            ),
          )
          .orderBy(desc(generationToggleRelevance.updatedAt))
      : [];

  const entries =
    energyProviders.length > 0 &&
    energySources.length > 0 &&
    energyResourceTypes.length > 0 &&
    inputDefIds.length > 0
      ? await db
          .select({
            reportPeriodId: generationRelevance.report_period_id,
            energySourceId: generationRelevance.energy_source_id,
            energyProviderId: generationRelevance.energy_provider_id,
            inputDefId: generationRelevance.input_def_id,
            isRelevant: generationRelevance.is_relevant,
            id: generationRelevance.id,
            updatedAt: generationRelevance.updatedAt,
          })
          .from(generationRelevance)
          .where(
            and(
              eq(generationRelevance.report_period_id, selectedReportPeriodId),
              eq(generationRelevance.service_area_id, selectedServiceAreaId),
              eq(generationRelevance.is_deleted, false),
              inArray(generationRelevance.input_def_id, inputDefIds),
              inArray(
                generationRelevance.energy_provider_id,
                energyProviders.map((provider) => provider.id),
              ),
              inArray(
                generationRelevance.energy_source_id,
                energySources.map((source) => source.id),
              ),
            ),
          )
          .orderBy(desc(generationRelevance.updatedAt))
      : [];

  const cellHasFalse = new Map<string, boolean>();

  for (const entry of toggleEntries) {
    if (
      entry.reportPeriodId == null ||
      entry.energySourceId == null ||
      entry.energyProviderId == null
    ) {
      continue;
    }

    if (entry.isRelevant) {
      continue;
    }

    const key = `${entry.reportPeriodId}:${entry.energySourceId}:${entry.energyProviderId}`;
    cellHasFalse.set(key, true);
  }

  for (const entry of entries) {
    if (
      entry.reportPeriodId == null ||
      entry.energySourceId == null ||
      entry.energyProviderId == null
    ) {
      continue;
    }

    if (entry.isRelevant) {
      continue;
    }

    const key = `${entry.reportPeriodId}:${entry.energySourceId}:${entry.energyProviderId}`;
    cellHasFalse.set(key, true);
  }

  return {
    filters: {
      reportPeriodId: selectedReportPeriodId,
      serviceAreaId: selectedServiceAreaId,
    },
    options: {
      reportPeriods: reportPeriodOptions,
      serviceAreas: serviceAreaOptions,
    },
    energyProviders: energyProviders.map((provider) => provider.name),
    energyResourceTypes: energyResourceTypes.map((type) => type.name),
    rows: energySources.flatMap((energySource) =>
      energyResourceTypes.map((energyResourceType) => ({
        energySourceId: energySource.id,
        energySource: energySource.name,
        energyResourceTypeId: energyResourceType.id,
        energyResourceType: energyResourceType.name,
        cells: energyProviders.map((energyProvider) => {
          const key = `${selectedReportPeriodId}:${energySource.id}:${energyProvider.id}`;

          return {
            energyProviderId: energyProvider.id,
            energyProvider: energyProvider.name,
            isRelevant: !cellHasFalse.get(key),
            relatedInputCount: inputDefIds.length,
          };
        }),
      })),
    ),
  };
}

export async function SetUtilityGenerationDataLabelRelevance(
  payload: SetUtilityGenerationDataLabelRelevancePayload,
): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      message: "User not authenticated",
    };
  }

  const isValidContext = await hasValidUtilityContext(
    user.org_id!,
    payload.serviceAreaId,
    payload.reportPeriodId,
  );

  if (!isValidContext) {
    return {
      success: false,
      message: "Invalid relevance context for this utility.",
    };
  }

  const inputList = await getGenerationInputDefinitions();

  const [energyProvider] = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .where(eq(managedListItems.id, payload.energyProviderId))
    .limit(1);

  const [energySource] = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .where(eq(managedListItems.id, payload.energySourceId))
    .limit(1);

  const [resourceMatch] = await db
    .select({ id: energyResources.id })
    .from(energyResources)
    .where(
      and(
        eq(energyResources.utility_id, user.org_id!),
        eq(energyResources.service_area_id, payload.serviceAreaId),
        eq(energyResources.energy_provider_id, payload.energyProviderId),
        eq(energyResources.energy_source_id, payload.energySourceId),
      ),
    )
    .limit(1);

  if ((!energyProvider || !energySource) && !resourceMatch) {
    return {
      success: false,
      message: "Selected energy provider or source is invalid.",
    };
  }

  const [existingToggle] = await db
    .select({ id: generationToggleRelevance.id })
    .from(generationToggleRelevance)
    .where(
      and(
        eq(generationToggleRelevance.report_period_id, payload.reportPeriodId),
        eq(generationToggleRelevance.service_area_id, payload.serviceAreaId),
        eq(
          generationToggleRelevance.energy_provider_id,
          payload.energyProviderId,
        ),
        eq(generationToggleRelevance.energy_source_id, payload.energySourceId),
      ),
    )
    .orderBy(desc(generationToggleRelevance.updatedAt))
    .limit(1);

  if (existingToggle) {
    await db
      .update(generationToggleRelevance)
      .set({
        is_relevant: payload.isRelevant,
        is_deleted: false,
        updatedAt: new Date(),
        updatedById: user.id,
      })
      .where(eq(generationToggleRelevance.id, existingToggle.id));
  } else if (!payload.isRelevant) {
    await db.insert(generationToggleRelevance).values({
      report_period_id: payload.reportPeriodId,
      service_area_id: payload.serviceAreaId,
      energy_provider_id: payload.energyProviderId,
      energy_source_id: payload.energySourceId,
      is_relevant: false,
      is_deleted: false,
      updatedAt: new Date(),
      updatedById: user.id,
    });
  }

  const inputDefIds = inputList.map((input) => input.id);

  if (inputDefIds.length === 0) {
    revalidateRelevanceAndDataEntry();

    return {
      success: true,
      message: "Generation relevance updated.",
    };
  }

  const existingRows = await db
    .select({
      id: generationRelevance.id,
      inputDefId: generationRelevance.input_def_id,
    })
    .from(generationRelevance)
    .where(
      and(
        eq(generationRelevance.report_period_id, payload.reportPeriodId),
        eq(generationRelevance.service_area_id, payload.serviceAreaId),
        inArray(generationRelevance.input_def_id, inputDefIds),
        eq(generationRelevance.energy_provider_id, payload.energyProviderId),
        eq(generationRelevance.energy_source_id, payload.energySourceId),
      ),
    )
    .orderBy(desc(generationRelevance.updatedAt));

  const existingByInputDefId = new Map<number, string>();

  for (const row of existingRows) {
    if (existingByInputDefId.has(row.inputDefId)) {
      continue;
    }

    existingByInputDefId.set(row.inputDefId, row.id);
  }

  if (existingByInputDefId.size === 0 && payload.isRelevant) {
    return {
      success: true,
      message: "Relevance already set by default.",
    };
  }

  if (existingByInputDefId.size > 0) {
    const existingIds = Array.from(existingByInputDefId.values());

    await db
      .update(generationRelevance)
      .set({
        is_relevant: payload.isRelevant,
        is_deleted: false,
        updatedAt: new Date(),
        updatedById: user.id,
      })
      .where(inArray(generationRelevance.id, existingIds));
  }

  if (!payload.isRelevant) {
    const missingInputDefIds = inputDefIds.filter(
      (inputDefId) => !existingByInputDefId.has(inputDefId),
    );

    if (missingInputDefIds.length > 0) {
      await db.insert(generationRelevance).values(
        missingInputDefIds.map((inputDefId) => ({
          report_period_id: payload.reportPeriodId,
          service_area_id: payload.serviceAreaId,
          input_def_id: inputDefId,
          energy_provider_id: payload.energyProviderId,
          energy_source_id: payload.energySourceId,
          is_relevant: false,
          is_deleted: false,
          updatedAt: new Date(),
          updatedById: user.id,
        })),
      );
    }
  }

  revalidateRelevanceAndDataEntry();

  return {
    success: true,
    message: "Generation relevance updated.",
  };
}

export async function GetCustomKpiRelevance(): Promise<
  CustomKpiRelevanceItem[]
> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const isGlobalViewer = isGlobalKpiViewer(user.role);

  if (user.org_id == null && !isGlobalViewer) {
    return [];
  }

  const kpis = await db
    .select({
      id: kpiDefinitions.id,
      name: kpiDefinitions.name,
      description: kpiDefinitions.description,
      formula: kpiDefinitions.formula,
      ownerUserId: kpiDefinitions.owner_user_id,
      ownerUtilityId: kpiDefinitions.owner_utility_id,
      utilityIds: kpiDefinitions.utility_ids,
      formulaInputs: kpiDefinitions.formula_inputs,
    })
    .from(kpiDefinitions)
    .where(
      and(
        eq(kpiDefinitions.type, "custom"),
        eq(kpiDefinitions.is_active, true),
        ...(isGlobalViewer
          ? []
          : [
              or(
                eq(kpiDefinitions.is_private, false),
                eq(kpiDefinitions.owner_utility_id, user.org_id!),
              ),
            ]),
      ),
    )
    .orderBy(kpiDefinitions.name);

  const inputDefIds = Array.from(
    new Set(
      kpis.flatMap((kpi) =>
        (kpi.formulaInputs ?? [])
          .map((input) => input.input_def_id)
          .filter((value): value is number => typeof value === "number"),
      ),
    ),
  );

  const inputRows =
    inputDefIds.length > 0
      ? await db
          .select({
            id: inputDefinitions.id,
            name: inputDefinitions.name,
          })
          .from(inputDefinitions)
          .where(inArray(inputDefinitions.id, inputDefIds))
      : [];

  const inputNameById = new Map(inputRows.map((row) => [row.id, row.name]));

  const ownerUserIds = Array.from(
    new Set(
      kpis
        .map((kpi) => kpi.ownerUserId)
        .filter((value): value is string => typeof value === "string"),
    ),
  );

  const ownerUserRows =
    ownerUserIds.length > 0
      ? await db
          .select({
            id: authUsers.id,
            name: authUsers.name,
            organisationId: authUsers.organisation_id,
          })
          .from(authUsers)
          .where(inArray(authUsers.id, ownerUserIds))
      : [];

  const ownerUserNameById = new Map(
    ownerUserRows.map((row) => [row.id, row.name]),
  );

  const ownerUserOrganisationIdByUserId = new Map(
    ownerUserRows
      .filter(
        (row): row is typeof row & { organisationId: number } =>
          typeof row.organisationId === "number",
      )
      .map((row) => [row.id, row.organisationId]),
  );

  const ownerUserOrganisationIds = Array.from(
    new Set(ownerUserOrganisationIdByUserId.values()),
  );

  const ownerUserOrganisationRows =
    ownerUserOrganisationIds.length > 0
      ? await db
          .select({
            id: organisations.id,
            acronym: organisations.acronym,
          })
          .from(organisations)
          .where(inArray(organisations.id, ownerUserOrganisationIds))
      : [];

  const ownerUserOrgAcronymByOrganisationId = new Map(
    ownerUserOrganisationRows
      .filter(
        (row): row is typeof row & { acronym: string } =>
          typeof row.acronym === "string" && row.acronym.trim().length > 0,
      )
      .map((row) => [row.id, row.acronym]),
  );

  const ownerUtilityIds = Array.from(
    new Set(
      kpis
        .map((kpi) => kpi.ownerUtilityId)
        .filter((value): value is number => typeof value === "number"),
    ),
  );

  const ownerUtilityRows =
    ownerUtilityIds.length > 0
      ? await db
          .select({
            id: organisations.id,
            name: organisations.name,
            acronym: organisations.acronym,
          })
          .from(organisations)
          .where(inArray(organisations.id, ownerUtilityIds))
      : [];

  const ownerUtilityNameById = new Map(
    ownerUtilityRows.map((row) => [row.id, row.acronym || row.name]),
  );

  return kpis.map((kpi) => {
    const utilityIds = Array.isArray(kpi.utilityIds)
      ? kpi.utilityIds.filter((value): value is number =>
          Number.isInteger(value),
        )
      : [];

    const inputs = (kpi.formulaInputs ?? [])
      .map((input) => {
        const inputDefId = input.input_def_id;
        if (typeof inputDefId !== "number") {
          return null;
        }

        return {
          inputDefId,
          dataLabel: inputNameById.get(inputDefId) ?? input.variable_name,
        };
      })
      .filter((item): item is CustomKpiRelevanceInput => item !== null);

    return {
      kpiDefId: kpi.id,
      kpiName: kpi.name,
      description: kpi.description,
      formula: kpi.formula,
      ownerUserId: kpi.ownerUserId ?? null,
      ownerUserName:
        (typeof kpi.ownerUserId === "string"
          ? ownerUserNameById.get(kpi.ownerUserId)
          : null) ?? null,
      ownerUserOrgAcronym:
        (typeof kpi.ownerUserId === "string"
          ? ownerUserOrganisationIdByUserId.get(kpi.ownerUserId)
          : null) != null
          ? (ownerUserOrgAcronymByOrganisationId.get(
              ownerUserOrganisationIdByUserId.get(kpi.ownerUserId as string)!,
            ) ?? null)
          : null,
      ownerUtilityId: kpi.ownerUtilityId ?? null,
      ownerUtilityName:
        (typeof kpi.ownerUtilityId === "number"
          ? ownerUtilityNameById.get(kpi.ownerUtilityId)
          : null) ?? null,
      utilityIds,
      isRelevant: utilityIds.includes(user.org_id!),
      inputs,
    };
  });
}

export async function SetCustomKpiRelevance(
  payload: SetCustomKpiRelevancePayload,
): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      message: "User not authenticated",
    };
  }

  if (user.org_id == null) {
    return {
      success: false,
      message: "Your account is not linked to a utility.",
    };
  }

  const [kpi] = await db
    .select({
      id: kpiDefinitions.id,
      type: kpiDefinitions.type,
      utility_ids: kpiDefinitions.utility_ids,
    })
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.id, payload.kpiDefId))
    .limit(1);

  if (!kpi || kpi.type !== "custom") {
    return {
      success: false,
      message: "Selected KPI is not a custom KPI.",
    };
  }

  const currentUtilityIds = Array.isArray(kpi.utility_ids)
    ? kpi.utility_ids.filter((value): value is number =>
        Number.isInteger(value),
      )
    : [];

  const nextUtilityIds = payload.isRelevant
    ? Array.from(new Set([...currentUtilityIds, user.org_id]))
    : currentUtilityIds.filter((utilityId) => utilityId !== user.org_id);

  await db
    .update(kpiDefinitions)
    .set({
      utility_ids: nextUtilityIds,
    })
    .where(eq(kpiDefinitions.id, payload.kpiDefId));

  revalidateRelevanceAndDataEntry();
  revalidatePath("/settings/kpi");

  return {
    success: true,
    message: "Custom KPI relevance updated.",
  };
}

export async function GetDevInputRelevance(): Promise<DevInputRelevanceItem[]> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  if (user.role !== "DEV") {
    throw new Error("Only DEV users can access input relevance.");
  }

  const rows = await db
    .select({
      id: inputRelevance.id,
      inputDefId: inputRelevance.input_def_id,
      inputDef: inputDefinitions.name,
      dimensionId: inputRelevance.dimension_id,
      dimension: managedListItems.name,
      isRelevant: inputRelevance.is_relevant,
    })
    .from(inputRelevance)
    .innerJoin(
      inputDefinitions,
      eq(inputRelevance.input_def_id, inputDefinitions.id),
    )
    .innerJoin(
      managedListItems,
      eq(inputRelevance.dimension_id, managedListItems.id),
    )
    .orderBy(asc(inputDefinitions.name), asc(managedListItems.name));

  return rows;
}

export async function GetDevInputRelevanceOptions(): Promise<{
  inputOptions: DevInputRelevanceOption[];
  dimensionOptions: DevInputRelevanceOption[];
}> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  if (user.role !== "DEV") {
    throw new Error("Only DEV users can access input relevance options.");
  }

  const inputOptions = await db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
    })
    .from(inputDefinitions)
    .where(eq(inputDefinitions.is_active, true))
    .orderBy(asc(inputDefinitions.name));

  const dimensionRows = await db
    .select({
      id: managedListItems.id,
      listName: managedLists.name,
      itemName: managedListItems.name,
    })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedListItems.is_active, true),
        eq(managedLists.is_active, true),
      ),
    )
    .orderBy(asc(managedLists.name), asc(managedListItems.name));

  return {
    inputOptions,
    dimensionOptions: dimensionRows.map((row) => ({
      id: row.id,
      name: `${row.listName} - ${row.itemName}`,
    })),
  };
}

export async function AddDevInputRelevance(payload: {
  inputDefId: number;
  dimensionId: number;
  isRelevant: boolean;
}): Promise<{
  success: boolean;
  message: string;
  item?: DevInputRelevanceItem;
}> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      message: "User not authenticated",
    };
  }

  if (user.role !== "DEV") {
    return {
      success: false,
      message: "Only DEV users can add input relevance.",
    };
  }

  const [inputDef] = await db
    .select({ id: inputDefinitions.id })
    .from(inputDefinitions)
    .where(
      and(
        eq(inputDefinitions.id, payload.inputDefId),
        eq(inputDefinitions.is_active, true),
      ),
    )
    .limit(1);

  if (!inputDef) {
    return {
      success: false,
      message: "Selected input is invalid.",
    };
  }

  const [dimension] = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .where(
      and(
        eq(managedListItems.id, payload.dimensionId),
        eq(managedListItems.is_active, true),
      ),
    )
    .limit(1);

  if (!dimension) {
    return {
      success: false,
      message: "Selected dimension is invalid.",
    };
  }

  const [duplicate] = await db
    .select({ id: inputRelevance.id })
    .from(inputRelevance)
    .where(
      and(
        eq(inputRelevance.input_def_id, payload.inputDefId),
        eq(inputRelevance.dimension_id, payload.dimensionId),
      ),
    )
    .limit(1);

  if (duplicate) {
    return {
      success: false,
      message: "A relevance row for this input and dimension already exists.",
    };
  }

  const [created] = await db
    .insert(inputRelevance)
    .values({
      input_def_id: payload.inputDefId,
      dimension_id: payload.dimensionId,
      is_relevant: payload.isRelevant,
    })
    .returning({ id: inputRelevance.id });

  if (!created) {
    return {
      success: false,
      message: "Failed to create input relevance row.",
    };
  }

  const [item] = await db
    .select({
      id: inputRelevance.id,
      inputDefId: inputRelevance.input_def_id,
      inputDef: inputDefinitions.name,
      dimensionId: inputRelevance.dimension_id,
      dimension: managedListItems.name,
      isRelevant: inputRelevance.is_relevant,
    })
    .from(inputRelevance)
    .innerJoin(
      inputDefinitions,
      eq(inputRelevance.input_def_id, inputDefinitions.id),
    )
    .innerJoin(
      managedListItems,
      eq(inputRelevance.dimension_id, managedListItems.id),
    )
    .where(eq(inputRelevance.id, created.id))
    .limit(1);

  revalidateRelevanceAndDataEntry();

  return {
    success: true,
    message: "Input relevance row added.",
    item,
  };
}

export async function UpdateDevInputRelevance(payload: {
  id: number;
  inputDefId: number;
  dimensionId: number;
  isRelevant: boolean;
}): Promise<{
  success: boolean;
  message: string;
  item?: DevInputRelevanceItem;
}> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      message: "User not authenticated",
    };
  }

  if (user.role !== "DEV") {
    return {
      success: false,
      message: "Only DEV users can update input relevance.",
    };
  }

  const [existing] = await db
    .select({ id: inputRelevance.id })
    .from(inputRelevance)
    .where(eq(inputRelevance.id, payload.id))
    .limit(1);

  if (!existing) {
    return {
      success: false,
      message: "Input relevance row not found.",
    };
  }

  const [inputDef] = await db
    .select({ id: inputDefinitions.id })
    .from(inputDefinitions)
    .where(
      and(
        eq(inputDefinitions.id, payload.inputDefId),
        eq(inputDefinitions.is_active, true),
      ),
    )
    .limit(1);

  if (!inputDef) {
    return {
      success: false,
      message: "Selected input is invalid.",
    };
  }

  const [dimension] = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .where(
      and(
        eq(managedListItems.id, payload.dimensionId),
        eq(managedListItems.is_active, true),
      ),
    )
    .limit(1);

  if (!dimension) {
    return {
      success: false,
      message: "Selected dimension is invalid.",
    };
  }

  const duplicateRows = await db
    .select({ id: inputRelevance.id })
    .from(inputRelevance)
    .where(
      and(
        eq(inputRelevance.input_def_id, payload.inputDefId),
        eq(inputRelevance.dimension_id, payload.dimensionId),
      ),
    )
    .limit(2);

  if (duplicateRows.some((row) => row.id !== payload.id)) {
    return {
      success: false,
      message: "A relevance row for this input and dimension already exists.",
    };
  }

  await db
    .update(inputRelevance)
    .set({
      input_def_id: payload.inputDefId,
      dimension_id: payload.dimensionId,
      is_relevant: payload.isRelevant,
    })
    .where(eq(inputRelevance.id, payload.id));

  const [item] = await db
    .select({
      id: inputRelevance.id,
      inputDefId: inputRelevance.input_def_id,
      inputDef: inputDefinitions.name,
      dimensionId: inputRelevance.dimension_id,
      dimension: managedListItems.name,
      isRelevant: inputRelevance.is_relevant,
    })
    .from(inputRelevance)
    .innerJoin(
      inputDefinitions,
      eq(inputRelevance.input_def_id, inputDefinitions.id),
    )
    .innerJoin(
      managedListItems,
      eq(inputRelevance.dimension_id, managedListItems.id),
    )
    .where(eq(inputRelevance.id, payload.id))
    .limit(1);

  revalidateRelevanceAndDataEntry();

  return {
    success: true,
    message: "Input relevance row updated.",
    item,
  };
}

export async function SetDevInputRelevance(payload: {
  id: number;
  isRelevant: boolean;
}): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      message: "User not authenticated",
    };
  }

  if (user.role !== "DEV") {
    return {
      success: false,
      message: "Only DEV users can update input relevance.",
    };
  }

  const [existing] = await db
    .select({ id: inputRelevance.id })
    .from(inputRelevance)
    .where(eq(inputRelevance.id, payload.id))
    .limit(1);

  if (!existing) {
    return {
      success: false,
      message: "Input relevance row not found.",
    };
  }

  await db
    .update(inputRelevance)
    .set({
      is_relevant: payload.isRelevant,
    })
    .where(eq(inputRelevance.id, payload.id));

  revalidateRelevanceAndDataEntry();

  return {
    success: true,
    message: "Input relevance updated.",
  };
}
