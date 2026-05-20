"use server";

import { db } from "@/db/connection";
import {
  dataEntries,
  inputDefinitions,
} from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { managedListItems } from "@/db/schema/managedLists";
import {
  getCurrentUser,
  hasGlobalUtilityAccess,
} from "@/lib/user.service";
import { formatReportPeriodDisplay } from "@/lib/formatters";
import { and, eq } from "drizzle-orm";

export interface ReviewFeedbackRow {
  dataEntryId: string;
  inputName: string;
  unitName: string | null;
  value: string | null;
  reportPeriodLabel: string;
  utilityName: string;
  comments: {
    comment: string;
    commenterRole: string;
    date: string;
  }[];
}

export async function GetReviewFeedback(): Promise<ReviewFeedbackRow[]> {
  const user = await getCurrentUser();

  if (!hasGlobalUtilityAccess(user)) {
    return [];
  }

  const periods = await db
    .select({
      id: reportPeriods.id,
      report_date: reportPeriods.report_date,
      report_type_name: managedListItems.name,
      utility_name: organisations.name,
      utility_acronym: organisations.acronym,
    })
    .from(reportPeriods)
    .leftJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .leftJoin(managedListItems, eq(reportPeriods.report_type_id, managedListItems.id))
    .orderBy(reportPeriods.report_date);

  const results: ReviewFeedbackRow[] = [];

  for (const period of periods) {
    const entries = await db
      .select({
        id: dataEntries.id,
        input_def_id: dataEntries.input_def_id,
        value: dataEntries.value,
        comments: dataEntries.comments,
      })
      .from(dataEntries)
      .where(
        and(
          eq(dataEntries.report_period_id, period.id),
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, true),
        ),
      );

    for (const entry of entries) {
      if (!entry.comments || entry.comments.length === 0) continue;

      const [inputDef] = await db
        .select({
          name: inputDefinitions.name,
          unit_id: inputDefinitions.unit_id,
        })
        .from(inputDefinitions)
        .where(eq(inputDefinitions.id, entry.input_def_id))
        .limit(1);

      const unitName = inputDef?.unit_id
        ? await db
            .select({ name: managedListItems.name })
            .from(managedListItems)
            .where(eq(managedListItems.id, inputDef.unit_id))
            .limit(1)
            .then((rows) => rows[0]?.name ?? null)
        : null;

      results.push({
        dataEntryId: entry.id,
        inputName: inputDef?.name ?? `ID ${entry.input_def_id}`,
        unitName,
        value: entry.value,
        reportPeriodLabel: formatReportPeriodDisplay(period.report_date, period.report_type_name),
        utilityName: period.utility_acronym ?? period.utility_name ?? "",
        comments: entry.comments.map((c) => ({
          comment: c.comment,
          commenterRole: c.commenterRole,
          date: c.date instanceof Date ? c.date.toISOString() : String(c.date),
        })),
      });
    }
  }

  return results;
}
