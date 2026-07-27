import { and, eq, isNull, sql } from "drizzle-orm";

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

    const dims = await getAllMemberIdsMap();

    const writeValues = {
      report_period_id: scope.reportPeriodId,
      measure_def_id: inputDefId,
      service_area_id: scope.serviceAreaId ?? null,
      unit_id: scope.unitId ?? null,
      // Calculated targets are numeric → write the typed column (§4.8); legacy
      // `value` kept transitionally so un-migrated readers don't regress.
      value_numeric: value,
      value,
      status_id: DataEntryStatusId.Entered,
      is_deleted: false,
      updated_at: now.toISOString(),
      updated_by_id: user.id,
      technology_id: dims.energySource,
      category_id: dims.energyType,
      provider_id: dims.energyProvider,
      asset_class_id: dims.unitType,
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
    unitType,
    customerType,
    paymentMode,
    consumptionBand,
    division,
    gender,
    utilityFunction,
  ] = await Promise.all([
    getAllMemberId("Technology"),
    getAllMemberId("Category"),
    getAllMemberId("Provider"),
    getAllMemberId("Asset Class"),
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
    unitType,
    customerType,
    paymentMode,
    consumptionBand,
    division,
    gender,
    utilityFunction,
  };
}
