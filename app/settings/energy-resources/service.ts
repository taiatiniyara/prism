"use server";

import { db } from "@/db/connection";
import {
  EnergyResource,
  energyResources,
  EnergyResourcePeriodEntry,
  NewEnergyResource,
  organisations,
  powerStations,
  serviceAreas,
} from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import {
  getCurrentUser,
  hasGlobalUtilityAccess,
  resolveUtilityScopeId,
} from "@/lib/user.service";
import { and, eq, inArray } from "drizzle-orm";
import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { revalidatePath } from "next/cache";
import {
  buildManagedListNameMap,
  resolveManagedListName,
} from "@/lib/managed-list-utils";
import { formatReportPeriodDisplay } from "@/lib/formatters";

export type EnergyResourcePeriodTableRow = Omit<EnergyResource, "id"> & {
  id: string;
};

const GENERATOR_ENERGY_SOURCE_LIST_ALIASES = [
  "Energy Source",
  "Generator Energy Source",
];

const STORAGE_ENERGY_SOURCE_LIST_ALIASES = [
  "Storage Energy Source",
  "Energy Storage Source",
];

const ENERGY_RESOURCE_TYPE_LIST_ALIASES = [
  "Energy Resource Type",
  "Energy Resouce Type",
  "Energy Type",
];

const normalizeListName = (name: string): string => name.trim().toLowerCase();

const isStorageEnergyResourceType = (typeName: string): boolean => {
  const normalized = typeName.trim().toLowerCase();
  return (
    normalized.includes("storage") ||
    normalized.includes("battery") ||
    normalized.includes("bess")
  );
};

const resolveNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const validateEnergySourceForResourceType = async (params: {
  typeId: number;
  energySourceId: number;
}): Promise<{ valid: true } | { valid: false; message: string }> => {
  const [typeItem] = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
      listName: managedLists.name,
    })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(eq(managedListItems.id, params.typeId))
    .limit(1);

  const [sourceItem] = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
      listName: managedLists.name,
    })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(eq(managedListItems.id, params.energySourceId))
    .limit(1);

  if (!typeItem || !sourceItem) {
    return {
      valid: false,
      message: "Selected energy resource type or energy source is invalid.",
    };
  }

  const typeListName = normalizeListName(typeItem.listName);
  const isEnergyResourceType = ENERGY_RESOURCE_TYPE_LIST_ALIASES.some(
    (name) => normalizeListName(name) === typeListName,
  );

  if (!isEnergyResourceType) {
    return {
      valid: false,
      message: "Selected type is not a valid energy resource type.",
    };
  }

  const sourceListName = normalizeListName(sourceItem.listName);
  const storageLists = new Set(
    STORAGE_ENERGY_SOURCE_LIST_ALIASES.map(normalizeListName),
  );
  const generatorLists = new Set(
    GENERATOR_ENERGY_SOURCE_LIST_ALIASES.map(normalizeListName),
  );
  const allowedSourceLists = isStorageEnergyResourceType(typeItem.name)
    ? storageLists
    : generatorLists;

  if (!allowedSourceLists.has(sourceListName)) {
    return {
      valid: false,
      message: isStorageEnergyResourceType(typeItem.name)
        ? "Storage resource types must use a storage energy source."
        : "Generator resource types must use a generator energy source.",
    };
  }

  return { valid: true };
};

function toPeriodRows(
  resource: EnergyResource,
  periodEntries: EnergyResourcePeriodEntry[],
  periodLabelById: Map<number, string>,
  periodTypeById: Map<number, string>,
): EnergyResourcePeriodTableRow[] {
  const sortedEntries = [...periodEntries].sort(
    (a, b) => a.report_period_id - b.report_period_id,
  );

  if (sortedEntries.length === 0) {
    return [
      {
        ...resource,
        id: `${resource.id}-none`,
        report_period: "-",
        report_period_type: "-",
        capacity: "-",
        is_active: null,
      },
    ];
  }

  return sortedEntries.map((entry) => ({
    ...resource,
    id: `${resource.id}-${entry.report_period_id}`,
    report_period:
      periodLabelById.get(entry.report_period_id) ??
      String(entry.report_period_id),
    report_period_type: periodTypeById.get(entry.report_period_id) ?? "-",
    capacity: entry.capacity_mw == null ? "-" : String(entry.capacity_mw),
    is_active: entry.is_active,
  }));
}

export async function GetAllEnergyResources(): Promise<
  EnergyResourcePeriodTableRow[]
