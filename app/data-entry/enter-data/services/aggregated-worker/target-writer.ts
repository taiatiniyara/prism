import { and, eq, isNull, sql } from "drizzle-orm";

import type { AggregatedWorkerScope } from "@/app/data-entry/enter-data/services/aggregated-worker/source-reader";
import { db } from "@/db/connection";
import {
  dataEntries,
  dataEntryLogs,
  DataEntryStatusId,
} from "@/db/schema/dataEntry";
import { buildDimensionMembers } from "@/lib/data-entry/dimensions";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { getCurrentUser } from "@/lib/user.service";

interface WriteTargetValueInput {
  inputDefId: number;
  value: string;
  scope: AggregatedWorkerScope;
}

export const writeCalculatedTargetValue = async ({
  inputDefId,
  value,
  scope,
}: WriteTargetValueInput): Promise<string> => {
  const user = await getCurrentUser();
  const now = new Date();

  return db.transaction(async (tx) => {
    const existingConditions = [
      eq(dataEntries.report_period_id, scope.reportPeriodId),
      eq(dataEntries.measure_def_id, inputDefId),
    ];

    if (scope.serviceAreaId == null) {
      existingConditions.push(isNull(dataEntries.service_area_id));
    } else {
      existingConditions.push(
        eq(dataEntries.service_area_id, scope.serviceAreaId),
      );
    }

    if (scope.unitId == null) {
      existingConditions.push(isNull(dataEntries.unit_id));
    } else {
      existingConditions.push(
        eq(dataEntries.unit_id, scope.unitId),
      );
    }

    const [existing] = await tx
      .select({
        id: dataEntries.id,
        // Prefer the typed numeric column; fall back to legacy `value` (§4.8).
        value: sql<
          string | null
        >`coalesce(${dataEntries.value_numeric}::text, ${dataEntries.value})`,
      })
      .from(dataEntries)
      .where(and(...existingConditions))
      .limit(1);

    const previousValue = existing?.value ?? null;

    // The report period is utility-specific, so the computed row belongs to the
    // period's utility — keep it in the same partition as its input rows.
    const [period] = await tx
      .select({ utilityId: reportPeriods.utility_id })
      .from(reportPeriods)
      .where(eq(reportPeriods.id, scope.reportPeriodId))
      .limit(1);

    const writeValues = {
      report_period_id: scope.reportPeriodId,
      measure_def_id: inputDefId,
      utility_id: period?.utilityId ?? null,
      service_area_id: scope.serviceAreaId ?? null,
      unit_id: scope.unitId ?? null,
      // Calculated targets are numeric → write the typed column (§4.8); legacy
      // `value` kept transitionally so un-migrated readers don't regress.
      value_numeric: value,
      value,
      // A computed value means the data IS available — clear any prior
      // no_data_reason, else a row previously flagged 'not_available' would hold
      // BOTH a value and a reason and violate chk_value_xor_nodata (the write
      // then throws and the whole period's compute errors).
      no_data_reason: null,
      status_id: DataEntryStatusId.Entered,
      is_deleted: false,
      updated_at: now.toISOString(),
      updated_by_id: user.id,
      // A calculated target is a utility-level aggregate, so every tag dimension
      // carries its canonical "All" member. Sourced from the central dimension
      // map (lib/dimensions/dimension-map.ts via buildDimensionMembers) — the
      // ids are verified-identical to the managed-list "All" rows this used to
      // query, so this is byte-for-byte the same write with 10 fewer DB lookups.
      ...buildDimensionMembers(),
    };

    let targetDataEntryId: string;

    if (existing) {
      await tx
        .update(dataEntries)
        .set(writeValues)
        .where(eq(dataEntries.id, existing.id));

      targetDataEntryId = existing.id;
    } else {
      const [inserted] = await tx
        .insert(dataEntries)
        .values(writeValues)
        .returning({ id: dataEntries.id });

      if (!inserted?.id) {
        throw new Error(
          `Unable to persist aggregated target value. inputDefId=${inputDefId}, reportPeriodId=${scope.reportPeriodId}, unitId=${scope.unitId ?? "null"}`,
        );
      }

      targetDataEntryId = inserted.id;
    }

    await tx.insert(dataEntryLogs).values({
      data_entry_id: targetDataEntryId,
      previous_value: previousValue ?? "",
      new_value: value,
      updated_by_id: user.id,
      updated_at: now,
    });

    return targetDataEntryId;
  });
};
