"use server";

import { db } from "@/db/connection";
import {
  dataEntries,
  generationRelevance,
  inputRelevance,
  inputDefinitions,
  serviceAreas,
} from "@/db/schema";
import { kpiDefinitions } from "@/db/schema/kpi";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { getCurrentUser } from "@/lib/user.service";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
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
  customerTypes: string[];
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

export interface UtilityGenerationRelevanceDataLabel {
  inputDefId: number;
  dataLabel: string;
  isRelevant: boolean;
  dataEntryId: string | null;
}

export interface UtilityGenerationRelevanceCell {
  energyProviderId: number;
  energyProvider: string;
  isRelevant: boolean;
  relevantCount: number;
  totalCount: number;
  dataLabels: UtilityGenerationRelevanceDataLabel[];
}

export interface UtilityGenerationRelevanceRow {
  energySourceId: number;
  energySource: string;
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
  rows: UtilityGenerationRelevanceRow[];
}

export interface SetUtilityGenerationDataLabelRelevancePayload {
  reportPeriodId: number;
  serviceAreaId: number;
  energySourceId: number;
  energyProviderId: number;
  inputDefId: number;
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

const getInputDefinitionsForStructure = async (
  structureName: string,
): Promise<{ id: number; name: string }[]> => {
  const structureManagedListItem =
    await GetManagedListItemByName(structureName);

  if (!structureManagedListItem) {
    throw new Error(`${structureName} managed list item not found`);
  }

  const rows = await db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
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
    .orderBy(inputDefinitions.name);

  return rows;
};

const getManagedDimensionItems = async (
  listName: string,
): Promise<{ id: number; name: string }[]> => {
  const rows = await db
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

  const normalizedListName = listName.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    const normalizedName = row.name.trim().toLowerCase();
    return (
      normalizedName !== normalizedListName && !normalizedName.includes("all")
    );
  });

  if (filtered.length > 0) {
    return filtered;
  }

  return rows;
};

