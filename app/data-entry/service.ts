"use server";

import { db } from "@/db/connection";
import { roles } from "@/db/schema/auth-schema";
import {
  dataEntries,
  DataEntryStatusId,
  inputDefinitions,
} from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import {
  energyResources,
  organisations,
  serviceAreas,
} from "@/db/schema/utility";
import { formatReportPeriodDisplay } from "@/lib/formatters";
import { buildManagedListNameMap } from "@/lib/managed-list-utils";
import { CurrentUser } from "@/lib/user.service";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

const isGlobalRole = (role: string) => role === "DEV" || role === "BMO";

const hasActiveEnergyResourcePeriod = (reportPeriodId: number) =>
  sql<boolean>`exists (
    select 1
    from jsonb_array_elements(${energyResources.period_entries}) as period_entry
    where (period_entry->>'report_period_id')::int = ${reportPeriodId}
      and coalesce((period_entry->>'is_active')::boolean, false) = true
  )`;

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

const getRequestedCountForPeriod = async (
  user: CurrentUser,
  reportPeriodId: number,
  scopeUtilityId: number | null = null,
): Promise<number> => {
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

  if (definitionRows.length === 0) {
    return 0;
  }

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
  const effectiveUtilityId =
    scopeUtilityId ?? (!isGlobalRole(user.role) ? user.org_id : null);
  if (effectiveUtilityId != null) {
    serviceAreaConditions.push(eq(serviceAreas.utility_id, effectiveUtilityId));
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
        eq(dataEntries.report_period_id, reportPeriodId),
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
    hasActiveEnergyResourcePeriod(reportPeriodId),
  ];
  if (effectiveUtilityId != null) {
    generatorConditions.push(
      eq(energyResources.utility_id, effectiveUtilityId),
    );
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

  return expectedKeys.size;
};

export interface ReportPeriodDTO {
  Id: number;
  Period: string;
  Utility: string;
  Report_Type: string;
  Requested: number;
  Pending: number;
  Entered: number;
  Reviewed: number;
  Approved: number;
  Endorsed: number;
  Not_Available: number;
  Pending_With: string;
  Updated: string;
}

interface GetReportPeriodsOptions {
  forceAllUtilities?: boolean;
}

export async function GetReportPeriods(
  user: CurrentUser,
  options: GetReportPeriodsOptions = {},
): Promise<ReportPeriodDTO[]> {
  const forceAllUtilities = options.forceAllUtilities === true;
  const ml = await db.select().from(managedListItems);
  const rolesList = await db.select().from(roles);
  const de = db.select().from(dataEntries);
  const rp = db
    .select()
    .from(reportPeriods)
    .leftJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .orderBy(desc(reportPeriods.report_date));
  if (!forceAllUtilities && user.role !== "DEV" && user.role !== "BMO") {
    rp.where(eq(reportPeriods.utility_id, user.org_id!));
  }
  const deList = await de;
  const list = await rp;
  const reportTypeNameById = buildManagedListNameMap(ml);
  const roleNameById = new Map(rolesList.map((role) => [role.id, role.name]));
  const requestedCountByPeriod = new Map<number, number>();
  for (const item of list) {
    const scopeUtilityId = forceAllUtilities
      ? item.report_periods.utility_id
      : null;
    requestedCountByPeriod.set(
      item.report_periods.id,
      await getRequestedCountForPeriod(
        user,
        item.report_periods.id,
        scopeUtilityId,
      ),
    );
  }

  return list.map((item) => {
    const entriesForPeriod = deList.filter(
      (x) => x.report_period_id === item.report_periods.id,
    );
    let enteredOnly = 0;
    let reviewed = 0;
    let approved = 0;
    let endorsed = 0;
    let dataNotAvailable = 0;

    for (const entry of entriesForPeriod) {
      if (entry.status_id === DataEntryStatusId.Entered) {
        enteredOnly += 1;
      }
      if (entry.status_id === DataEntryStatusId.Reviewed) {
        reviewed += 1;
      }
      if (entry.status_id === DataEntryStatusId.Approved) {
        approved += 1;
      }
      if (entry.status_id === DataEntryStatusId.Endorsed) {
        endorsed += 1;
      }
      if (entry.status_id === DataEntryStatusId.Not_Available) {
        dataNotAvailable += 1;
      }
    }

    const requested = requestedCountByPeriod.get(item.report_periods.id) ?? 0;
    const entered = enteredOnly + reviewed + approved + endorsed;
    const pending = Math.max(requested - (entered + dataNotAvailable), 0);

    return {
      Id: item.report_periods.id,
      Period: formatReportPeriodDisplay(
        item.report_periods.report_date,
        reportTypeNameById.get(item.report_periods.report_type_id ?? -1),
      ),
      Utility: item.organisations?.acronym || "",
      Report_Type:
        reportTypeNameById.get(item.report_periods.report_type_id ?? -1) || "",
      Pending_With: roleNameById.get(item.report_periods.who_id ?? -1) || "",
      Updated: item.report_periods.updated_at.toISOString().split("T")[0],
      Requested: requested,
      Pending: pending,
      Entered: entered,
      Reviewed: reviewed,
      Approved: approved,
      Endorsed: endorsed,
      Not_Available: dataNotAvailable,
    };
  });
}
