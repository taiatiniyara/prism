"use server";

import { db } from "@/db/connection";
import {
  dataEntries,
  energyResources,
  inputRelevance,
  measureDefinitions,
  organisations,
  serviceAreas,
  tariffRelevance,
  transmissionRelevance,
  user as authUsers,
} from "@/db/schema";
import { kpiDefinitions } from "@/db/schema/kpi";
import {
  energyResourceTypeRelevance,
  managedListItems,
  managedLists,
} from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { getCurrentUser, hasGlobalUtilityAccess } from "@/lib/user.service";
import { formatReportPeriodDisplay } from "@/lib/formatters";
import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { toPositiveInteger } from "./energyResourceTypeRelevanceBuilder.shared";
import { buildGenerationTypeSourcePairs } from "./generationRelevance.shared";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  isNotNull,
  or,
  sql,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { GetManagedListItemByName } from "../managed-lists/service";
import { EnergyResourcePeriodEntry } from "@/db/schema/utility";

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

interface MeasureDefinitionOption {
  id: number;
  name: string;
  sortOrder: number | null;
}

type UtilityScopedRelevanceFilter = {
  reportPeriodId?: number | null;
  serviceAreaId?: number | null;
};

const isGlobalKpiViewer = (user: {
  role: string | null;
  is_utility_context_scoped?: boolean;
}): boolean => hasGlobalUtilityAccess(user);

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

export interface DevOrganisationRelevanceOption {
  id: number;
  name: string;
  acronym: string | null;
}

export interface DevOrganisationRelevancePivotRow {
  id: string;
  label: string;
  values: Array<{
    organisationId: number;
    count: number;
  }>;
}

export interface DevEnergyResourceTypeRelevanceItem {
  id: number;
  energyResourceTypeId: number;
  energyResourceType: string;
  energyTypeId: number;
  energyType: string;
  energySourceId: number;
  energySource: string;
}

const ENERGY_RESOURCE_TYPE_LIST_ALIASES = [
  "Energy Resource Type",
  "Energy Resouce Type",
];

const ENERGY_TYPE_LIST_ALIASES = ["Energy Type", "Energy Types"];

const ENERGY_SOURCE_LIST_ALIASES = [
  "Energy Source",
  "Storage Energy Source",
  "Energy Storage Source",
  "Generator Energy Source",
];

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
  currentUser: {
    role: string | null;
    is_utility_context_scoped?: boolean;
  },
  filters: UtilityScopedRelevanceFilter,
): Promise<{
  serviceAreaOptions: RelevanceFilterOption[];
  reportPeriodOptions: RelevanceFilterOption[];
  selectedReportPeriodId: number | null;
  selectedServiceAreaId: number | null;
}> => {
  const serviceAreaConditions = [eq(serviceAreas.utility_id, utilityId)];

  if (!hasGlobalUtilityAccess(currentUser)) {
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

const getMeasureDefinitionsForStructure = async (
  structureName: string,
): Promise<MeasureDefinitionOption[]> => {
  const structureManagedListItem =
    await GetManagedListItemByName(structureName);

  if (!structureManagedListItem) {
    throw new Error(`${structureName} managed list item not found`);
  }

  const rows = await db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      sortOrder: measureDefinitions.sort_order,
    })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.is_aggregated, false),
        or(
          eq(measureDefinitions.measures_subgroup_id, structureManagedListItem.id),
          eq(measureDefinitions.measures_group_id, structureManagedListItem.id),
        ),
      ),
    )
    .orderBy(asc(measureDefinitions.sort_order), asc(measureDefinitions.name));

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

