"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getCurrentUser, hasGlobalUtilityAccess } from "@/lib/user.service";
import { db } from "@/db/connection";
import {
  dataEntries,
  measureDefinitions,
  DataEntryStatusId,
  DataEntryComment,
} from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { managedLists } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { resolveValueColumn } from "@/lib/data-entry/value-router";
import { upsertHoursInPeriod } from "@/lib/period-hours";
import {
  MeasureEntryFilterContext,
  MeasureEntryPageViewModel,
  MeasureEntryRowView,
  MeasureEntryProgressBreakdownItem,
  UpdateMeasureEntryValuePayload,
  UpdateMeasureEntryAvailabilityPayload,
  UpdateMeasureEntryCommentPayload,
} from "./types";

const COOKIE_PREFIX = "measure_entry_v2_";

async function getFilterContextFromCookies(): Promise<MeasureEntryFilterContext> {
  const jar = await cookies();
  const getInt = (key: string): number | null => {
    const val = jar.get(`${COOKIE_PREFIX}${key}`)?.value;
    if (!val) return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  };
  return {
    reportPeriodId: getInt("reportPeriodId"),
    measureCategoryId: getInt("measureCategoryId"),
    measureSubcategoryId: getInt("measureSubcategoryId"),
    dataEntryStatusId: getInt("dataEntryStatusId"),
    energyProviderId: getInt("energyProviderId"),
    energyTypeId: getInt("energyTypeId"),
    energySourceId: getInt("energySourceId"),
    customerTypeId: getInt("customerTypeId"),
    paymentModeId: getInt("paymentModeId"),
    consumptionBandId: getInt("consumptionBandId"),
    divisionId: getInt("divisionId"),
    genderId: getInt("genderId"),
  };
}

export async function setFilterCookie(key: string, value: string | null) {
  const jar = await cookies();
  const fullKey = `${COOKIE_PREFIX}${key}`;
  if (value == null || value === "") {
    jar.delete(fullKey);
  } else {
    jar.set(fullKey, value, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60,
    });
  }
}

export async function updateFilterContextAction(
  key: string,
  value: number | null,
) {
  "use server";
  await setFilterCookie(key, value?.toString() ?? null);
}

async function getManagedListItems(
  listName: string,
): Promise<{ id: number; name: string }[]> {
  const list = await db
    .select({ id: managedLists.id })
    .from(managedLists)
    .where(eq(managedLists.name, listName))
    .limit(1);
  if (!list[0]) return [];
  const items = await db
    .select({ id: managedListItems.id, name: managedListItems.name })
    .from(managedListItems)
    .where(
      and(
        eq(managedListItems.list_id, list[0].id),
        eq(managedListItems.is_active, true),
      ),
    )
    .orderBy(asc(managedListItems.id));
  return items;
}

async function buildReportPeriodOptions(
  userUtilityId: number | null,
): Promise<{ id: number; name: string }[]> {
  let results;
  if (userUtilityId != null) {
    results = await db
      .select({
        id: reportPeriods.id,
        name: organisations.name,
      })
      .from(reportPeriods)
      .innerJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
      .where(eq(reportPeriods.utility_id, userUtilityId))
      .orderBy(asc(reportPeriods.id));
  } else {
    results = await db
      .select({
        id: reportPeriods.id,
        name: organisations.name,
      })
      .from(reportPeriods)
      .innerJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
      .orderBy(asc(reportPeriods.id));
  }
  return results.map((r) => ({
    id: r.id,
    name: `${r.name} #${r.id}`,
  }));
}

