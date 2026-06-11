import { and, eq, isNull } from "drizzle-orm";

import type { AggregatedWorkerScope } from "@/app/data-entry/enter-data/services/aggregated-worker/source-reader";
import { db } from "@/db/connection";
import { dataEntries, dataEntryLogs, DataEntryStatusId } from "@/db/schema/dataEntry";
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
      eq(dataEntries.input_def_id, inputDefId),
    ];

    if (scope.serviceAreaId == null) {
      existingConditions.push(isNull(dataEntries.service_area_id));
    } else {
      existingConditions.push(
        eq(dataEntries.service_area_id, scope.serviceAreaId),
      );
    }

    if (scope.energyResourceId == null) {
      existingConditions.push(isNull(dataEntries.energy_resource_id));
    } else {
      existingConditions.push(
        eq(dataEntries.energy_resource_id, scope.energyResourceId),
      );
    }

    const [existing] = await tx
      .select({ id: dataEntries.id, value: dataEntries.value })
      .from(dataEntries)
      .where(and(...existingConditions))
      .limit(1);

    const previousValue = existing?.value ?? null;

    const writeValues = {
      report_period_id: scope.reportPeriodId,
      input_def_id: inputDefId,
      service_area_id: scope.serviceAreaId ?? null,
      energy_resource_id: scope.energyResourceId ?? null,
      value,
      status_id: DataEntryStatusId.Entered,
      is_deleted: false,
      updated_at: now.toISOString(),
      updated_by_id: user.id,
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
          `Unable to persist aggregated target value. inputDefId=${inputDefId}, reportPeriodId=${scope.reportPeriodId}, energyResourceId=${scope.energyResourceId ?? "null"}`,
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