const getManagedDimensionItemsMergedByAliases = async (
  listNames: string[],
): Promise<{ id: number; name: string }[]> => {
  const merged = new Map<number, { id: number; name: string }>();

  for (const listName of listNames) {
    const rows = await getManagedDimensionItems(listName);

    for (const row of rows) {
      merged.set(row.id, row);
    }
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
};

const filterGenerationResourceTypes = <T extends { name: string }>(
  items: T[],
): T[] => {
  return items.filter((item) => item.name.trim().toLowerCase() !== "nill");
};

const getMeasureDefinitionsForAnyStructure = async (
  structureNames: string[],
): Promise<MeasureDefinitionOption[]> => {
  for (const structureName of structureNames) {
    try {
      const rows = await getMeasureDefinitionsForStructure(structureName);

      if (rows.length > 0) {
        return rows;
      }
    } catch {
      // Continue trying aliases when a specific managed list item is unavailable.
    }
  }

  return [];
};

const getGenerationMeasureDefinitions = async (): Promise<
  MeasureDefinitionOption[]
> => {
  const structureScoped = await getMeasureDefinitionsForAnyStructure([
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
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      sortOrder: measureDefinitions.sort_order,
    })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.is_aggregated, false),
      ),
    )
    .orderBy(asc(measureDefinitions.sort_order), asc(measureDefinitions.name));

  if (activeRows.length > 0) {
    return activeRows;
  }

  // Final fallback for partially migrated datasets where active flags were reset.
  return db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      sortOrder: measureDefinitions.sort_order,
    })
    .from(measureDefinitions)
    .where(eq(measureDefinitions.is_aggregated, false))
    .orderBy(asc(measureDefinitions.sort_order), asc(measureDefinitions.name));
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
  } = await getUtilityRelevanceFilterContext(user.org_id!, user, filters);

  const inputList = await getMeasureDefinitionsForStructure("Tariff Structure");

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

  const tariffRelRows = await db
    .select({
      report_period_id: tariffRelevance.report_period_id,
      payment_mode_id: tariffRelevance.payment_mode_id,
      customer_type_id: tariffRelevance.customer_type_id,
      measure_def_id: tariffRelevance.measure_def_id,
      is_relevant: tariffRelevance.is_relevant,
      id: tariffRelevance.id,
      updatedAt: tariffRelevance.updatedAt,
    })
    .from(tariffRelevance)
    .where(
      and(
        eq(tariffRelevance.report_period_id, selectedReportPeriodId),
        eq(tariffRelevance.service_area_id, selectedServiceAreaId),
        eq(tariffRelevance.is_deleted, false),
        inArray(
          tariffRelevance.measure_def_id,
          inputList.map((i) => i.id),
        ),
      ),
    )
    .orderBy(desc(tariffRelevance.updatedAt));

  const relevanceByDimension = new Map<
    string,
    Map<number, { isRelevant: boolean; dataEntryId: string }>
  >();

  for (const entry of tariffRelRows) {
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

    if (existing.has(entry.measure_def_id)) {
      continue;
    }

    existing.set(entry.measure_def_id, {
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

  const inputList = await getMeasureDefinitionsForStructure("Tariff Structure");

  if (!inputList.some((input) => input.id === payload.inputDefId)) {
    return {
      success: false,
      message: "Selected data label is not a Tariff input.",
    };
  }

  const [existing] = await db
    .select({ id: tariffRelevance.id })
    .from(tariffRelevance)
    .where(
      and(
        eq(tariffRelevance.report_period_id, payload.reportPeriodId),
        eq(tariffRelevance.service_area_id, payload.serviceAreaId),
        eq(tariffRelevance.measure_def_id, payload.inputDefId),
        eq(tariffRelevance.payment_mode_id, payload.paymentModeId),
        eq(tariffRelevance.customer_type_id, payload.customerTypeId),
      ),
    )
    .orderBy(desc(tariffRelevance.updatedAt))
    .limit(1);

  if (!existing && payload.isRelevant) {
    return {
      success: true,
      message: "Relevance already set by default.",
    };
  }

  if (existing) {
    await db
      .update(tariffRelevance)
      .set({
        is_relevant: payload.isRelevant,
        is_deleted: false,
        updatedAt: new Date(),
        updatedById: user.id,
      })
      .where(eq(tariffRelevance.id, existing.id));
  } else {
    await db.insert(tariffRelevance).values({
      report_period_id: payload.reportPeriodId,
      service_area_id: payload.serviceAreaId,
      measure_def_id: payload.inputDefId,
      payment_mode_id: payload.paymentModeId,
      customer_type_id: payload.customerTypeId,
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
  } = await getUtilityRelevanceFilterContext(user.org_id!, user, filters);

  const inputList = await getMeasureDefinitionsForStructure("Transmission");

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
      inputDefId: transmissionRelevance.measure_def_id,
      isRelevant: transmissionRelevance.is_relevant,
      id: transmissionRelevance.id,
      updatedAt: transmissionRelevance.updatedAt,
    })
    .from(transmissionRelevance)
    .where(
      and(
        eq(transmissionRelevance.report_period_id, selectedReportPeriodId),
        eq(transmissionRelevance.service_area_id, selectedServiceAreaId),
        eq(transmissionRelevance.is_deleted, false),
        inArray(
          transmissionRelevance.measure_def_id,
          inputList.map((input) => input.id),
        ),
      ),
    )
    .orderBy(desc(transmissionRelevance.updatedAt));

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

  const inputList = await getMeasureDefinitionsForStructure("Transmission");

  if (!inputList.some((input) => input.id === payload.inputDefId)) {
    return {
      success: false,
      message: "Selected data label is not a Transmission input.",
    };
  }

  const [existing] = await db
    .select({ id: transmissionRelevance.id })
    .from(transmissionRelevance)
    .where(
      and(
        eq(transmissionRelevance.report_period_id, payload.reportPeriodId),
        eq(transmissionRelevance.service_area_id, payload.serviceAreaId),
        eq(transmissionRelevance.measure_def_id, payload.inputDefId),
      ),
    )
    .orderBy(desc(transmissionRelevance.updatedAt))
    .limit(1);

  if (!existing && payload.isRelevant) {
    return {
      success: true,
      message: "Relevance already set by default.",
    };
  }

  if (existing) {
    await db
      .update(transmissionRelevance)
      .set({
        is_relevant: payload.isRelevant,
        is_deleted: false,
        updatedAt: new Date(),
        updatedById: user.id,
      })
      .where(eq(transmissionRelevance.id, existing.id));
  } else {
    await db.insert(transmissionRelevance).values({
      report_period_id: payload.reportPeriodId,
      service_area_id: payload.serviceAreaId,
      measure_def_id: payload.inputDefId,
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
  } = await getUtilityRelevanceFilterContext(user.org_id!, user, filters);

  const inputList = await getGenerationMeasureDefinitions();
  let energyProviders = await getManagedDimensionItems("Energy Provider");
  let energySources = await getManagedDimensionItemsMergedByAliases([
    "Energy Source",
    "Storage Energy Source",
    "Energy Storage Source",
    "Generator Energy Source",
  ]);
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

  const configuredTypeSourceMappings = await db
    .select({
      energyResourceTypeId: energyResourceTypeRelevance.energy_resource_type_id,
      energySourceId: energyResourceTypeRelevance.energy_source_id,
    })
    .from(energyResourceTypeRelevance);

  const generationTypeSourcePairs = buildGenerationTypeSourcePairs({
    energyResourceTypes,
    energySources,
    mappings: configuredTypeSourceMappings,
  });

  const visibleEnergyResourceTypes = Array.from(
    new Set(generationTypeSourcePairs.map((pair) => pair.energyResourceType)),
  ).sort((a, b) => a.localeCompare(b));

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
      energyResourceTypes: visibleEnergyResourceTypes,
      rows: generationTypeSourcePairs.map((pair) => ({
        energySourceId: pair.energySourceId,
        energySource: pair.energySource,
        energyResourceTypeId: pair.energyResourceTypeId,
        energyResourceType: pair.energyResourceType,
        cells: energyProviders.map((energyProvider) => ({
          energyProviderId: energyProvider.id,
          energyProvider: energyProvider.name,
          energyResourceTypeId: pair.energyResourceTypeId,
          energyResourceType: pair.energyResourceType,
          isRelevant: true,
          relatedInputCount: inputDefIds.length,
        })),
      })),
    };
  }

  const energyResourcesForScope =
    selectedServiceAreaId != null
      ? await db
          .select({
            energySourceId: energyResources.energy_source_id,
            energyProviderId: energyResources.energy_provider_id,
            periodEntries: energyResources.period_entries,
          })
          .from(energyResources)
          .where(
            and(
              eq(energyResources.utility_id, user.org_id!),
              eq(energyResources.service_area_id, selectedServiceAreaId),
              eq(energyResources.is_virtual, false),
            ),
          )
      : [];

  const cellHasFalse = new Map<string, boolean>();

  for (const resource of energyResourcesForScope) {
    const entries =
      (resource.periodEntries as EnergyResourcePeriodEntry[] | undefined) ?? [];
    for (const pe of entries) {
      if (pe.report_period_id === selectedReportPeriodId && !pe.is_active) {
        const key = `${selectedReportPeriodId}:${resource.energySourceId}:${resource.energyProviderId}`;
        cellHasFalse.set(key, true);
      }
    }
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
    energyResourceTypes: visibleEnergyResourceTypes,
    rows: generationTypeSourcePairs.map((pair) => ({
      energySourceId: pair.energySourceId,
      energySource: pair.energySource,
      energyResourceTypeId: pair.energyResourceTypeId,
      energyResourceType: pair.energyResourceType,
      cells: energyProviders.map((energyProvider) => {
        const key = `${selectedReportPeriodId}:${pair.energySourceId}:${energyProvider.id}`;

        return {
          energyProviderId: energyProvider.id,
          energyProvider: energyProvider.name,
          isRelevant: !cellHasFalse.get(key),
          relatedInputCount: inputDefIds.length,
        };
      }),
    })),
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

  const resources = await db
    .select({
      id: energyResources.id,
      periodEntries: energyResources.period_entries,
    })
    .from(energyResources)
    .where(
      and(
        eq(energyResources.utility_id, user.org_id!),
        eq(energyResources.service_area_id, payload.serviceAreaId),
        eq(energyResources.energy_provider_id, payload.energyProviderId),
        eq(energyResources.energy_source_id, payload.energySourceId),
      ),
    );

  if (resources.length === 0) {
    return {
      success: false,
      message: "No energy resources found for this provider and source.",
    };
  }

  for (const resource of resources) {
    const periodEntries =
      (resource.periodEntries as EnergyResourcePeriodEntry[] | undefined) ?? [];
    const existingIdx = periodEntries.findIndex(
      (pe) => pe.report_period_id === payload.reportPeriodId,
    );

    let updatedEntries: EnergyResourcePeriodEntry[];

    if (existingIdx >= 0) {
      updatedEntries = periodEntries.map((pe, i) =>
        i === existingIdx ? { ...pe, is_active: payload.isRelevant } : pe,
      );
    } else {
      updatedEntries = [
        ...periodEntries,
        {
          report_period_id: payload.reportPeriodId,
          capacity_mw: null,
          is_active: payload.isRelevant,
        },
      ];
    }

    await db
      .update(energyResources)
      .set({
        period_entries: updatedEntries,
        updated_at: new Date(),
        updated_by_id: user.id,
      })
      .where(eq(energyResources.id, resource.id));
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

  const isGlobalViewer = isGlobalKpiViewer(user);

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
          .map((input) => input.measure_def_id)
          .filter((value): value is number => typeof value === "number"),
      ),
    ),
  );

  const inputRows =
    inputDefIds.length > 0
      ? await db
          .select({
            id: measureDefinitions.id,
            name: measureDefinitions.name,
          })
          .from(measureDefinitions)
          .where(inArray(measureDefinitions.id, inputDefIds))
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
        const inputDefId = input.measure_def_id;
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

export async function GetDevOrganisationRelevancePivot(): Promise<{
  organisations: DevOrganisationRelevanceOption[];
  rows: DevOrganisationRelevancePivotRow[];
}> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  if (user.role !== "DEV") {
    throw new Error("Only DEV users can access organisation relevance.");
  }

  const utilityRows = await db
    .select({
      id: organisations.id,
      name: organisations.name,
      acronym: organisations.acronym,
    })
    .from(organisations)
    .where(
      and(
        eq(organisations.is_active, true),
        eq(organisations.is_utility, true),
      ),
    )
    .orderBy(asc(organisations.acronym), asc(organisations.name));

  const utilityIdSet = new Set(utilityRows.map((utility) => utility.id));

  const toValues = (countsByOrganisationId: Map<number, number>) =>
    utilityRows.map((utility) => ({
      organisationId: utility.id,
      count: countsByOrganisationId.get(utility.id) ?? 0,
    }));

  const tariffInputDefIds = (
    await getMeasureDefinitionsForAnyStructure(["Tariff Structure"])
  ).map((input) => input.id);

  const transmissionInputDefIds = (
    await getMeasureDefinitionsForAnyStructure(["Transmission"])
  ).map((input) => input.id);

  const dataEntryTotalByOrganisationId = new Map<number, number>();
  const dataEntryRelevantByOrganisationId = new Map<number, number>();
  const dataEntryNotRelevantByOrganisationId = new Map<number, number>();
  {
    const totalRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(eq(dataEntries.is_deleted, false))
      .groupBy(serviceAreas.utility_id);

    for (const row of totalRows) {
      if (utilityIdSet.has(row.organisationId)) {
        dataEntryTotalByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }

    const relevantRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, true),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of relevantRows) {
      if (utilityIdSet.has(row.organisationId)) {
        dataEntryRelevantByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }

    const notRelevantRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, false),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of notRelevantRows) {
      if (utilityIdSet.has(row.organisationId)) {
        dataEntryNotRelevantByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }
  }

  const dataEntryTariffTotalByOrganisationId = new Map<number, number>();
  const dataEntryTariffRelevantByOrganisationId = new Map<number, number>();
  const dataEntryTariffNotRelevantByOrganisationId = new Map<number, number>();
  if (tariffInputDefIds.length > 0) {
    const totalRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          inArray(dataEntries.measure_def_id, tariffInputDefIds),
          isNotNull(dataEntries.payment_mode_id),
          isNotNull(dataEntries.customer_type_id),
          isNull(dataEntries.energy_resource_id),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of totalRows) {
      if (utilityIdSet.has(row.organisationId)) {
        dataEntryTariffTotalByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }

    const relevantRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, true),
          inArray(dataEntries.measure_def_id, tariffInputDefIds),
          isNotNull(dataEntries.payment_mode_id),
          isNotNull(dataEntries.customer_type_id),
          isNull(dataEntries.energy_resource_id),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of relevantRows) {
      if (utilityIdSet.has(row.organisationId)) {
        dataEntryTariffRelevantByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }

    const notRelevantRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, false),
          inArray(dataEntries.measure_def_id, tariffInputDefIds),
          isNotNull(dataEntries.payment_mode_id),
          isNotNull(dataEntries.customer_type_id),
          isNull(dataEntries.energy_resource_id),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of notRelevantRows) {
      if (utilityIdSet.has(row.organisationId)) {
        dataEntryTariffNotRelevantByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }
  }

  const dataEntryTransmissionTotalByOrganisationId = new Map<number, number>();
  const dataEntryTransmissionRelevantByOrganisationId = new Map<
    number,
    number
  >();
  const dataEntryTransmissionNotRelevantByOrganisationId = new Map<
    number,
    number
  >();
  if (transmissionInputDefIds.length > 0) {
    const totalRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          inArray(dataEntries.measure_def_id, transmissionInputDefIds),
          isNull(dataEntries.payment_mode_id),
          isNull(dataEntries.customer_type_id),
          isNull(dataEntries.energy_resource_id),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of totalRows) {
      if (utilityIdSet.has(row.organisationId)) {
        dataEntryTransmissionTotalByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }

    const relevantRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, true),
          inArray(dataEntries.measure_def_id, transmissionInputDefIds),
          isNull(dataEntries.payment_mode_id),
          isNull(dataEntries.customer_type_id),
          isNull(dataEntries.energy_resource_id),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of relevantRows) {
      if (utilityIdSet.has(row.organisationId)) {
        dataEntryTransmissionRelevantByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }

    const notRelevantRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, false),
          inArray(dataEntries.measure_def_id, transmissionInputDefIds),
          isNull(dataEntries.payment_mode_id),
          isNull(dataEntries.customer_type_id),
          isNull(dataEntries.energy_resource_id),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of notRelevantRows) {
      if (utilityIdSet.has(row.organisationId)) {
        dataEntryTransmissionNotRelevantByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }
  }

  const dataEntryGenerationTotalByOrganisationId = new Map<number, number>();
  const dataEntryGenerationRelevantByOrganisationId = new Map<number, number>();
  const dataEntryGenerationNotRelevantByOrganisationId = new Map<
    number,
    number
  >();
  {
    const totalRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          isNotNull(dataEntries.energy_resource_id),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of totalRows) {
      if (utilityIdSet.has(row.organisationId)) {
        dataEntryGenerationTotalByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }

    const relevantRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, true),
          isNotNull(dataEntries.energy_resource_id),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of relevantRows) {
      if (utilityIdSet.has(row.organisationId)) {
        dataEntryGenerationRelevantByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }

    const notRelevantRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, false),
          isNotNull(dataEntries.energy_resource_id),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of notRelevantRows) {
      if (utilityIdSet.has(row.organisationId)) {
        dataEntryGenerationNotRelevantByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }
  }

  const subtractMaps = (
    minuend: Map<number, number>,
    subtrahend: Map<number, number>,
  ): Map<number, number> => {
    const next = new Map<number, number>();

    for (const utility of utilityRows) {
      next.set(
        utility.id,
        Math.max(
          0,
          (minuend.get(utility.id) ?? 0) - (subtrahend.get(utility.id) ?? 0),
        ),
      );
    }

    return next;
  };

  const tariffTotalByOrganisationId = new Map<number, number>();
  const tariffNotRelevantByOrganisationId = new Map<number, number>();
  if (tariffInputDefIds.length > 0) {
    const totalRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          inArray(dataEntries.measure_def_id, tariffInputDefIds),
          isNotNull(dataEntries.payment_mode_id),
          isNotNull(dataEntries.customer_type_id),
          isNull(dataEntries.energy_resource_id),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of totalRows) {
      if (utilityIdSet.has(row.organisationId)) {
        tariffTotalByOrganisationId.set(row.organisationId, Number(row.count));
      }
    }

    const notRelevantRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, false),
          inArray(dataEntries.measure_def_id, tariffInputDefIds),
          isNotNull(dataEntries.payment_mode_id),
          isNotNull(dataEntries.customer_type_id),
          isNull(dataEntries.energy_resource_id),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of notRelevantRows) {
      if (utilityIdSet.has(row.organisationId)) {
        tariffNotRelevantByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }
  }

  const tariffRelevantByOrganisationId = subtractMaps(
    tariffTotalByOrganisationId,
    tariffNotRelevantByOrganisationId,
  );

  const transmissionTotalByOrganisationId = new Map<number, number>();
  const transmissionNotRelevantByOrganisationId = new Map<number, number>();
  if (transmissionInputDefIds.length > 0) {
    const totalRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          inArray(dataEntries.measure_def_id, transmissionInputDefIds),
          isNull(dataEntries.payment_mode_id),
          isNull(dataEntries.customer_type_id),
          isNull(dataEntries.energy_resource_id),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of totalRows) {
      if (utilityIdSet.has(row.organisationId)) {
        transmissionTotalByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }

    const notRelevantRows = await db
      .select({
        organisationId: serviceAreas.utility_id,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(dataEntries)
      .innerJoin(serviceAreas, eq(dataEntries.service_area_id, serviceAreas.id))
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, false),
          inArray(dataEntries.measure_def_id, transmissionInputDefIds),
          isNull(dataEntries.payment_mode_id),
          isNull(dataEntries.customer_type_id),
          isNull(dataEntries.energy_resource_id),
        ),
      )
      .groupBy(serviceAreas.utility_id);

    for (const row of notRelevantRows) {
      if (utilityIdSet.has(row.organisationId)) {
        transmissionNotRelevantByOrganisationId.set(
          row.organisationId,
          Number(row.count),
        );
      }
    }
  }

  const transmissionRelevantByOrganisationId = subtractMaps(
    transmissionTotalByOrganisationId,
    transmissionNotRelevantByOrganisationId,
  );

  const generationTotalByOrganisationId = new Map<number, number>();
  const generationNotRelevantByOrganisationId = new Map<number, number>();
  {
    const resources = await db
      .select({
        utilityId: energyResources.utility_id,
        periodEntries: energyResources.period_entries,
      })
      .from(energyResources)
      .where(eq(energyResources.is_virtual, false));

    for (const resource of resources) {
      if (!utilityIdSet.has(resource.utilityId)) {
        continue;
      }

      const entries =
        (resource.periodEntries as EnergyResourcePeriodEntry[] | undefined) ??
        [];
      generationTotalByOrganisationId.set(
        resource.utilityId,
        (generationTotalByOrganisationId.get(resource.utilityId) ?? 0) +
          entries.length,
      );

      for (const pe of entries) {
        if (!pe.is_active) {
          generationNotRelevantByOrganisationId.set(
            resource.utilityId,
            (generationNotRelevantByOrganisationId.get(resource.utilityId) ??
              0) + 1,
          );
        }
      }
    }
  }

  const generationRelevantByOrganisationId = subtractMaps(
    generationTotalByOrganisationId,
    generationNotRelevantByOrganisationId,
  );

  const customKpiAssignedByOrganisationId = new Map<number, number>();
  const customKpiOwnedByOrganisationId = new Map<number, number>();
  {
    const kpis = await db
      .select({
        ownerUtilityId: kpiDefinitions.owner_utility_id,
        utilityIds: kpiDefinitions.utility_ids,
      })
      .from(kpiDefinitions)
      .where(
        and(
          eq(kpiDefinitions.type, "custom"),
          eq(kpiDefinitions.is_active, true),
        ),
      );

    for (const kpi of kpis) {
      if (
        typeof kpi.ownerUtilityId === "number" &&
        utilityIdSet.has(kpi.ownerUtilityId)
      ) {
        customKpiOwnedByOrganisationId.set(
          kpi.ownerUtilityId,
          (customKpiOwnedByOrganisationId.get(kpi.ownerUtilityId) ?? 0) + 1,
        );
      }

      const utilityIds = Array.isArray(kpi.utilityIds)
        ? kpi.utilityIds.filter((value): value is number =>
            Number.isInteger(value),
          )
        : [];

      for (const utilityId of utilityIds) {
        if (!utilityIdSet.has(utilityId)) {
          continue;
        }

        customKpiAssignedByOrganisationId.set(
          utilityId,
          (customKpiAssignedByOrganisationId.get(utilityId) ?? 0) + 1,
        );
      }
    }
  }

  return {
    organisations: utilityRows,
    rows: [
      {
        id: "data-entry-total",
        label: "Data entry rows (all, total)",
        values: toValues(dataEntryTotalByOrganisationId),
      },
      {
        id: "data-entry-relevant",
        label: "Data entry rows (all, relevant)",
        values: toValues(dataEntryRelevantByOrganisationId),
      },
      {
        id: "data-entry-not-relevant",
        label: "Data entry rows (all, not-relevant)",
        values: toValues(dataEntryNotRelevantByOrganisationId),
      },
      {
        id: "data-entry-tariff-total",
        label: "Data entry rows (tariff, total)",
        values: toValues(dataEntryTariffTotalByOrganisationId),
      },
      {
        id: "data-entry-tariff-relevant",
        label: "Data entry rows (tariff, relevant)",
        values: toValues(dataEntryTariffRelevantByOrganisationId),
      },
      {
        id: "data-entry-tariff-not-relevant",
        label: "Data entry rows (tariff, not-relevant)",
        values: toValues(dataEntryTariffNotRelevantByOrganisationId),
      },
      {
        id: "data-entry-transmission-total",
        label: "Data entry rows (transmission, total)",
        values: toValues(dataEntryTransmissionTotalByOrganisationId),
      },
      {
        id: "data-entry-transmission-relevant",
        label: "Data entry rows (transmission, relevant)",
        values: toValues(dataEntryTransmissionRelevantByOrganisationId),
      },
      {
        id: "data-entry-transmission-not-relevant",
        label: "Data entry rows (transmission, not-relevant)",
        values: toValues(dataEntryTransmissionNotRelevantByOrganisationId),
      },
      {
        id: "data-entry-generation-total",
        label: "Data entry rows (generation, total)",
        values: toValues(dataEntryGenerationTotalByOrganisationId),
      },
      {
        id: "data-entry-generation-relevant",
        label: "Data entry rows (generation, relevant)",
        values: toValues(dataEntryGenerationRelevantByOrganisationId),
      },
      {
        id: "data-entry-generation-not-relevant",
        label: "Data entry rows (generation, not-relevant)",
        values: toValues(dataEntryGenerationNotRelevantByOrganisationId),
      },
      {
        id: "custom-kpi-assigned",
        label: "Custom KPI assigned relevance (count)",
        values: toValues(customKpiAssignedByOrganisationId),
      },
      {
        id: "custom-kpi-owned",
        label: "Custom KPI owned by organisation (count)",
        values: toValues(customKpiOwnedByOrganisationId),
      },
      {
        id: "tariff-total",
        label: "Tariff explicit relevance rows (total)",
        values: toValues(tariffTotalByOrganisationId),
      },
      {
        id: "tariff-relevant",
        label: "Tariff explicit relevant rows (count)",
        values: toValues(tariffRelevantByOrganisationId),
      },
      {
        id: "tariff-not-relevant",
        label: "Tariff explicit not-relevant rows (count)",
        values: toValues(tariffNotRelevantByOrganisationId),
      },
      {
        id: "transmission-total",
        label: "Transmission explicit relevance rows (total)",
        values: toValues(transmissionTotalByOrganisationId),
      },
      {
        id: "transmission-relevant",
        label: "Transmission explicit relevant rows (count)",
        values: toValues(transmissionRelevantByOrganisationId),
      },
      {
        id: "transmission-not-relevant",
        label: "Transmission explicit not-relevant rows (count)",
        values: toValues(transmissionNotRelevantByOrganisationId),
      },
      {
        id: "generation-total",
        label: "Generation explicit relevance rows (total)",
        values: toValues(generationTotalByOrganisationId),
      },
      {
        id: "generation-relevant",
        label: "Generation explicit relevant rows (count)",
        values: toValues(generationRelevantByOrganisationId),
      },
      {
        id: "generation-not-relevant",
        label: "Energy resource period entries (inactive)",
        values: toValues(generationNotRelevantByOrganisationId),
      },
    ],
  };
}