export async function getMeasureEntryFilterViewModel(): Promise<MeasureEntryPageViewModel> {
  const user = await getCurrentUser();
  const ctx = await getFilterContextFromCookies();

  const isGlobal = hasGlobalUtilityAccess(user);
  const userUtilityId = isGlobal ? null : user.org_id;

  const [
    periods,
    categories,
    subcategories,
    energyProviders,
    energyTypes,
    energySources,
    customerTypes,
    paymentModes,
    consumptionBands,
    divisions,
    genders,
  ] = await Promise.all([
    buildReportPeriodOptions(userUtilityId),
    getManagedListItems("Data Label Category"),
    getManagedListItems("Data Label Sub-Category"),
    getManagedListItems("Provider"),
    getManagedListItems("Category"),
    getManagedListItems("Technology"),
    getManagedListItems("Customer Type"),
    getManagedListItems("Payment Mode"),
    getManagedListItems("Consumption Band"),
    getManagedListItems("Division"),
    getManagedListItems("Gender"),
  ]);

  const statuses = [
    { id: DataEntryStatusId.Pending, name: "Pending" },
    { id: DataEntryStatusId.Entered, name: "Entered" },
    { id: DataEntryStatusId.Not_Available, name: "Not Available" },
  ];

  const conditions = [eq(dataEntries.is_deleted, false)];

  if (ctx.reportPeriodId) {
    conditions.push(eq(dataEntries.report_period_id, ctx.reportPeriodId));
  }
  if (ctx.measureCategoryId) {
    conditions.push(eq(measureDefinitions.measures_group_id, ctx.measureCategoryId));
  }
  if (ctx.measureSubcategoryId) {
    conditions.push(
      eq(measureDefinitions.measures_subgroup_id, ctx.measureSubcategoryId),
    );
  }
  if (ctx.dataEntryStatusId) {
    conditions.push(eq(dataEntries.status_id, ctx.dataEntryStatusId));
  }

  const dimCols = [
    dataEntries.provider_id,
    dataEntries.category_id,
    dataEntries.technology_id,
    dataEntries.customer_type_id,
    dataEntries.payment_mode_id,
    dataEntries.consumption_band_id,
    dataEntries.division_id,
    dataEntries.gender_id,
  ];
  const dimVals = [
    ctx.energyProviderId,
    ctx.energyTypeId,
    ctx.energySourceId,
    ctx.customerTypeId,
    ctx.paymentModeId,
    ctx.consumptionBandId,
    ctx.divisionId,
    ctx.genderId,
  ];
  for (let i = 0; i < dimCols.length; i++) {
    if (dimVals[i] != null) {
      conditions.push(eq(dimCols[i], dimVals[i]!));
    }
  }

  const rawRows = await db
    .select({
      dataEntryId: dataEntries.id,
      measureId: measureDefinitions.id,
      measureName: measureDefinitions.name,
      uomName: managedListItems.name,
      categoryId: measureDefinitions.measures_group_id,
      subcategoryId: measureDefinitions.measures_subgroup_id,
      dataTypeId: measureDefinitions.data_type_id,
      valueNumeric: dataEntries.value_numeric,
      valueBoolean: dataEntries.value_boolean,
      valueOptionId: dataEntries.value_option_id,
      valueString: dataEntries.value_text,
      energyProviderId: dataEntries.provider_id,
      energyTypeId: dataEntries.category_id,
      energySourceId: dataEntries.technology_id,
      customerTypeId: dataEntries.customer_type_id,
      paymentModeId: dataEntries.payment_mode_id,
      consumptionBandId: dataEntries.consumption_band_id,
      divisionId: dataEntries.division_id,
      genderId: dataEntries.gender_id,
      unitId: dataEntries.unit_id,
      statusId: dataEntries.status_id,
      isMandatory: measureDefinitions.is_mandatory,
      validRangeMin: measureDefinitions.valid_range_min,
      validRangeMax: measureDefinitions.valid_range_max,
      comments: dataEntries.comments,
      updatedAt: dataEntries.updatedAt,
    })
    .from(dataEntries)
    .innerJoin(
      measureDefinitions,
      eq(dataEntries.measure_def_id, measureDefinitions.id),
    )
    .leftJoin(
      managedListItems,
      eq(measureDefinitions.unit_id, managedListItems.id),
    )
    .where(and(...conditions))
    .limit(500);

  const measureIds = [...new Set(rawRows.map((r) => r.measureId))];
  const dataTypeMap = new Map<number, string | null>();
  if (measureIds.length > 0) {
    const dtRows = await db
      .select({
        id: measureDefinitions.id,
        name: sql<string>`ml.name`,
      })
      .from(measureDefinitions)
      .innerJoin(
        sql`managed_list_items ml`,
        sql`${measureDefinitions.data_type_id} = ml.id`,
      )
      .where(inArray(measureDefinitions.id, measureIds));
    for (const row of dtRows) {
      dataTypeMap.set(row.id, row.name);
    }
  }

  const allDimIds = new Set<number>();
  for (const r of rawRows) {
    for (const id of [
      r.energyProviderId,
      r.energyTypeId,
      r.energySourceId,
      r.customerTypeId,
      r.paymentModeId,
      r.consumptionBandId,
      r.divisionId,
      r.genderId,
    ]) {
      if (id != null) allDimIds.add(id);
    }
  }

  const dimItems =
    allDimIds.size > 0
      ? await db
          .select({ id: managedListItems.id, name: managedListItems.name })
          .from(managedListItems)
          .where(inArray(managedListItems.id, [...allDimIds]))
      : [];

  const dimNameMap = new Map<number, string>();
  for (const d of dimItems) dimNameMap.set(d.id, d.name);

  const nameOf = (id: number | null): string | null =>
    id != null ? (dimNameMap.get(id) ?? String(id)) : null;

  const viewRows: MeasureEntryRowView[] = rawRows.map((r) => {
    const dataTypeName = dataTypeMap.get(r.measureId) ?? null;
    const valueColumn = resolveValueColumn(dataTypeName);
    let displayValue: string | null = null;
    if (valueColumn === "value_numeric" && r.valueNumeric != null) {
      displayValue = String(r.valueNumeric);
    } else if (valueColumn === "value_boolean" && r.valueBoolean != null) {
      displayValue = r.valueBoolean ? "Yes" : "No";
    } else if (valueColumn === "value_option_id" && r.valueOptionId != null) {
      displayValue = dimNameMap.get(r.valueOptionId) ?? String(r.valueOptionId);
    } else if (valueColumn === "value_string" && r.valueString != null) {
      displayValue = r.valueString;
    }

    return {
      dataEntryId: r.dataEntryId ?? undefined,
      measureId: r.measureId,
      measureName: r.measureName,
      uomName: r.uomName ?? null,
      categoryName: null,
      subcategoryName: null,
      dataTypeId: r.dataTypeId,
      dataTypeName,
      valueColumn,
      valueNumeric: r.valueNumeric != null ? Number(r.valueNumeric) : null,
      valueBoolean: r.valueBoolean ?? null,
      valueOptionId: r.valueOptionId ?? null,
      valueString: r.valueString ?? null,
      displayValue,
      energyProviderId: r.energyProviderId ?? 0,
      energyProviderName: nameOf(r.energyProviderId),
      energyTypeId: r.energyTypeId ?? 0,
      energyTypeName: nameOf(r.energyTypeId),
      energySourceId: r.energySourceId ?? 0,
      energySourceName: nameOf(r.energySourceId),
      customerTypeId: r.customerTypeId ?? 0,
      customerTypeName: nameOf(r.customerTypeId),
      paymentModeId: r.paymentModeId ?? 0,
      paymentModeName: nameOf(r.paymentModeId),
      consumptionBandId: r.consumptionBandId ?? 0,
      consumptionBandName: nameOf(r.consumptionBandId),
      divisionId: r.divisionId ?? 0,
      divisionName: nameOf(r.divisionId),
      genderId: r.genderId ?? 0,
      genderName: nameOf(r.genderId),
      unitId: r.unitId ?? null,
      unitName: null,
      statusId: r.statusId ?? null,
      statusName: null,
      isDataNotAvailable: r.statusId === DataEntryStatusId.Not_Available,
      isMandatory: r.isMandatory,
      validRangeMin: r.validRangeMin != null ? Number(r.validRangeMin) : null,
      validRangeMax: r.validRangeMax != null ? Number(r.validRangeMax) : null,
      validPolarityName: null,
      comments: r.comments ? JSON.stringify(r.comments) : null,
      updatedByName: null,
      updatedByRole: null,
      updatedAt: r.updatedAt ? String(r.updatedAt) : null,
    };
  });

  const categoryMap = new Map<number, string>();
  const subcategoryMap = new Map<number, string>();
  for (const r of rawRows) {
    if (!categoryMap.has(r.categoryId))
      categoryMap.set(
        r.categoryId,
        categories.find((c) => c.id === r.categoryId)?.name ?? "Unknown",
      );
    if (!subcategoryMap.has(r.subcategoryId))
      subcategoryMap.set(
        r.subcategoryId,
        subcategories.find((c) => c.id === r.subcategoryId)?.name ?? "Unknown",
      );
  }
  for (const vr of viewRows) {
    const orig = rawRows.find((r) => r.measureId === vr.measureId);
    if (orig) {
      vr.categoryName = categoryMap.get(orig.categoryId) ?? null;
      vr.subcategoryName = subcategoryMap.get(orig.subcategoryId) ?? null;
    }
  }

  const completedCount = viewRows.filter(
    (r) => r.displayValue != null || r.isDataNotAvailable,
  ).length;

  const breakdownMap = new Map<string, MeasureEntryProgressBreakdownItem>();
  for (const row of viewRows) {
    const key = `${row.categoryName}:${row.subcategoryName}`;
    if (!breakdownMap.has(key)) {
      breakdownMap.set(key, {
        categoryName: row.categoryName ?? "Unknown",
        subcategoryName: row.subcategoryName ?? "Unknown",
        completedInputs: 0,
        totalInputs: 0,
      });
    }
    const item = breakdownMap.get(key)!;
    item.totalInputs++;
    if (row.displayValue != null || row.isDataNotAvailable) {
      item.completedInputs++;
    }
  }

  const applicableDimensions: string[] = [];
  const dimChecks: [string, number[]][] = [
    ["provider", viewRows.map((r) => r.energyProviderId)],
    ["category", viewRows.map((r) => r.energyTypeId)],
    ["technology", viewRows.map((r) => r.energySourceId)],
    ["customer_type", viewRows.map((r) => r.customerTypeId)],
    ["payment_mode", viewRows.map((r) => r.paymentModeId)],
    ["consumption_band", viewRows.map((r) => r.consumptionBandId)],
    ["division", viewRows.map((r) => r.divisionId)],
    ["gender", viewRows.map((r) => r.genderId)],
  ];
  for (const [dim, ids] of dimChecks) {
    const unique = new Set(ids.filter((id) => id !== 0));
    if (unique.size > 1) {
      applicableDimensions.push(dim);
    }
  }

  return {
    context: ctx,
    options: {
      reportPeriods: periods,
      measureCategories: categories,
      measureSubcategories: subcategories,
      dataEntryStatuses: statuses,
    },
    dimensions: {
      energyProviders,
      energyTypes,
      energySources,
      customerTypes,
      paymentModes,
      consumptionBands,
      divisions,
      genders,
    },
    progress: {
      completedInputs: completedCount,
      totalInputs: viewRows.length,
      breakdown: [...breakdownMap.values()],
    },
    rows: viewRows,
    applicableDimensions,
  };
}

