"use server";

import { db } from "@/db/connection";
import {
  EnergyResource,
  units,
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
import { and, eq, inArray, desc } from "drizzle-orm";
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
  report_period_id?: number | null;
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

export async function GetAllReportPeriods(): Promise<
  { id: number; label: string }[]
> {
  const user = await getCurrentUser();
  const ml = await db.select().from(managedListItems);
  const managedListNamesById = buildManagedListNameMap(ml);
  const utilityScopeId = resolveUtilityScopeId(user);

  const query = db
    .select({
      id: reportPeriods.id,
      reportDate: reportPeriods.report_date,
      reportTypeId: reportPeriods.report_type_id,
    })
    .from(reportPeriods)
    .orderBy(desc(reportPeriods.report_date));

  if (utilityScopeId != null) {
    query.where(eq(reportPeriods.utility_id, utilityScopeId));
  }

  const periods = await query;

  return periods.map((period) => ({
    id: period.id,
    label: formatReportPeriodDisplay(
      period.reportDate,
      resolveManagedListName(managedListNamesById, period.reportTypeId, null),
    ),
  }));
}

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
        report_period_id: null,
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
    report_period_id: entry.report_period_id,
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
    .from(units)
    .leftJoin(organisations, eq(units.utility_id, organisations.id))
    .leftJoin(
      serviceAreas,
      eq(units.service_area_id, serviceAreas.id),
    )
    .leftJoin(
      powerStations,
      eq(units.power_station_id, powerStations.id),
    );

  if (utilityScopeId != null) {
    query.where(
      and(
        eq(units.utility_id, utilityScopeId),
        eq(units.is_virtual, false),
      ),
    );
  } else if (!hasGlobalUtilityAccess(user)) {
    query.where(eq(units.is_virtual, false));
  }

  const list = await query.orderBy(units.name);

  const utilityIds = Array.from(
    new Set(
      list
        .map((item) => item.units.utility_id)
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
        ...item.units,
        utility: item.organisations?.name,
        power_station: item.power_stations?.name,
        service_area: item.service_areas?.name,
        energy_provider: resolveManagedListName(
          managedListNamesById,
          item.units.provider_id,
          null,
        ),
        energy_type: resolveManagedListName(
          managedListNamesById,
          item.units.category_id,
          null,
        ),
        energy_source: resolveManagedListName(
          managedListNamesById,
          item.units.technology_id,
          null,
        ),
        type: resolveManagedListName(
          managedListNamesById,
          item.units.type_id,
          null,
        ),
      },
      item.units.period_entries ?? [],
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
  const energySourceId = resolveNumber(data.technology_id);

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

  const query = db.insert(units).values({
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
    id: _id,
    report_period_id,
    report_period: _reportPeriod,
    report_period_type: _reportPeriodType,
    capacity,
    is_active,
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

  const reportPeriodId = resolveNumber(report_period_id);
  if (reportPeriodId == null) {
    return {
      success: false,
      message: "Report period is required.",
    };
  }

  const capacityMw =
    typeof capacity === "string" && capacity.trim() === ""
      ? null
      : resolveNumber(capacity);

  const result = await CreateEnergyResource({
    ...(createData as NewEnergyResource),
    period_entries: [
      {
        report_period_id: reportPeriodId,
        capacity_mw: capacityMw,
        is_active: typeof is_active === "boolean" ? is_active : true,
      },
    ],
  });

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
    .from(units)
    .where(
      utilityScopeId == null
        ? eq(units.id, data.id!)
        : and(
            eq(units.id, data.id!),
            eq(units.utility_id, utilityScopeId),
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
    data.technology_id ?? existing.technology_id,
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
    .update(units)
    .set({
      ...data,
      updated_by_id: user.id,
      updated_at: new Date(),
    })
    .where(
      utilityScopeId == null
        ? eq(units.id, data.id!)
        : and(
            eq(units.id, data.id!),
            eq(units.utility_id, utilityScopeId),
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

  const user = await getCurrentUser();
  const utilityScopeId = resolveUtilityScopeId(user);

  const existingQuery = db
    .select()
    .from(units)
    .where(
      utilityScopeId == null
        ? eq(units.id, resourceId)
        : and(
            eq(units.id, resourceId),
            eq(units.utility_id, utilityScopeId),
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

  const resolvedReportPeriodId =
    resolveNumber(data.report_period_id) ?? resolveNumber(reportPeriodIdPart);

  if (
    data.report_period_id !== undefined ||
    data.capacity !== undefined ||
    data.is_active !== undefined
  ) {
    if (resolvedReportPeriodId == null) {
      return {
        success: false,
        message: "Report period is required.",
      };
    }

    const capacityMw =
      typeof data.capacity === "string" && data.capacity.trim() === ""
        ? null
        : data.capacity === undefined
          ? undefined
          : resolveNumber(data.capacity);

    let hasMatchingEntry = false;
    const updatedPeriodEntries = (existing.period_entries ?? []).map(
      (entry) => {
        if (entry.report_period_id !== resolvedReportPeriodId) {
          return entry;
        }

        hasMatchingEntry = true;
        return {
          ...entry,
          capacity_mw:
            capacityMw === undefined ? entry.capacity_mw : capacityMw,
          is_active:
            typeof data.is_active === "boolean"
              ? data.is_active
              : entry.is_active,
        };
      },
    );

    const nextPeriodEntries = hasMatchingEntry
      ? updatedPeriodEntries
      : [
          ...updatedPeriodEntries,
          {
            report_period_id: resolvedReportPeriodId,
            capacity_mw: capacityMw ?? null,
            is_active:
              typeof data.is_active === "boolean" ? data.is_active : true,
          },
        ];

    const baseData = { ...data };
    delete baseData.id;
    delete baseData.report_period_id;
    delete baseData.report_period;
    delete baseData.report_period_type;
    delete baseData.capacity;
    delete baseData.is_active;
    delete baseData.utility;
    delete baseData.service_area;
    delete baseData.power_station;
    delete baseData.energy_provider;
    delete baseData.energy_type;
    delete baseData.energy_source;
    delete baseData.agg_level;
    delete baseData.type;

    const result = await UpdateEnergyResource({
      ...(baseData as Partial<EnergyResource>),
      id: resourceId,
      period_entries: nextPeriodEntries,
    });

    return {
      success: result.success,
      message: result.message,
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