const getEnergyResourceTypeRelevanceBuilderOptions = async (): Promise<{
  energyResourceTypeOptions: Array<{ id: number; name: string }>;
  energyTypeOptions: Array<{ id: number; name: string }>;
  energySourceOptions: Array<{ id: number; name: string }>;
}> => {
  const [energyResourceTypeOptions, energyTypeOptions, energySourceOptions] =
    await Promise.all([
      getManagedDimensionItemsMergedByAliases(
        ENERGY_RESOURCE_TYPE_LIST_ALIASES,
      ),
      getManagedDimensionItemsMergedByAliases(ENERGY_TYPE_LIST_ALIASES),
      getManagedDimensionItemsMergedByAliases(ENERGY_SOURCE_LIST_ALIASES),
    ]);

  return {
    energyResourceTypeOptions,
    energyTypeOptions,
    energySourceOptions,
  };
};

const mapEnergyResourceTypeRelevanceRows = async (
  rows: Array<{
    id: number;
    energy_resource_type_id: number;
    energy_type_id: number;
    energy_source_id: number;
  }>,
): Promise<DevEnergyResourceTypeRelevanceItem[]> => {
  if (rows.length === 0) {
    return [];
  }

  const managedItemIds = Array.from(
    new Set(
      rows.flatMap((row) => [
        row.energy_resource_type_id,
        row.energy_type_id,
        row.energy_source_id,
      ]),
    ),
  );

  const managedItemRows =
    managedItemIds.length > 0
      ? await db
          .select({
            id: managedListItems.id,
            name: managedListItems.name,
          })
          .from(managedListItems)
          .where(inArray(managedListItems.id, managedItemIds))
      : [];

  const managedItemNameById = new Map(
    managedItemRows.map((row) => [row.id, row.name]),
  );

  return rows
    .map((row) => ({
      id: row.id,
      energyResourceTypeId: row.energy_resource_type_id,
      energyResourceType:
        managedItemNameById.get(row.energy_resource_type_id) ??
        `Unknown (${row.energy_resource_type_id})`,
      energyTypeId: row.energy_type_id,
      energyType:
        managedItemNameById.get(row.energy_type_id) ??
        `Unknown (${row.energy_type_id})`,
      energySourceId: row.energy_source_id,
      energySource:
        managedItemNameById.get(row.energy_source_id) ??
        `Unknown (${row.energy_source_id})`,
    }))
    .sort((a, b) => {
      const byResourceType = a.energyResourceType.localeCompare(
        b.energyResourceType,
      );

      if (byResourceType !== 0) {
        return byResourceType;
      }

      const byType = a.energyType.localeCompare(b.energyType);
      if (byType !== 0) {
        return byType;
      }

      return a.energySource.localeCompare(b.energySource);
    });
};

