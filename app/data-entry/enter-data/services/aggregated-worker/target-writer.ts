import { and, eq, isNull } from "drizzle-orm";

import type { AggregatedWorkerScope } from "@/app/data-entry/enter-data/services/aggregated-worker/source-reader";
import { db } from "@/db/connection";
import { dataEntries, DataEntryStatusId } from "@/db/schema/dataEntry";

interface WriteTargetValueInput {
  inputDefId: number;
  value: string;
  scope: AggregatedWorkerScope;
}

export const writeCalculatedTargetValue = async ({
  inputDefId,
  value,
  scope,
}: WriteTargetValueInput): Promise<void> => {
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

  const [existing] = await db
    .select({ id: dataEntries.id })
    .from(dataEntries)
    .where(and(...existingConditions))
    .limit(1);

  const writeValues = {
    report_period_id: scope.reportPeriodId,
    input_def_id: inputDefId,
    service_area_id: scope.serviceAreaId ?? null,
    energy_resource_id: scope.energyResourceId ?? null,
    value,
    status_id: DataEntryStatusId.Entered,
    is_deleted: false,
  };

  if (existing) {
    await db
      .update(dataEntries)
      .set(writeValues)
      .where(eq(dataEntries.id, existing.id));

    return;
  }

  await db.insert(dataEntries).values(writeValues);
};
