"use server";

import { db } from "@/db/connection";
import { roles } from "@/db/schema/auth-schema";
import { dataEntries, DataEntryStatusId } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { formatReportPeriodDisplay } from "@/lib/formatters";
import { buildManagedListNameMap } from "@/lib/managed-list-utils";
import { CurrentUser, resolveUtilityScopeId } from "@/lib/user.service";
import { and, desc, eq } from "drizzle-orm";
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

    const requested = entriesForPeriod.length;
    const completed =
      enteredOnly +
      reviewedOnly +
      approvedOnly +
      endorsedOnly +
      dataNotAvailable;
    const pending = Math.max(requested - completed, 0);

    const entered = enteredOnly;
    const reviewed = entered + dataNotAvailable;
    const approved = entered + dataNotAvailable - reviewed;
    const endorsed = entered + dataNotAvailable - reviewed - approved;

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