export async function updateMeasureEntryValueAction(
  payload: UpdateMeasureEntryValuePayload,
) {
  "use server";
  const user = await getCurrentUser();

  const existing = payload.dataEntryId
    ? await db
        .select({ id: dataEntries.id })
        .from(dataEntries)
        .where(eq(dataEntries.id, payload.dataEntryId))
        .limit(1)
    : [];

  if (existing.length > 0 && payload.dataEntryId) {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedById: user.id,
      status_id: DataEntryStatusId.Entered,
    };
    if (payload.valueNumeric !== undefined) {
      updateData.value_numeric = String(payload.valueNumeric);
    }
    if (payload.valueBoolean !== undefined) {
      updateData.value_boolean = payload.valueBoolean;
    }
    if (payload.valueOptionId !== undefined) {
      updateData.value_option_id = payload.valueOptionId;
    }
    if (payload.valueString !== undefined) {
      updateData.value_text = payload.valueString;
    }
    await db
      .update(dataEntries)
      .set(updateData)
      .where(eq(dataEntries.id, payload.dataEntryId));
  } else {
    await db.insert(dataEntries).values({
      report_period_id: await getReportPeriodIdFromContext(),
      measure_def_id: payload.measureId,
      provider_id: payload.energyProviderId,
      category_id: payload.energyTypeId,
      technology_id: payload.energySourceId,
      asset_id: await getAllMemberId("Asset Class"),
      customer_type_id: payload.customerTypeId,
      payment_mode_id: payload.paymentModeId,
      consumption_band_id: payload.consumptionBandId,
      division_id: payload.divisionId,
      gender_id: payload.genderId,
      utility_function_id: await getAllMemberId("Utility Function"),
      unit_id: payload.unitId ?? null,
      status_id: DataEntryStatusId.Entered,
      is_relevant: true,
      is_deleted: false,
      updatedAt: new Date(),
      updatedById: user.id,
      ...(payload.valueNumeric !== undefined
        ? { value_numeric: String(payload.valueNumeric) }
        : {}),
      ...(payload.valueBoolean !== undefined
        ? { value_boolean: payload.valueBoolean }
        : {}),
      ...(payload.valueOptionId !== undefined
        ? { value_option_id: payload.valueOptionId }
        : {}),
      ...(payload.valueString !== undefined
        ? { value_text: payload.valueString }
        : {}),
    });
  }

  const reportPeriodId = await getReportPeriodIdFromContext();
  if (reportPeriodId > 0) {
    void upsertHoursInPeriod(reportPeriodId).catch((err) =>
      console.error("Failed to auto-calculate hours in period:", err),
    );
  }

  revalidatePath("/data-entry/enter-data");
}

