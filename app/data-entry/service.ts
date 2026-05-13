"use server";

import { db } from "@/db/connection";
import { roles } from "@/db/schema/auth-schema";
import {
  dataEntries,
  DataEntryStatusId,
  generationRelevance,
  generationToggleRelevance,
  inputRelevance,
  inputDefinitions,
} from "@/db/schema/dataEntry";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import {
  energyResources,
  organisations,
  serviceAreas,
} from "@/db/schema/utility";
import { formatReportPeriodDisplay } from "@/lib/formatters";
import { buildManagedListNameMap } from "@/lib/managed-list-utils";
import { CurrentUser, resolveUtilityScopeId } from "@/lib/user.service";
import { and, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";

const isAllLikeOption = (name: string): boolean => {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === "all" ||
    normalized === "all options" ||
    normalized.startsWith("all ")
  );
};

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
  const tariffInputDefIds = definitionRows
    .filter(
      (row) => row.subcategoryName?.trim().toLowerCase() === "tariff structure",
    )
    .map((row) => row.inputDefId);
  const nonGenerationInputDefIds = definitionRows
    .filter((row) => row.subcategoryName?.trim().toLowerCase() !== "generation")
    .map((row) => row.inputDefId);
  const nonGenerationNonTariffInputDefIds = nonGenerationInputDefIds.filter(
    (inputDefId) => !tariffInputDefIds.includes(inputDefId),
  );

  const serviceAreaScopedInputDefinitionIds = new Set(
    definitionRows
      .filter((row) =>
        isServiceAreaScopedByDefinition(row.categoryName, row.subcategoryName),
      )
      .map((row) => row.inputDefId),
  );

  const serviceAreaConditions = [
    eq(serviceAreas.is_active, true),
    sql`lower(${serviceAreas.name}) not like '%utility%'`,
  ];
  const effectiveUtilityId = scopeUtilityId ?? resolveUtilityScopeId(user);
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
      energyResourceId: dataEntries.energy_resource_id,
      paymentModeId: dataEntries.payment_mode_id,
      customerTypeId: dataEntries.customer_type_id,
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
  const irrelevantByGeneration = new Set<string>();
  irrelevantRows.forEach((row) => {
    if (
      row.serviceAreaId != null &&
      row.paymentModeId != null &&
      row.customerTypeId != null &&
      row.energyResourceId == null
    ) {
      return;
    }

    if (row.serviceAreaId != null && row.energyResourceId != null) {
      irrelevantByGeneration.add(
        `${row.inputDefId}:${row.serviceAreaId}:${row.energyResourceId}`,
      );
      return;
    }

    const existing =
      irrelevantByServiceArea.get(row.serviceAreaId) ?? new Set<number>();
    existing.add(row.inputDefId);
    irrelevantByServiceArea.set(row.serviceAreaId, existing);
  });

  const latestTariffRelevanceByKey = new Map<string, boolean>();

  if (tariffInputDefIds.length > 0 && serviceAreaIds.length > 0) {
    const tariffRows = await db
      .select({
        inputDefId: dataEntries.input_def_id,
        serviceAreaId: dataEntries.service_area_id,
        paymentModeId: dataEntries.payment_mode_id,
        customerTypeId: dataEntries.customer_type_id,
        isRelevant: dataEntries.is_relevant,
      })
      .from(dataEntries)
      .where(
        and(
          eq(dataEntries.report_period_id, reportPeriodId),
          eq(dataEntries.is_deleted, false),
          inArray(dataEntries.input_def_id, tariffInputDefIds),
          inArray(dataEntries.service_area_id, serviceAreaIds),
          isNull(dataEntries.energy_resource_id),
        ),
      )
      .orderBy(desc(dataEntries.updatedAt));

    for (const row of tariffRows) {
      if (
        row.serviceAreaId == null ||
        row.paymentModeId == null ||
        row.customerTypeId == null
      ) {
        continue;
      }

      const key = `${row.inputDefId}:${row.serviceAreaId}:${row.paymentModeId}:${row.customerTypeId}`;

      if (latestTariffRelevanceByKey.has(key)) {
        continue;
      }

      latestTariffRelevanceByKey.set(key, row.isRelevant);
    }
  }

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
      energyProviderId: energyResources.energy_provider_id,
      energySourceId: energyResources.energy_source_id,
    })
    .from(energyResources)
    .where(and(...generatorConditions));

  const generationToggleByDimension = new Map<string, boolean>();
  const generationRelevanceByDimension = new Map<string, boolean>();
  const sourceRelevanceByDimension = new Map<string, boolean>();

  if (generationInputDefIds.length > 0 && generators.length > 0) {
    const generationServiceAreaIds = Array.from(
      new Set(generators.map((generator) => generator.serviceAreaId)),
    );
    const generationProviderIds = Array.from(
      new Set(generators.map((generator) => generator.energyProviderId)),
    );
    const generationSourceIds = Array.from(
      new Set(generators.map((generator) => generator.energySourceId)),
    );

    const generationToggleRows = await db
      .select({
        serviceAreaId: generationToggleRelevance.service_area_id,
        energyProviderId: generationToggleRelevance.energy_provider_id,
        energySourceId: generationToggleRelevance.energy_source_id,
        isRelevant: generationToggleRelevance.is_relevant,
      })
      .from(generationToggleRelevance)
      .where(
        and(
          eq(generationToggleRelevance.report_period_id, reportPeriodId),
          eq(generationToggleRelevance.is_deleted, false),
          inArray(
            generationToggleRelevance.service_area_id,
            generationServiceAreaIds,
          ),
          inArray(
            generationToggleRelevance.energy_provider_id,
            generationProviderIds,
          ),
          inArray(
            generationToggleRelevance.energy_source_id,
            generationSourceIds,
          ),
        ),
      )
      .orderBy(desc(generationToggleRelevance.updatedAt));

    for (const row of generationToggleRows) {
      const key = `${row.serviceAreaId}:${row.energyProviderId}:${row.energySourceId}`;

      if (generationToggleByDimension.has(key)) {
        continue;
      }

      generationToggleByDimension.set(key, row.isRelevant);
    }

    const generationRelevanceRows = await db
      .select({
        inputDefId: generationRelevance.input_def_id,
        serviceAreaId: generationRelevance.service_area_id,
        energyProviderId: generationRelevance.energy_provider_id,
        energySourceId: generationRelevance.energy_source_id,
        isRelevant: generationRelevance.is_relevant,
      })
      .from(generationRelevance)
      .where(
        and(
          eq(generationRelevance.report_period_id, reportPeriodId),
          eq(generationRelevance.is_deleted, false),
          inArray(generationRelevance.input_def_id, generationInputDefIds),
          inArray(
            generationRelevance.service_area_id,
            generationServiceAreaIds,
          ),
          inArray(
            generationRelevance.energy_provider_id,
            generationProviderIds,
          ),
          inArray(generationRelevance.energy_source_id, generationSourceIds),
        ),
      )
      .orderBy(desc(generationRelevance.updatedAt));

    for (const row of generationRelevanceRows) {
      const key = `${row.inputDefId}:${row.serviceAreaId}:${row.energyProviderId}:${row.energySourceId}`;

      if (generationRelevanceByDimension.has(key)) {
        continue;
      }

      generationRelevanceByDimension.set(key, row.isRelevant);
    }

    const sourceRelevanceRows = await db
      .select({
        id: inputRelevance.id,
        inputDefId: inputRelevance.input_def_id,
        sourceId: inputRelevance.dimension_id,
        isRelevant: inputRelevance.is_relevant,
      })
      .from(inputRelevance)
      .where(
        and(
          inArray(inputRelevance.input_def_id, generationInputDefIds),
          inArray(inputRelevance.dimension_id, generationSourceIds),
        ),
      )
      .orderBy(desc(inputRelevance.id));

    for (const row of sourceRelevanceRows) {
      const key = `${row.inputDefId}:${row.sourceId}`;

      if (sourceRelevanceByDimension.has(key)) {
        continue;
      }

      sourceRelevanceByDimension.set(key, row.isRelevant);
    }
  }

  const expectedKeys = new Set<string>();

  nonGenerationNonTariffInputDefIds.forEach((inputDefId) => {
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

  if (tariffInputDefIds.length > 0) {
    const paymentModeRows = await db
      .select({
        id: managedListItems.id,
        name: managedListItems.name,
      })
      .from(managedListItems)
      .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
      .where(
        and(
          eq(managedListItems.is_active, true),
          eq(managedLists.is_active, true),
          ilike(managedLists.name, "%payment mode%"),
        ),
      );

    const customerTypeRows = await db
      .select({
        id: managedListItems.id,
        name: managedListItems.name,
      })
      .from(managedListItems)
      .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
      .where(
        and(
          eq(managedListItems.is_active, true),
          eq(managedLists.is_active, true),
          ilike(managedLists.name, "%customer type%"),
        ),
      );

    const paymentModes = paymentModeRows.filter(
      (row) => !isAllLikeOption(row.name),
    );
    const customerTypes = customerTypeRows.filter(
      (row) => !isAllLikeOption(row.name),
    );

    if (paymentModes.length > 0 && customerTypes.length > 0) {
      for (const inputDefId of tariffInputDefIds) {
        for (const serviceAreaId of serviceAreaIds) {
          for (const paymentMode of paymentModes) {
            for (const customerType of customerTypes) {
              const key = `${inputDefId}:${serviceAreaId}:${paymentMode.id}:${customerType.id}`;

              if (latestTariffRelevanceByKey.get(key) === false) {
                continue;
              }

              expectedKeys.add(
                `${inputDefId}:${serviceAreaId}:null:${paymentMode.id}:${customerType.id}`,
              );
            }
          }
        }
      }
    }
  }

  generators.forEach((generator) => {
    const irrelevantForServiceArea =
      irrelevantByServiceArea.get(generator.serviceAreaId) ?? new Set<number>();
    const toggleKey = `${generator.serviceAreaId}:${generator.energyProviderId}:${generator.energySourceId}`;

    generationInputDefIds.forEach((inputDefId) => {
      if (irrelevantForServiceArea.has(inputDefId)) {
        return;
      }

      const generationRelevanceKey = `${inputDefId}:${generator.serviceAreaId}:${generator.energyProviderId}:${generator.energySourceId}`;
      const sourceRelevanceKey = `${inputDefId}:${generator.energySourceId}`;
      const generationEntryKey = `${inputDefId}:${generator.serviceAreaId}:${generator.id}`;

      if (generationToggleByDimension.get(toggleKey) === false) {
        return;
      }

      if (
        generationRelevanceByDimension.get(generationRelevanceKey) === false
      ) {
        return;
      }

      if (sourceRelevanceByDimension.get(sourceRelevanceKey) === false) {
        return;
      }

      if (irrelevantByGeneration.has(generationEntryKey)) {
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
  const de = db
    .select()
    .from(dataEntries)
    .where(
      and(eq(dataEntries.is_deleted, false), eq(dataEntries.is_relevant, true)),
    );
  const rp = db
    .select()
    .from(reportPeriods)
    .leftJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .orderBy(desc(reportPeriods.report_date));
  if (!forceAllUtilities) {
    const scopedUtilityId = resolveUtilityScopeId(user);
    if (scopedUtilityId != null) {
      rp.where(eq(reportPeriods.utility_id, scopedUtilityId));
    }
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

    const requested = requestedCountByPeriod.get(item.report_periods.id) ?? 0;
    const completed =
      enteredOnly +
      reviewedOnly +
      approvedOnly +
      endorsedOnly +
      dataNotAvailable;
    const pending = Math.max(requested - completed, 0);

    // Summary statuses are intentionally cumulative from Entered -> Endorsed.
    const entered = enteredOnly;
    const reviewed = entered + dataNotAvailable;
    const approved = reviewed + reviewedOnly;
    const endorsed = approved + approvedOnly + endorsedOnly;

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