const resolveEnergyResourceTypeRelevancePayload = (
  payload: Partial<DevEnergyResourceTypeRelevanceItem>,
): {
  energyResourceTypeId: number | null;
  energyTypeId: number | null;
  energySourceId: number | null;
} => {
  return {
    energyResourceTypeId: toPositiveInteger(payload.energyResourceTypeId),
    energyTypeId: toPositiveInteger(payload.energyTypeId),
    energySourceId: toPositiveInteger(payload.energySourceId),
  };
};

const validateEnergyResourceTypeRelevancePayload = async (payload: {
  energyResourceTypeId: number;
  energyTypeId: number;
  energySourceId: number;
}): Promise<{ success: true } | { success: false; message: string }> => {
  const { energyResourceTypeOptions, energyTypeOptions, energySourceOptions } =
    await getEnergyResourceTypeRelevanceBuilderOptions();

  const energyResourceTypeOptionIds = new Set(
    energyResourceTypeOptions.map((item) => item.id),
  );
  if (!energyResourceTypeOptionIds.has(payload.energyResourceTypeId)) {
    return {
      success: false,
      message: "Selected Energy Resource Type is invalid.",
    };
  }

  const energyTypeOptionIds = new Set(energyTypeOptions.map((item) => item.id));
  if (!energyTypeOptionIds.has(payload.energyTypeId)) {
    return {
      success: false,
      message: "Selected Energy Type is invalid.",
    };
  }

  const energySourceOptionIds = new Set(
    energySourceOptions.map((item) => item.id),
  );
  if (!energySourceOptionIds.has(payload.energySourceId)) {
    return {
      success: false,
      message: "Selected Energy Source is invalid.",
    };
  }

  return { success: true };
};