export async function updateMeasureEntryAvailabilityAction(
  payload: UpdateMeasureEntryAvailabilityPayload,
) {
  "use server";
  const user = await getCurrentUser();

  const newStatus = payload.isDataNotAvailable
    ? DataEntryStatusId.Not_Available
    : DataEntryStatusId.Pending;

  if (payload.dataEntryId) {
    await db
      .update(dataEntries)
      .set({
        status_id: newStatus,
        updatedAt: new Date(),
        updatedById: user.id,
      })
      .where(eq(dataEntries.id, payload.dataEntryId));
  } else if (payload.isDataNotAvailable) {
    await db.insert(dataEntries).values({
      report_period_id: await getReportPeriodIdFromContext(),
      measure_def_id: payload.measureId,
      provider_id: payload.energyProviderId,
      category_id: payload.energyTypeId,
      technology_id: payload.energySourceId,
      asset_id: await getAllMemberId("Asset Class"),
      customer_type_id: payload.customerTypeId,
      payment_mode_id: payload.paymentModeId,
      consumption_band_id: payload.consumptionBandId,
      division_id: payload.divisionId,
      gender_id: payload.genderId,
      utility_function_id: await getAllMemberId("Utility Function"),
      unit_id: payload.unitId ?? null,
      status_id: DataEntryStatusId.Not_Available,
      is_relevant: true,
      is_deleted: false,
      updatedAt: new Date(),
      updatedById: user.id,
    });
  }

  const availPeriodId = await getReportPeriodIdFromContext();
  if (availPeriodId > 0) {
    void upsertHoursInPeriod(availPeriodId).catch((err) =>
      console.error("Failed to auto-calculate hours in period:", err),
    );
  }

  revalidatePath("/data-entry/enter-data");
}

