import { and, eq, isNull } from "drizzle-orm";

import type { AggregatedWorkerScope } from "@/app/data-entry/enter-data/services/aggregated-worker/source-reader";
import { db } from "@/db/connection";
import {
  dataEntries,
  dataEntryLogs,
  DataEntryStatusId,
} from "@/db/schema/dataEntry";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
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

    const dims = await getAllMemberIdsMap();

    const writeValues = {
      report_period_id: scope.reportPeriodId,
      measure_def_id: inputDefId,
      service_area_id: scope.serviceAreaId ?? null,
      energy_resource_id: scope.energyResourceId ?? null,
      value,
      status_id: DataEntryStatusId.Entered,
      is_deleted: false,
      updated_at: now.toISOString(),
      updated_by_id: user.id,
      energy_source_id: dims.energySource,
      energy_type_id: dims.energyType,
      energy_provider_id: dims.energyProvider,
      energy_resource_type_id: dims.energyResourceType,
      customer_type_id: dims.customerType,
      payment_mode_id: dims.paymentMode,
      consumption_band_id: dims.consumptionBand,
      division_id: dims.division,
      gender_id: dims.gender,
      utility_function_id: dims.utilityFunction,
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

async function getAllMemberId(listName: string): Promise<number> {
  const [item] = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedLists.name, listName),
        eq(managedListItems.name, "All"),
      ),
    )
    .limit(1);
  if (!item) throw new Error(`"All" member not found for list: ${listName}`);
  return item.id;
}

async function getAllMemberIdsMap() {
  const [
    energySource,
    energyType,
    energyProvider,
    energyResourceType,
    customerType,
    paymentMode,
    consumptionBand,
    division,
    gender,
    utilityFunction,
  ] = await Promise.all([
    getAllMemberId("Energy Source"),
    getAllMemberId("Energy Type"),
    getAllMemberId("Energy Provider"),
    getAllMemberId("Energy Resource Type"),
    getAllMemberId("Customer Type"),
    getAllMemberId("Payment Mode"),
    getAllMemberId("Consumption Band"),
    getAllMemberId("Division"),
    getAllMemberId("Gender"),
    getAllMemberId("Utility Function"),
  ]);
  return {
    energySource,
    energyType,
    energyProvider,
    energyResourceType,
    customerType,
    paymentMode,
    consumptionBand,
    division,
    gender,
    utilityFunction,
  };
}