export async function GetUtilityTariffRelevance(
  filters: UtilityTariffRelevanceFilter = {},
): Promise<UtilityTariffRelevanceResult> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const serviceAreaList = await db
    .select({
      id: serviceAreas.id,
      name: serviceAreas.name,
    })
    .from(serviceAreas)
    .orderBy(serviceAreas.name)
    .where(eq(serviceAreas.utility_id, user.org_id!));

  const reportPeriodList = await db
    .select({
      id: reportPeriods.id,
      reportDate: reportPeriods.report_date,
    })
    .from(reportPeriods)
    .where(eq(reportPeriods.utility_id, user.org_id!))
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
      name: item.reportDate.toISOString().slice(0, 7),
    }),
  );

  const selectedReportPeriodId = resolveSelectedId(
    filters.reportPeriodId,
    reportPeriodOptions,
  );
  const selectedServiceAreaId = resolveSelectedId(
    filters.serviceAreaId,
    serviceAreaOptions,
  );

  const inputList = await getInputDefinitionsForStructure("Tariff Structure");

  const paymentModes = await getManagedDimensionItems("Payment Mode");

  const customerTypes = await getManagedDimensionItems("Customer Type");

  const dataLabels = inputList.map((input) => ({
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
      customerTypes: customerTypes.map((customerType) => customerType.name),
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
    customerTypes: customerTypes.map((customerType) => customerType.name),
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

  const [validServiceArea] = await db
    .select({ id: serviceAreas.id })
    .from(serviceAreas)
    .where(
      and(
        eq(serviceAreas.id, payload.serviceAreaId),
        eq(serviceAreas.utility_id, user.org_id!),
      ),
    )
    .limit(1);

  const [validReportPeriod] = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods)
    .where(
      and(
        eq(reportPeriods.id, payload.reportPeriodId),
        eq(reportPeriods.utility_id, user.org_id!),
      ),
    )
    .limit(1);

  if (!validServiceArea || !validReportPeriod) {
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

  revalidatePath("/settings/relevance");
  revalidatePath("/data-entry/enter-data");

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

  const serviceAreaList = await db
    .select({
      id: serviceAreas.id,
      name: serviceAreas.name,
    })
    .from(serviceAreas)
    .orderBy(serviceAreas.name)
    .where(eq(serviceAreas.utility_id, user.org_id!));

  const reportPeriodList = await db
    .select({
      id: reportPeriods.id,
      reportDate: reportPeriods.report_date,
    })
    .from(reportPeriods)
    .where(eq(reportPeriods.utility_id, user.org_id!))
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
      name: item.reportDate.toISOString().slice(0, 7),
    }),
  );

  const selectedReportPeriodId = resolveSelectedId(
    filters.reportPeriodId,
    reportPeriodOptions,
  );
  const selectedServiceAreaId = resolveSelectedId(
    filters.serviceAreaId,
    serviceAreaOptions,
  );

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

  const [validServiceArea] = await db
    .select({ id: serviceAreas.id })
    .from(serviceAreas)
    .where(
      and(
        eq(serviceAreas.id, payload.serviceAreaId),
        eq(serviceAreas.utility_id, user.org_id!),
      ),
    )
    .limit(1);

  const [validReportPeriod] = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods)
    .where(
      and(
        eq(reportPeriods.id, payload.reportPeriodId),
        eq(reportPeriods.utility_id, user.org_id!),
      ),
    )
    .limit(1);

  if (!validServiceArea || !validReportPeriod) {
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

  revalidatePath("/settings/relevance");
  revalidatePath("/data-entry/enter-data");

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

  const serviceAreaList = await db
    .select({
      id: serviceAreas.id,
      name: serviceAreas.name,
    })
    .from(serviceAreas)
    .orderBy(serviceAreas.name)
    .where(eq(serviceAreas.utility_id, user.org_id!));

  const reportPeriodList = await db
    .select({
      id: reportPeriods.id,
      reportDate: reportPeriods.report_date,
    })
    .from(reportPeriods)
    .where(eq(reportPeriods.utility_id, user.org_id!))
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
      name: item.reportDate.toISOString().slice(0, 7),
    }),
  );

  const selectedReportPeriodId = resolveSelectedId(
    filters.reportPeriodId,
    reportPeriodOptions,
  );
  const selectedServiceAreaId = resolveSelectedId(
    filters.serviceAreaId,
    serviceAreaOptions,
  );

  const inputList = await getInputDefinitionsForStructure("Generation");
  const energyProviders = await getManagedDimensionItems("Energy Provider");
  const energySources = await getManagedDimensionItems("Energy Source");

  const dataLabels = inputList.map((input) => ({
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
      energyProviders: energyProviders.map((provider) => provider.name),
      rows: energySources.map((energySource) => ({
        energySourceId: energySource.id,
        energySource: energySource.name,
        cells: energyProviders.map((energyProvider) => ({
          energyProviderId: energyProvider.id,
          energyProvider: energyProvider.name,
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

  const entries =
    energyProviders.length > 0 && energySources.length > 0
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
              inArray(
                generationRelevance.input_def_id,
                inputList.map((input) => input.id),
              ),
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

  const relevanceByDimension = new Map<
    string,
    Map<number, { isRelevant: boolean; dataEntryId: string }>
  >();

  for (const entry of entries) {
    if (
      entry.reportPeriodId == null ||
      entry.energySourceId == null ||
      entry.energyProviderId == null
    ) {
      continue;
    }

    const key = `${entry.reportPeriodId}:${entry.energySourceId}:${entry.energyProviderId}`;
    const existing =
      relevanceByDimension.get(key) ??
      new Map<number, { isRelevant: boolean; dataEntryId: string }>();

    if (existing.has(entry.inputDefId)) {
      continue;
    }

    existing.set(entry.inputDefId, {
      isRelevant: entry.isRelevant,
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
    energyProviders: energyProviders.map((provider) => provider.name),
    rows: energySources.map((energySource) => ({
      energySourceId: energySource.id,
      energySource: energySource.name,
      cells: energyProviders.map((energyProvider) => {
        const key = `${selectedReportPeriodId}:${energySource.id}:${energyProvider.id}`;
        const labelMap = relevanceByDimension.get(key) ?? new Map();

        const labels = dataLabels.map((label) => ({
          inputDefId: label.inputDefId,
          dataLabel: label.dataLabel,
          isRelevant: labelMap.get(label.inputDefId)?.isRelevant ?? true,
          dataEntryId: labelMap.get(label.inputDefId)?.dataEntryId ?? null,
        }));

        const relevantCount = labels.filter((label) => label.isRelevant).length;

        return {
          energyProviderId: energyProvider.id,
          energyProvider: energyProvider.name,
          isRelevant: labels.length > 0 && relevantCount === labels.length,
          relevantCount,
          totalCount: labels.length,
          dataLabels: labels,
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

  const [validServiceArea] = await db
    .select({ id: serviceAreas.id })
    .from(serviceAreas)
    .where(
      and(
        eq(serviceAreas.id, payload.serviceAreaId),
        eq(serviceAreas.utility_id, user.org_id!),
      ),
    )
    .limit(1);

  const [validReportPeriod] = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods)
    .where(
      and(
        eq(reportPeriods.id, payload.reportPeriodId),
        eq(reportPeriods.utility_id, user.org_id!),
      ),
    )
    .limit(1);

  if (!validServiceArea || !validReportPeriod) {
    return {
      success: false,
      message: "Invalid relevance context for this utility.",
    };
  }

  const inputList = await getInputDefinitionsForStructure("Generation");

  if (!inputList.some((input) => input.id === payload.inputDefId)) {
    return {
      success: false,
      message: "Selected data label is not a Generation input.",
    };
  }

  const [energyProvider] = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedLists.name, "Energy Provider"),
        eq(managedLists.is_active, true),
        eq(managedListItems.is_active, true),
        eq(managedListItems.id, payload.energyProviderId),
      ),
    )
    .limit(1);

  const [energySource] = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedLists.name, "Energy Source"),
        eq(managedLists.is_active, true),
        eq(managedListItems.is_active, true),
        eq(managedListItems.id, payload.energySourceId),
      ),
    )
    .limit(1);

  if (!energyProvider || !energySource) {
    return {
      success: false,
      message: "Selected energy provider or source is invalid.",
    };
  }

  const [existing] = await db
    .select({ id: generationRelevance.id })
    .from(generationRelevance)
    .where(
      and(
        eq(generationRelevance.report_period_id, payload.reportPeriodId),
        eq(generationRelevance.service_area_id, payload.serviceAreaId),
        eq(generationRelevance.input_def_id, payload.inputDefId),
        eq(generationRelevance.energy_provider_id, payload.energyProviderId),
        eq(generationRelevance.energy_source_id, payload.energySourceId),
      ),
    )
    .orderBy(desc(generationRelevance.updatedAt))
    .limit(1);

  if (!existing && payload.isRelevant) {
    return {
      success: true,
      message: "Relevance already set by default.",
    };
  }

  if (existing) {
    await db
      .update(generationRelevance)
      .set({
        is_relevant: payload.isRelevant,
        is_deleted: false,
        updatedAt: new Date(),
        updatedById: user.id,
      })
      .where(eq(generationRelevance.id, existing.id));
  } else {
    await db.insert(generationRelevance).values({
      report_period_id: payload.reportPeriodId,
      service_area_id: payload.serviceAreaId,
      input_def_id: payload.inputDefId,
      energy_provider_id: payload.energyProviderId,
      energy_source_id: payload.energySourceId,
      is_relevant: payload.isRelevant,
      is_deleted: false,
      updatedAt: new Date(),
      updatedById: user.id,
    });
  }

  revalidatePath("/settings/relevance");
  revalidatePath("/data-entry/enter-data");

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

  if (user.org_id == null) {
    return [];
  }

  const kpis = await db
    .select({
      id: kpiDefinitions.id,
      name: kpiDefinitions.name,
      description: kpiDefinitions.description,
      formula: kpiDefinitions.formula,
      utilities: kpiDefinitions.utilities,
      formulaInputs: kpiDefinitions.formula_inputs,
    })
    .from(kpiDefinitions)
    .where(
      and(
        eq(kpiDefinitions.type, "custom"),
        eq(kpiDefinitions.is_active, true),
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

  return kpis.map((kpi) => {
    const utilityIds = Array.isArray(kpi.utilities)
      ? kpi.utilities.filter((value): value is number =>
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
      utilities: kpiDefinitions.utilities,
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

  const currentUtilityIds = Array.isArray(kpi.utilities)
    ? kpi.utilities.filter((value): value is number => Number.isInteger(value))
    : [];

  const nextUtilityIds = payload.isRelevant
    ? Array.from(new Set([...currentUtilityIds, user.org_id]))
    : currentUtilityIds.filter((utilityId) => utilityId !== user.org_id);

  await db
    .update(kpiDefinitions)
    .set({
      utilities: nextUtilityIds,
    })
    .where(eq(kpiDefinitions.id, payload.kpiDefId));

  revalidatePath("/settings/relevance");
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

  revalidatePath("/settings/relevance");

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

  revalidatePath("/settings/relevance");

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

  revalidatePath("/settings/relevance");

  return {
    success: true,
    message: "Input relevance updated.",
  };
}