> {
  const user = await getCurrentUser();
  const ml = await db.select().from(managedListItems);
  const managedListNamesById = buildManagedListNameMap(ml);
  const utilityScopeId = resolveUtilityScopeId(user);

  const query = db
    .select()
    .from(energyResources)
    .leftJoin(organisations, eq(energyResources.utility_id, organisations.id))
    .leftJoin(
      serviceAreas,
      eq(energyResources.service_area_id, serviceAreas.id),
    )
    .leftJoin(
      powerStations,
      eq(energyResources.power_station_id, powerStations.id),
    );

  if (utilityScopeId != null) {
    query.where(
      and(
        eq(energyResources.utility_id, utilityScopeId),
        eq(energyResources.is_virtual, false),
      ),
    );
  } else if (!hasGlobalUtilityAccess(user)) {
    query.where(eq(energyResources.is_virtual, false));
  }

  const list = await query.orderBy(energyResources.name);

  const utilityIds = Array.from(
    new Set(
      list
        .map((item) => item.energy_resources.utility_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  );

  const periodRows =
    utilityIds.length > 0
      ? await db
          .select({
            id: reportPeriods.id,
            reportDate: reportPeriods.report_date,
            reportTypeId: reportPeriods.report_type_id,
          })
          .from(reportPeriods)
          .where(inArray(reportPeriods.utility_id, utilityIds))
      : [];

  const periodLabelById = new Map(
    periodRows.map((period) => {
      const reportTypeName = resolveManagedListName(
        managedListNamesById,
        period.reportTypeId,
        null,
      );

      return [
        period.id,
        formatReportPeriodDisplay(period.reportDate, reportTypeName),
      ] as const;
    }),
  );

  const periodTypeById = new Map(
    periodRows.map((period) => {
      const reportTypeName = resolveManagedListName(
        managedListNamesById,
        period.reportTypeId,
        null,
      );

      return [period.id, reportTypeName ?? "-"] as const;
    }),
  );

  return list.flatMap((item) =>
    toPeriodRows(
      {
        ...item.energy_resources,
        utility: item.organisations?.name,
        power_station: item.power_stations?.name,
        service_area: item.service_areas?.name,
        energy_provider: resolveManagedListName(
          managedListNamesById,
          item.energy_resources.energy_provider_id,
          null,
        ),
        energy_type: resolveManagedListName(
          managedListNamesById,
          item.energy_resources.energy_type_id,
          null,
        ),
        energy_source: resolveManagedListName(
          managedListNamesById,
          item.energy_resources.energy_source_id,
          null,
        ),
        type: resolveManagedListName(
          managedListNamesById,
          item.energy_resources.type_id,
          null,
        ),
      },
      item.energy_resources.period_entries ?? [],
      periodLabelById,
      periodTypeById,
    ),
  );
}

export async function CreateEnergyResource(
  data: NewEnergyResource,
): Promise<DataTableFormResponse<EnergyResource>> {
  const user = await getCurrentUser();
  const utilityScopeId = resolveUtilityScopeId(user);

  if (utilityScopeId == null) {
    return {
      success: false,
      message: "Select a utility context before creating an energy resource.",
    };
  }

  const typeId = resolveNumber(data.type_id);
  const energySourceId = resolveNumber(data.energy_source_id);

  if (typeId == null || energySourceId == null) {
    return {
      success: false,
      message: "Energy resource type and energy source are required.",
    };
  }

  const validation = await validateEnergySourceForResourceType({
    typeId,
    energySourceId,
  });

  if (!validation.valid) {
    return {
      success: false,
      message: validation.message,
    };
  }

  const query = db.insert(energyResources).values({
    ...data,
    utility_id: utilityScopeId,
    period_entries: data.period_entries ?? [],
    updated_by_id: user.id,
    is_virtual: false,
    agg_level_id: 1,
    updated_at: new Date(),
  });
  revalidatePath("/settings/energy-resources");
  const [result] = await query.returning();
  return {
    success: true,
    message: "Energy Resource created successfully",
    data: result,
  };
}

export async function CreateEnergyResourceFromPeriodRow(
  data: EnergyResourcePeriodTableRow,
): Promise<DataTableFormResponse<EnergyResourcePeriodTableRow>> {
  const {
    id: _rowId,
    report_period: _reportPeriod,
    report_period_type: _reportPeriodType,
    capacity: _capacity,
    is_active: _isActive,
    power_station: _powerStation,
    service_area: _serviceArea,
    utility: _utility,
    energy_provider: _energyProvider,
    energy_type: _energyType,
    energy_source: _energySource,
    agg_level: _aggLevel,
    type: _type,
    ...createData
  } = data;

  const result = await CreateEnergyResource(createData);

  return {
    success: result.success,
    message: result.message,
    data: result.data
      ? {
          ...result.data,
          id: `${result.data.id}-none`,
        }
      : undefined,
  };
}

export async function UpdateEnergyResource(
  data: Partial<EnergyResource>,
): Promise<DataTableFormResponse<EnergyResource>> {
  const user = await getCurrentUser();
  const utilityScopeId = resolveUtilityScopeId(user);

  const existingQuery = db
    .select()
    .from(energyResources)
    .where(
      utilityScopeId == null
        ? eq(energyResources.id, data.id!)
        : and(
            eq(energyResources.id, data.id!),
            eq(energyResources.utility_id, utilityScopeId),
          ),
    )
    .limit(1);

  const [existing] = await existingQuery;

  if (!existing) {
    return {
      success: false,
      message: "Energy Resource not found in the active utility scope.",
    };
  }

  const typeId = resolveNumber(data.type_id ?? existing.type_id);
  const energySourceId = resolveNumber(
    data.energy_source_id ?? existing.energy_source_id,
  );

  if (typeId == null || energySourceId == null) {
    return {
      success: false,
      message: "Energy resource type and energy source are required.",
    };
  }

  const validation = await validateEnergySourceForResourceType({
    typeId,
    energySourceId,
  });

  if (!validation.valid) {
    return {
      success: false,
      message: validation.message,
    };
  }

  const query = db
    .update(energyResources)
    .set({
      ...data,
      updated_by_id: user.id,
      updated_at: new Date(),
    })
    .where(
      utilityScopeId == null
        ? eq(energyResources.id, data.id!)
        : and(
            eq(energyResources.id, data.id!),
            eq(energyResources.utility_id, utilityScopeId),
          ),
    );
  const [result] = await query.returning();

  revalidatePath("/settings/energy-resources");
  return {
    success: true,
    message: "Energy Resource updated successfully",
    data: result,
  };
}

export async function UpdateEnergyResourceFromPeriodRow(
  data: Partial<EnergyResourcePeriodTableRow>,
): Promise<DataTableFormResponse<EnergyResourcePeriodTableRow>> {
  const rowId = String(data.id ?? "");
  const [resourceIdPart, reportPeriodIdPart] = rowId.split("-");
  const resourceId = Number(resourceIdPart);

  if (!Number.isFinite(resourceId)) {
    return {
      success: false,
      message: "Invalid energy resource row selected.",
    };
  }

  if (typeof data.is_active === "boolean") {
    const reportPeriodId = Number(reportPeriodIdPart);

    if (!Number.isFinite(reportPeriodId)) {
      return {
        success: false,
        message: "Cannot update is_active for this row.",
      };
    }

    const user = await getCurrentUser();
    const utilityScopeId = resolveUtilityScopeId(user);

    const existingQuery = db
      .select()
      .from(energyResources)
      .where(
        utilityScopeId == null
          ? eq(energyResources.id, resourceId)
          : and(
              eq(energyResources.id, resourceId),
              eq(energyResources.utility_id, utilityScopeId),
            ),
      )
      .limit(1);

    const [existing] = await existingQuery;

    if (!existing) {
      return {
        success: false,
        message: "Energy Resource not found in the active utility scope.",
      };
    }

    const updatedPeriodEntries = (existing.period_entries ?? []).map((entry) =>
      entry.report_period_id === reportPeriodId
        ? {
            ...entry,
            is_active: data.is_active as boolean,
          }
        : entry,
    );

    const hasMatchingEntry = updatedPeriodEntries.some(
      (entry) => entry.report_period_id === reportPeriodId,
    );

    if (!hasMatchingEntry) {
      return {
        success: false,
        message: "Report period entry not found for this row.",
      };
    }

    const query = db
      .update(energyResources)
      .set({
        period_entries: updatedPeriodEntries,
        updated_by_id: user.id,
        updated_at: new Date(),
      })
      .where(
        utilityScopeId == null
          ? eq(energyResources.id, resourceId)
          : and(
              eq(energyResources.id, resourceId),
              eq(energyResources.utility_id, utilityScopeId),
            ),
      );

    const [result] = await query.returning();

    if (!result) {
      return {
        success: false,
        message: "Energy Resource not found in the active utility scope.",
      };
    }

    revalidatePath("/settings/energy-resources");
    return {
      success: true,
      message: "Period entry status updated successfully",
    };
  }

  const result = await UpdateEnergyResource({
    ...(data as Partial<EnergyResource>),
    id: resourceId,
  });

  return {
    success: result.success,
    message: result.message,
  };
}
