"use server";

import { db } from "@/db/connection";
import { roles } from "@/db/schema/auth-schema";
import {
  dataEntries,
  DataEntryStatusId,
  generationRelevance,
  generationToggleRelevance,
  inputDefinitions,
  inputRelevance,
} from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import {
  energyResources,
  EnergyResourcePeriodEntry,
  organisations,
  serviceAreas,
} from "@/db/schema/utility";
import { formatReportPeriodDisplay } from "@/lib/formatters";
import { buildManagedListNameMap } from "@/lib/managed-list-utils";
import {
  CurrentUser,
  hasGlobalUtilityAccess,
  resolveUtilityScopeId,
} from "@/lib/user.service";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
  const scopedUtilityId =
    !forceAllUtilities ? resolveUtilityScopeId(user) : null;

  const [ml, rolesList] = await Promise.all([
    db.select().from(managedListItems),
    db.select().from(roles),
  ]);

  const reportTypeNameById = buildManagedListNameMap(ml);
  const roleNameById = new Map(rolesList.map((role) => [role.id, role.name]));

  const rp = db
    .select()
    .from(reportPeriods)
    .leftJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .orderBy(desc(reportPeriods.report_date));

  if (scopedUtilityId != null) {
    rp.where(eq(reportPeriods.utility_id, scopedUtilityId));
  }

  const list = await rp;
  if (list.length === 0) {
    return [];
  }

  const reportPeriodIds = list.map((item) => item.report_periods.id);

  const definitionRows = await db
    .select({
      inputDefId: inputDefinitions.id,
      subcategoryName: sql<string | null>`(
        select mli.name
        from managed_list_items mli
        where mli.id = ${inputDefinitions.subcategory_id}
        limit 1
      )`,
      categoryName: sql<string | null>`(
        select mli.name
        from managed_list_items mli
        where mli.id = ${inputDefinitions.category_id}
        limit 1
      )`,
    })
    .from(inputDefinitions)
    .where(
      and(
        eq(inputDefinitions.is_active, true),
        eq(inputDefinitions.is_aggregated, false),
        eq(inputDefinitions.is_system_generated, false),
        sql`lower(coalesce(
          (select mli.name from managed_list_items mli where mli.id = ${inputDefinitions.subcategory_id}),
          ''
        )) <> 'country context'`,
      ),
    );

  const generationInputDefIds = definitionRows
    .filter(
      (row) => row.subcategoryName?.trim().toLowerCase() === "generation",
    )
    .map((row) => row.inputDefId);
  const nonGenerationInputDefIds = definitionRows
    .filter(
      (row) => row.subcategoryName?.trim().toLowerCase() !== "generation",
    )
    .map((row) => row.inputDefId);

  const serviceAreaScopedInputDefinitionIds = new Set(
    definitionRows
      .filter(
        (row) =>
          row.categoryName?.trim().toLowerCase() === "operation" ||
          row.subcategoryName?.trim().toLowerCase() === "tariff structure",
      )
      .map((row) => row.inputDefId),
  );

  const serviceAreaConditions = [
    eq(serviceAreas.is_active, true),
    eq(serviceAreas.is_virtual, false),
  ];
  if (scopedUtilityId != null) {
    serviceAreaConditions.push(eq(serviceAreas.utility_id, scopedUtilityId));
  } else if (!forceAllUtilities && !hasGlobalUtilityAccess(user) && user.org_id != null) {
    serviceAreaConditions.push(eq(serviceAreas.utility_id, user.org_id));
  }

  const serviceAreaRows = await db
    .select({ id: serviceAreas.id, utility_id: serviceAreas.utility_id })
    .from(serviceAreas)
    .where(and(...serviceAreaConditions));

  const serviceAreaIdsByUtility = new Map<number, number[]>();
  serviceAreaRows.forEach((row) => {
    const existing = serviceAreaIdsByUtility.get(row.utility_id) ?? [];
    existing.push(row.id);
    serviceAreaIdsByUtility.set(row.utility_id, existing);
  });

  const energyResourceConditions = [eq(energyResources.is_virtual, false)];
  if (scopedUtilityId != null) {
    energyResourceConditions.push(
      eq(energyResources.utility_id, scopedUtilityId),
    );
  } else if (!forceAllUtilities && !hasGlobalUtilityAccess(user) && user.org_id != null) {
    energyResourceConditions.push(
      eq(energyResources.utility_id, user.org_id),
    );
  }

  const allEnergyResources = await db
    .select({
      id: energyResources.id,
      service_area_id: energyResources.service_area_id,
      utility_id: energyResources.utility_id,
      energy_provider_id: energyResources.energy_provider_id,
      energy_source_id: energyResources.energy_source_id,
      type_id: energyResources.type_id,
      period_entries: energyResources.period_entries,
    })
    .from(energyResources)
    .where(and(...energyResourceConditions));

  const [
    existingEntries,
    irrelevantDataEntries,
    irrelevantToggleRelevance,
    irrelevantGenerationRelevance,
    irrelevantInputRelevance,
  ] = await Promise.all([
    db
      .select()
      .from(dataEntries)
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, true),
          inArray(dataEntries.report_period_id, reportPeriodIds),
        ),
      ),
    db
      .select({
        reportPeriodId: dataEntries.report_period_id,
        inputDefId: dataEntries.input_def_id,
        serviceAreaId: dataEntries.service_area_id,
      })
      .from(dataEntries)
      .where(
        and(
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, false),
          inArray(dataEntries.report_period_id, reportPeriodIds),
        ),
      ),
    db
      .select({
        reportPeriodId: generationToggleRelevance.report_period_id,
        serviceAreaId: generationToggleRelevance.service_area_id,
        energyProviderId: generationToggleRelevance.energy_provider_id,
        energySourceId: generationToggleRelevance.energy_source_id,
      })
      .from(generationToggleRelevance)
      .where(
        and(
          eq(generationToggleRelevance.is_deleted, false),
          eq(generationToggleRelevance.is_relevant, false),
          inArray(
            generationToggleRelevance.report_period_id,
            reportPeriodIds,
          ),
        ),
      ),
    db
      .select({
        reportPeriodId: generationRelevance.report_period_id,
        serviceAreaId: generationRelevance.service_area_id,
        inputDefId: generationRelevance.input_def_id,
        energyProviderId: generationRelevance.energy_provider_id,
        energySourceId: generationRelevance.energy_source_id,
        energyResourceTypeId: generationRelevance.energy_resource_type_id,
      })
      .from(generationRelevance)
      .where(
        and(
          eq(generationRelevance.is_deleted, false),
          eq(generationRelevance.is_relevant, false),
          inArray(generationRelevance.report_period_id, reportPeriodIds),
        ),
      ),
    db
      .select({
        inputDefId: inputRelevance.input_def_id,
        dimensionId: inputRelevance.dimension_id,
      })
      .from(inputRelevance)
      .where(
        and(
          eq(inputRelevance.is_relevant, false),
          inArray(
            inputRelevance.input_def_id,
            generationInputDefIds.length > 0
              ? generationInputDefIds
              : [-1],
          ),
        ),
      ),
  ]);

  return list.map((item) => {
    const rpId = item.report_periods.id;
    const utilityId = item.report_periods.utility_id;
    const serviceAreaIds = serviceAreaIdsByUtility.get(utilityId) ?? [];

    const entriesForPeriod = existingEntries.filter(
      (x) => x.report_period_id === rpId,
    );

    let enteredOnly = 0;
    let reviewedOnly = 0;
    let approvedOnly = 0;
    let endorsedOnly = 0;
    let dataNotAvailable = 0;

    for (const entry of entriesForPeriod) {
      if (entry.status_id === DataEntryStatusId.Entered) {
        enteredOnly += 1;
      }
      if (entry.status_id === DataEntryStatusId.Reviewed) {
        reviewedOnly += 1;
      }
      if (entry.status_id === DataEntryStatusId.Approved) {
        approvedOnly += 1;
      }
      if (entry.status_id === DataEntryStatusId.Endorsed) {
        endorsedOnly += 1;
      }
      if (entry.status_id === DataEntryStatusId.Not_Available) {
        dataNotAvailable += 1;
      }
    }

    const periodIrrelevantDE = new Map<number | null, Set<number>>();
    irrelevantDataEntries
      .filter((r) => r.reportPeriodId === rpId)
      .forEach((r) => {
        const existing =
          periodIrrelevantDE.get(r.serviceAreaId) ?? new Set<number>();
        existing.add(r.inputDefId);
        periodIrrelevantDE.set(r.serviceAreaId, existing);
      });

    let nonGenerationExpected = 0;
    nonGenerationInputDefIds.forEach((inputDefId) => {
      const isScoped =
        serviceAreaScopedInputDefinitionIds.has(inputDefId);
      const scopedSAIds = isScoped ? serviceAreaIds : [null];
      scopedSAIds.forEach((saId) => {
        const irrelevant =
          periodIrrelevantDE.get(saId) ?? new Set<number>();
        if (!irrelevant.has(inputDefId)) {
          nonGenerationExpected += 1;
        }
      });
    });

    const periodEnergyResources = allEnergyResources.filter((er) => {
      if (er.utility_id !== utilityId) return false;
      const pe = (
        er.period_entries as EnergyResourcePeriodEntry[] | undefined
      ) ?? [];
      return pe.some((p) => p.report_period_id === rpId && p.is_active);
    });

    const periodToggleIrrelevant = new Set<string>();
    irrelevantToggleRelevance
      .filter((r) => r.reportPeriodId === rpId)
      .forEach((r) => {
        periodToggleIrrelevant.add(
          `${r.serviceAreaId}:${r.energyProviderId}:${r.energySourceId}`,
        );
      });

    const periodGenRelIrrelevant = new Map<string, Set<number>>();
    irrelevantGenerationRelevance
      .filter((r) => r.reportPeriodId === rpId)
      .forEach((r) => {
        const key = `${r.serviceAreaId}:${r.energyProviderId}:${r.energySourceId}:${r.energyResourceTypeId ?? "null"}`;
        const existing =
          periodGenRelIrrelevant.get(key) ?? new Set<number>();
        existing.add(r.inputDefId);
        periodGenRelIrrelevant.set(key, existing);
      });

    const periodInputRelIrrelevant = new Set<string>();
    irrelevantInputRelevance.forEach((r) => {
      periodInputRelIrrelevant.add(`${r.inputDefId}:${r.dimensionId}`);
    });

    let generationExpected = 0;
    periodEnergyResources.forEach((er) => {
      const toggleKey = `${er.service_area_id}:${er.energy_provider_id}:${er.energy_source_id}`;
      if (periodToggleIrrelevant.has(toggleKey)) return;

      const genRelKey = `${er.service_area_id}:${er.energy_provider_id}:${er.energy_source_id}:${er.type_id}`;
      const irrelevantDefs =
        periodGenRelIrrelevant.get(genRelKey) ?? new Set<number>();

      generationInputDefIds.forEach((inputDefId) => {
        if (irrelevantDefs.has(inputDefId)) return;
        if (
          periodInputRelIrrelevant.has(
            `${inputDefId}:${er.energy_source_id}`,
          )
        )
          return;
        generationExpected += 1;
      });
    });

    const requested = nonGenerationExpected + generationExpected;
    const completed =
      enteredOnly +
      reviewedOnly +
      approvedOnly +
      endorsedOnly +
      dataNotAvailable;
    const pending = Math.max(requested - completed, 0);

    const entered = enteredOnly;
    const reviewed = reviewedOnly;
    const approved = approvedOnly;
    const endorsed = endorsedOnly;

    return {
      Id: rpId,
      Period: formatReportPeriodDisplay(
        item.report_periods.report_date,
        reportTypeNameById.get(item.report_periods.report_type_id ?? -1),
      ),
      Utility: item.organisations?.acronym || "",
      Report_Type:
        reportTypeNameById.get(item.report_periods.report_type_id ?? -1) ||
        "",
      Pending_With:
        roleNameById.get(item.report_periods.who_id ?? -1) || "",
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