export async function updateMeasureEntryCommentAction(
  payload: UpdateMeasureEntryCommentPayload,
) {
  "use server";
  const user = await getCurrentUser();
  const newComment: DataEntryComment = {
    comment: payload.comment,
    commenterId: user.id,
    commenterName: user.name ?? null,
    commenterRole: user.role,
    date: new Date(),
  };

  const existing = payload.dataEntryId
    ? await db
        .select({
          id: dataEntries.id,
          comments: dataEntries.comments,
        })
        .from(dataEntries)
        .where(eq(dataEntries.id, payload.dataEntryId))
        .limit(1)
    : [];

  if (existing.length > 0 && payload.dataEntryId) {
    const existingComments = (existing[0].comments ?? []) as DataEntryComment[];
    const updatedComments = [...existingComments, newComment];
    await db
      .update(dataEntries)
      .set({
        comments: updatedComments as unknown as DataEntryComment[],
        updatedAt: new Date(),
        updatedById: user.id,
      })
      .where(eq(dataEntries.id, payload.dataEntryId));
  } else {
    await db.insert(dataEntries).values({
      report_period_id: await getReportPeriodIdFromContext(),
      measure_def_id: payload.measureId,
      provider_id: payload.energyProviderId,
      category_id: payload.energyTypeId,
      technology_id: payload.energySourceId,
      asset_id: await getAllMemberId("Asset Class"),
      customer_type_id: payload.customerTypeId,
      payment_mode_id: payload.paymentModeId,
      consumption_band_id: payload.consumptionBandId,
      division_id: payload.divisionId,
      gender_id: payload.genderId,
      utility_function_id: await getAllMemberId("Utility Function"),
      unit_id: payload.unitId ?? null,
      status_id: DataEntryStatusId.Pending,
      comments: [newComment] as unknown as DataEntryComment[],
      is_relevant: true,
      is_deleted: false,
      updatedAt: new Date(),
      updatedById: user.id,
    });
  }

  revalidatePath("/data-entry/enter-data");
}

async function getReportPeriodIdFromContext(): Promise<number> {
  const ctx = await getFilterContextFromCookies();
  return ctx.reportPeriodId ?? 0;
}

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
