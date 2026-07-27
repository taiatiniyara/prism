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
import { managedListItems } from "@/db/schema/managedLists";
import { revalidatePath } from "next/cache";
import {
  buildManagedListNameMap,
  resolveManagedListName,
} from "@/lib/managed-list-utils";
import { formatReportPeriodDisplay } from "@/lib/formatters";
import {
  assetFromTechnology,
  buildParentMap,
  categoryFromTechnology,
} from "@/lib/energy-taxonomy";

export type EnergyResourcePeriodTableRow = Omit<EnergyResource, "id"> & {
  id: string;
  report_period_id?: number | null;
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
  const parentById = buildParentMap(ml);
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
        provider: resolveManagedListName(
          managedListNamesById,
          item.units.provider_id,
          null,
        ),
        category: resolveManagedListName(
          managedListNamesById,
          categoryFromTechnology(item.units.technology_id, parentById),
          null,
        ),
        technology: resolveManagedListName(
          managedListNamesById,
          item.units.technology_id,
          null,
        ),
        asset: resolveManagedListName(
          managedListNamesById,
          assetFromTechnology(item.units.technology_id, parentById),
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

  const energySourceId = resolveNumber(data.technology_id);

  if (energySourceId == null) {
    return {
      success: false,
      message: "Energy source (technology) is required.",
    };
  }

  // category + asset are DERIVED from technology (derive-not-store); the
  // taxonomy guarantees a technology fits its asset, so no separate
  // technology-vs-type validation is needed.

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
    provider: _energyProvider,
    category: _energyType,
    technology: _energySource,
    agg_level: _aggLevel,
    asset: _asset,
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

  const energySourceId = resolveNumber(
    data.technology_id ?? existing.technology_id,
  );

  if (energySourceId == null) {
    return {
      success: false,
      message: "Energy source (technology) is required.",
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
    delete baseData.provider;
    delete baseData.category;
    delete baseData.technology;
    delete baseData.agg_level;
    delete baseData.asset;

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