export async function GetDevEnergyResourceTypeRelevance(): Promise<
  DevEnergyResourceTypeRelevanceItem[]
> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  if (user.role !== "DEV") {
    throw new Error(
      "Only DEV users can access energy resource type relevance rows.",
    );
  }

  const rows = await db
    .select()
    .from(energyResourceTypeRelevance)
    .orderBy(energyResourceTypeRelevance.id);

  return mapEnergyResourceTypeRelevanceRows(rows);
}

export async function CreateDevEnergyResourceTypeRelevance(
  payload: DevEnergyResourceTypeRelevanceItem,
): Promise<DataTableFormResponse<DevEnergyResourceTypeRelevanceItem>> {
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
      message: "Only DEV users can add energy resource type relevance rows.",
    };
  }

  const { energyResourceTypeId, energyTypeId, energySourceId } =
    resolveEnergyResourceTypeRelevancePayload(payload);

  if (
    energyResourceTypeId == null ||
    energyTypeId == null ||
    energySourceId == null
  ) {
    return {
      success: false,
      message:
        "Energy Resource Type, Energy Type, and Energy Source are required.",
    };
  }

  const validation = await validateEnergyResourceTypeRelevancePayload({
    energyResourceTypeId,
    energyTypeId,
    energySourceId,
  });

  if (!validation.success) {
    return validation;
  }

  const [duplicate] = await db
    .select({ id: energyResourceTypeRelevance.id })
    .from(energyResourceTypeRelevance)
    .where(
      and(
        eq(
          energyResourceTypeRelevance.energy_resource_type_id,
          energyResourceTypeId,
        ),
        eq(energyResourceTypeRelevance.energy_type_id, energyTypeId),
        eq(energyResourceTypeRelevance.energy_source_id, energySourceId),
      ),
    )
    .limit(1);

  if (duplicate) {
    return {
      success: false,
      message: "This relevance combination already exists.",
    };
  }

  const [created] = await db
    .insert(energyResourceTypeRelevance)
    .values({
      energy_resource_type_id: energyResourceTypeId,
      energy_type_id: energyTypeId,
      energy_source_id: energySourceId,
    })
    .returning({ id: energyResourceTypeRelevance.id });

  if (!created) {
    return {
      success: false,
      message: "Failed to create relevance row.",
    };
  }

  const [createdRow] = await db
    .select()
    .from(energyResourceTypeRelevance)
    .where(eq(energyResourceTypeRelevance.id, created.id))
    .limit(1);

  const [item] = createdRow
    ? await mapEnergyResourceTypeRelevanceRows([createdRow])
    : [];

  revalidateRelevanceAndDataEntry();

  return {
    success: true,
    message: "Relevance row added.",
    data: item,
  };
}

