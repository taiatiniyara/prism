"use server";

import { db } from "@/db/connection";
import { roles } from "@/db/schema/auth-schema";
import {
  dataEntries,
  DataEntryStatusId,
  measureDefinitions,
  inputRelevance,
} from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import {
  units,
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
  Utility_id: number;
  Period: string;
  Utility: string;
  Report_Type: string;
  Requested: number;
  Pending: number;
  Entered: number;
  Reviewed: number;
  Approved: number;
  Not_Available: number;
  Pending_With: string;
  Updated: string;
}

export interface GetReportPeriodsOptions {
  forceAllUtilities?: boolean;
}

const SUBCAT_GENERATION = 273;
const SUBCAT_TARIFF = 232;
const CAT_OPERATIONAL = 205;

export async function GetReportPeriods(
  user: CurrentUser,
  options: GetReportPeriodsOptions = {},
): Promise<ReportPeriodDTO[]> {
  const forceAllUtilities = options.forceAllUtilities === true;
  const scopedUtilityId = !forceAllUtilities
    ? resolveUtilityScopeId(user)
    : null;

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
  if (list.length === 0) return [];

  const reportPeriodIds = list.map((item) => item.report_periods.id);

  const definitionRows = await db
    .select({
      inputDefId: measureDefinitions.id,
      subcategoryId: measureDefinitions.measures_subgroup_id,
      categoryId: measureDefinitions.measures_group_id,
      aggLevelId: measureDefinitions.agg_level_id,
      subcategoryName: sql<string | null>`(
        select mli.name from managed_list_items mli where mli.id = ${measureDefinitions.measures_subgroup_id} limit 1
      )`,
      categoryName: sql<string | null>`(
        select mli.name from managed_list_items mli where mli.id = ${measureDefinitions.measures_group_id} limit 1
      )`,
    })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.is_system_generated, false),
        sql`lower(coalesce(
          (select mli.name from managed_list_items mli where mli.id = ${measureDefinitions.measures_subgroup_id}), ''
        )) <> 'country context'`,
      ),
    );

  const genDefIds = definitionRows
    .filter((row) => row.subcategoryId === SUBCAT_GENERATION)
    .map((row) => row.inputDefId);

  const saConditions = [
    eq(serviceAreas.is_active, true),
    eq(serviceAreas.is_virtual, false),
  ];
  if (scopedUtilityId != null)
    saConditions.push(eq(serviceAreas.utility_id, scopedUtilityId));
  else if (
    !forceAllUtilities &&
    !hasGlobalUtilityAccess(user) &&
    user.org_id != null
  )
    saConditions.push(eq(serviceAreas.utility_id, user.org_id));

  const serviceAreaRows = await db
    .select({ id: serviceAreas.id, utility_id: serviceAreas.utility_id })
    .from(serviceAreas)
    .where(and(...saConditions));

  const saIdsByUtility = new Map<number, number[]>();
  for (const sa of serviceAreaRows) {
    const arr = saIdsByUtility.get(sa.utility_id) ?? [];
    arr.push(sa.id);
    saIdsByUtility.set(sa.utility_id, arr);
  }

  const erConditions: ReturnType<typeof eq>[] = [];
  if (scopedUtilityId != null)
    erConditions.push(eq(units.utility_id, scopedUtilityId));
  else if (
    !forceAllUtilities &&
    !hasGlobalUtilityAccess(user) &&
    user.org_id != null
  )
    erConditions.push(eq(units.utility_id, user.org_id));

  const allErs = await db
    .select({
      id: units.id,
      service_area_id: units.service_area_id,
      utility_id: units.utility_id,
      provider_id: units.provider_id,
      technology_id: units.technology_id,
      is_virtual: units.is_virtual,
      period_entries: units.period_entries,
    })
    .from(units)
    .where(and(...erConditions));

  const irrelevantInputRel = await db
    .select({
      inputDefId: inputRelevance.measure_def_id,
      dimensionId: inputRelevance.dimension_id,
    })
    .from(inputRelevance)
    .where(
      and(
        eq(inputRelevance.is_relevant, false),
        inArray(
          inputRelevance.measure_def_id,
          genDefIds.length > 0 ? genDefIds : [-1],
        ),
      ),
    );

  const existingEntries = await db
    .select()
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.is_deleted, false),
        eq(dataEntries.is_relevant, true),
        inArray(dataEntries.report_period_id, reportPeriodIds),
      ),
    );

  return list.map((item) => {
    const rpId = item.report_periods.id;
    const utilId = item.report_periods.utility_id;
    const saIds = saIdsByUtility.get(utilId) ?? [];

    const periodEntries = existingEntries.filter(
      (x) => x.report_period_id === rpId,
    );

    let enteredOnly = 0,
      reviewedOnly = 0,
      approvedOnly = 0,
      dataNotAvailable = 0;
    for (const entry of periodEntries) {
      if (entry.status_id === DataEntryStatusId.Entered) enteredOnly++;
      else if (entry.status_id === DataEntryStatusId.Reviewed) reviewedOnly++;
      else if (entry.status_id === DataEntryStatusId.Approved) approvedOnly++;
      else if (
        entry.status_id ===
        ((DataEntryStatusId as Record<string, unknown>).Endorsed as number)
      )
        approvedOnly++;
      else if (entry.status_id === DataEntryStatusId.Not_Available)
        dataNotAvailable++;
    }

    const periodGenerators = allErs.filter((er) => {
      if (er.utility_id !== utilId) return false;
      if (er.is_virtual) return false;
      const pe =
        (er.period_entries as EnergyResourcePeriodEntry[] | undefined) ?? [];
      return pe.some((p) => p.report_period_id === rpId && p.is_active);
    });

    // Build exclusion sets from relevance tables
    const irrelInput = new Set<string>();
    irrelevantInputRel.forEach((r) =>
      irrelInput.add(`${r.inputDefId}:${r.dimensionId}`),
    );

    // Requested formula:
    // 1. Most inputs: × 1
    // 2. Tariff + Operational (non-Generation): × non-virtual SA count
    // 3. Generation: × non-virtual generator count
    let requested = 0;

    for (const def of definitionRows) {
      const inputDefId = def.inputDefId;
      const subcat = def.subcategoryId;
      const cat = def.categoryId;
      const isGen = subcat === SUBCAT_GENERATION;
      const isTariff = subcat === SUBCAT_TARIFF;
      const isOp = cat === CAT_OPERATIONAL;

      if (isGen) {
        // Generation inputs: × non-virtual generators
        for (const gen of periodGenerators) {
          if (gen.service_area_id && saIds.includes(gen.service_area_id)) {
            if (!irrelInput.has(`${inputDefId}:${gen.technology_id}`)) {
              requested++;
            }
          }
        }
      } else if (isTariff || isOp) {
        // Tariff and Operational inputs (excluding Generation): × non-virtual SA count
        for (const _saId of saIds) {
          requested++;
        }
      } else {
        // Everything else: × 1
        requested++;
      }
    }

    const completed =
      enteredOnly + reviewedOnly + approvedOnly + dataNotAvailable;
    const finalRequested = Math.max(requested, completed);
    const pending = Math.max(finalRequested - completed, 0);

    return {
      Id: rpId,
      Utility_id: utilId,
      Period: formatReportPeriodDisplay(
        item.report_periods.report_date,
        reportTypeNameById.get(item.report_periods.report_type_id ?? -1),
      ),
      Utility: item.organisations?.acronym || "",
      Report_Type:
        reportTypeNameById.get(item.report_periods.report_type_id ?? -1) || "",
      Pending_With: roleNameById.get(item.report_periods.who_id ?? -1) || "",
      Updated: item.report_periods.updated_at.toISOString().split("T")[0],
      Requested: finalRequested,
      Pending: pending,
      Entered: enteredOnly,
      Reviewed: reviewedOnly,
      Approved: approvedOnly,
      Not_Available: dataNotAvailable,
    };
  });
}