export async function UpdateDevEnergyResourceTypeRelevance(
  payload: Partial<DevEnergyResourceTypeRelevanceItem>,
): Promise<DataTableFormResponse<DevEnergyResourceTypeRelevanceItem>> {
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
      message: "Only DEV users can update energy resource type relevance rows.",
    };
  }

  const rowId = toPositiveInteger(payload.id);
  const { energyResourceTypeId, energyTypeId, energySourceId } =
    resolveEnergyResourceTypeRelevancePayload(payload);

  if (rowId == null) {
    return {
      success: false,
      message: "Relevance row id is required.",
    };
  }

  if (
    energyResourceTypeId == null ||
    energyTypeId == null ||
    energySourceId == null
  ) {
    return {
      success: false,
      message:
        "Energy Resource Type, Energy Type, and Energy Source are required.",
    };
  }

  const [existing] = await db
    .select({ id: energyResourceTypeRelevance.id })
    .from(energyResourceTypeRelevance)
    .where(eq(energyResourceTypeRelevance.id, rowId))
    .limit(1);

  if (!existing) {
    return {
      success: false,
      message: "Relevance row not found.",
    };
  }

  const validation = await validateEnergyResourceTypeRelevancePayload({
    energyResourceTypeId,
    energyTypeId,
    energySourceId,
  });

  if (!validation.success) {
    return validation;
  }

  const duplicateRows = await db
    .select({ id: energyResourceTypeRelevance.id })
    .from(energyResourceTypeRelevance)
    .where(
      and(
        eq(
          energyResourceTypeRelevance.energy_resource_type_id,
          energyResourceTypeId,
        ),
        eq(energyResourceTypeRelevance.energy_type_id, energyTypeId),
        eq(energyResourceTypeRelevance.energy_source_id, energySourceId),
      ),
    )
    .limit(2);

  if (duplicateRows.some((row) => row.id !== rowId)) {
    return {
      success: false,
      message: "This relevance combination already exists.",
    };
  }

  await db
    .update(energyResourceTypeRelevance)
    .set({
      energy_resource_type_id: energyResourceTypeId,
      energy_type_id: energyTypeId,
      energy_source_id: energySourceId,
    })
    .where(eq(energyResourceTypeRelevance.id, rowId));

  const [updatedRow] = await db
    .select()
    .from(energyResourceTypeRelevance)
    .where(eq(energyResourceTypeRelevance.id, rowId))
    .limit(1);

  const [item] = updatedRow
    ? await mapEnergyResourceTypeRelevanceRows([updatedRow])
    : [];

  revalidateRelevanceAndDataEntry();

  return {
    success: true,
    message: "Relevance row updated.",
    data: item,
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
      inputDefId: inputRelevance.measure_def_id,
      inputDef: measureDefinitions.name,
      dimensionId: inputRelevance.dimension_id,
      dimension: managedListItems.name,
      isRelevant: inputRelevance.is_relevant,
    })
    .from(inputRelevance)
    .innerJoin(
      measureDefinitions,
      eq(inputRelevance.measure_def_id, measureDefinitions.id),
    )
    .innerJoin(
      managedListItems,
      eq(inputRelevance.dimension_id, managedListItems.id),
    )
    .orderBy(asc(measureDefinitions.name), asc(managedListItems.name));

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
      id: measureDefinitions.id,
      name: measureDefinitions.name,
    })
    .from(measureDefinitions)
    .where(eq(measureDefinitions.is_active, true))
    .orderBy(asc(measureDefinitions.name));

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
    .select({ id: measureDefinitions.id })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.id, payload.inputDefId),
        eq(measureDefinitions.is_active, true),
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
        eq(inputRelevance.measure_def_id, payload.inputDefId),
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
      measure_def_id: payload.inputDefId,
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
      inputDefId: inputRelevance.measure_def_id,
      inputDef: measureDefinitions.name,
      dimensionId: inputRelevance.dimension_id,
      dimension: managedListItems.name,
      isRelevant: inputRelevance.is_relevant,
    })
    .from(inputRelevance)
    .innerJoin(
      measureDefinitions,
      eq(inputRelevance.measure_def_id, measureDefinitions.id),
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
    .select({ id: measureDefinitions.id })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.id, payload.inputDefId),
        eq(measureDefinitions.is_active, true),
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
        eq(inputRelevance.measure_def_id, payload.inputDefId),
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
      measure_def_id: payload.inputDefId,
      dimension_id: payload.dimensionId,
      is_relevant: payload.isRelevant,
    })
    .where(eq(inputRelevance.id, payload.id));

  const [item] = await db
    .select({
      id: inputRelevance.id,
      inputDefId: inputRelevance.measure_def_id,
      inputDef: measureDefinitions.name,
      dimensionId: inputRelevance.dimension_id,
      dimension: managedListItems.name,
      isRelevant: inputRelevance.is_relevant,
    })
    .from(inputRelevance)
    .innerJoin(
      measureDefinitions,
      eq(inputRelevance.measure_def_id, measureDefinitions.id),
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
