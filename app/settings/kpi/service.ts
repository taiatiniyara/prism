"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import {
  KpiDefinition,
  kpiDefinitions,
  NewKpiDefinition,
} from "@/db/schema/kpi";
import { organisations } from "@/db/schema/utility";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { and, asc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  CurrentUser,
  getCurrentUser,
  hasGlobalUtilityAccess,
} from "@/lib/user.service";
import {
  buildManagedListNameMap,
  resolveManagedListName,
} from "@/lib/managed-list-utils";

export interface KpiTypeOption {
  label: string;
  value: "benchmarking" | "custom";
}

type KpiDefinitionWritePayload = Partial<KpiDefinition> & {
  category_id?: string | number | null;
  subcategory_id?: string | number | null;
  unit_id?: string | number | null;
  strata_id?: string | number | null;
  block?: string | number | null;
  limit_lower?: string | number | null;
  limit_upper?: string | number | null;
  limits?: unknown;
};

interface KpiLimit {
  lower: number | null;
  upper: number | null;
  year: number;
  month?: number | null;
}

interface KpiTargetValue {
  utility_id: number;
  year: number;
  month?: number | null;
  target_value: string;
}

export interface SaveKpiLimitsPayload {
  kpiId: number;
  limits: KpiLimit[];
}

export interface SaveKpiTargetsPayload {
  kpiId: number;
  targets: Array<{
    year: number;
    month?: number | null;
    target_value: string;
  }>;
}

const normalizeKpiType = (value: unknown): "benchmarking" | "custom" => {
  return value === "custom" ? "custom" : "benchmarking";
};

const mapLegacyKpiTypeId = (
  value: number | null | undefined,
): "benchmarking" | "custom" => {
  return value === 2 ? "custom" : "benchmarking";
};

const isDevRole = (role: string) => role === "DEV";

const isGlobalRole = (user: CurrentUser) => hasGlobalUtilityAccess(user);

const canSetKpiLimits = (role: string) => isDevRole(role);

const canSetKpiTargets = (user: CurrentUser) => {
  return !isGlobalRole(user) && user.org_id != null;
};

const hasLimitValuesInPayload = (data: KpiDefinitionWritePayload): boolean => {
  return (
    typeof data.limit_lower !== "undefined" ||
    typeof data.limit_upper !== "undefined" ||
    typeof data.limits !== "undefined"
  );
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || typeof value === "undefined" || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const isLimitEntry = (value: unknown): value is KpiLimit => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.year !== "number" || !Number.isFinite(candidate.year)) {
    return false;
  }

  const lowerValid =
    candidate.lower === null ||
    typeof candidate.lower === "number" ||
    typeof candidate.lower === "undefined";
  const upperValid =
    candidate.upper === null ||
    typeof candidate.upper === "number" ||
    typeof candidate.upper === "undefined";
  const monthValid =
    candidate.month === null ||
    typeof candidate.month === "number" ||
    typeof candidate.month === "undefined";

  return lowerValid && upperValid && monthValid;
};

const resolveLimitsPayload = (
  data: KpiDefinitionWritePayload,
): KpiLimit[] | null | undefined => {
  if (Array.isArray(data.limits)) {
    const normalized = data.limits.filter(isLimitEntry).map((item) => ({
      year: item.year,
      month: typeof item.month === "number" ? item.month : null,
      lower: toNullableNumber(item.lower),
      upper: toNullableNumber(item.upper),
    }));
    return normalized;
  }

  if (typeof data.limits !== "undefined") {
    return null;
  }

  if (
    typeof data.limit_lower === "undefined" &&
    typeof data.limit_upper === "undefined"
  ) {
    return undefined;
  }

  return [
    {
      year: new Date().getFullYear(),
      month: null,
      lower: toNullableNumber(data.limit_lower),
      upper: toNullableNumber(data.limit_upper),
    },
  ];
};

const resolveCreateKpiType = (
  user: CurrentUser,
  value: unknown,
): "benchmarking" | "custom" => {
  if (!isGlobalRole(user)) {
    return "custom";
  }

  return normalizeKpiType(value);
};

const getKpiVisibilityFilter = (user: CurrentUser) => {
  if (isGlobalRole(user)) {
    return null;
  }

  if (user.org_id == null) {
    return sql`1 = 0`;
  }

  const sharedVisibility = or(
    eq(kpiDefinitions.owner_utility_id, user.org_id),
    sql`coalesce(${kpiDefinitions.utility_ids}::jsonb, '[]'::jsonb) @> ${JSON.stringify([user.org_id])}::jsonb`,
  );

  return or(
    and(
      eq(kpiDefinitions.is_private, true),
      eq(kpiDefinitions.owner_utility_id, user.org_id),
    ),
    and(eq(kpiDefinitions.is_private, false), sharedVisibility),
  );
};

const syncKpiDefinitionIdSequence = async () => {
  await db.execute(sql`
    select setval(
      pg_get_serial_sequence('kpi_definitions', 'id'),
      coalesce((select max(id) from kpi_definitions), 1),
      true
    )
  `);
};

export async function GetAllKpiDefinitions(): Promise<KpiDefinition[]> {
  const currentUser = await getCurrentUser();
  const visibilityFilter = getKpiVisibilityFilter(currentUser);
  const managedListsItems = await db.select().from(managedListItems);
  const managedListNamesById = buildManagedListNameMap(managedListsItems);
  const list = await (
    visibilityFilter
      ? db.select().from(kpiDefinitions).where(visibilityFilter)
      : db.select().from(kpiDefinitions)
  ).orderBy(asc(kpiDefinitions.name));

  return list.map((item) => {
    const i: KpiDefinition = {
      ...item,
      strata: resolveManagedListName(
        managedListNamesById,
        item.strata_id,
        null,
      ),
      category: resolveManagedListName(
        managedListNamesById,
        item.category_id,
        null,
      ),
      subcategory: resolveManagedListName(
        managedListNamesById,
        item.subcategory_id,
        null,
      ),
      unit: resolveManagedListName(managedListNamesById, item.unit_id, null),
    };
    return i;
  });
}

export async function GetKpiTypeOptions(): Promise<KpiTypeOption[]> {
  return [
    { label: "Benchmarking", value: "benchmarking" },
    { label: "Custom", value: "custom" },
  ];
}

export async function CreateKpiDefinition(
  data: KpiDefinitionWritePayload,
): Promise<DataTableFormResponse<KpiDefinition>> {
  const currentUser = await getCurrentUser();
  const name = String(data.name || "").trim();

  if (!name) {
    return {
      success: false,
      message: "KPI name is required.",
    };
  }

  const unitId = toOptionalNumber(data.unit_id);
  const categoryId = toOptionalNumber(data.category_id);
  const subcategoryId = toOptionalNumber(data.subcategory_id);
  const strataId = toOptionalNumber(data.strata_id);
  const block = toOptionalNumber(data.block);

  const hasInvalidManagedListValue =
    Number.isNaN(unitId) ||
    Number.isNaN(categoryId) ||
    Number.isNaN(subcategoryId) ||
    Number.isNaN(strataId);

  if (hasInvalidManagedListValue) {
    return {
      success: false,
      message: "Please select valid KPI managed-list values.",
    };
  }

  if (
    typeof unitId === "undefined" ||
    typeof categoryId === "undefined" ||
    typeof subcategoryId === "undefined" ||
    typeof strataId === "undefined"
  ) {
    return {
      success: false,
      message:
        "Please select KPI category, KPI subcategory, unit, and aggregation level.",
    };
  }

  if (Number.isNaN(block)) {
    return {
      success: false,
      message: "Please provide a valid KPI block value.",
    };
  }

  if (typeof block === "number" && (block < 1 || block > 9999)) {
    return {
      success: false,
      message: "KPI block must be between 1 and 9999.",
    };
  }

  const existingByName = await db
    .select({ id: kpiDefinitions.id })
    .from(kpiDefinitions)
    .where(ilike(kpiDefinitions.name, name))
    .limit(1);

  if (existingByName.length > 0) {
    return {
      success: false,
      message: "A KPI definition with this name already exists.",
    };
  }

  if (!isGlobalRole(currentUser) && currentUser.org_id == null) {
    return {
      success: false,
      message: "Your account is not scoped to a utility.",
    };
  }

  if (!isGlobalRole(currentUser) && currentUser.org_id != null) {
    const [organisation] = await db
      .select({ id: organisations.id })
      .from(organisations)
      .where(eq(organisations.id, currentUser.org_id))
      .limit(1);

    if (!organisation) {
      return {
        success: false,
        message:
          "Your assigned utility no longer exists. Please contact an administrator to update your profile.",
      };
    }
  }

  const managedListIds = [unitId, categoryId, subcategoryId, strataId];
  const existingManagedListIds = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .where(
      or(
        eq(managedListItems.id, managedListIds[0]),
        eq(managedListItems.id, managedListIds[1]),
        eq(managedListItems.id, managedListIds[2]),
        eq(managedListItems.id, managedListIds[3]),
      ),
    );

  if (existingManagedListIds.length !== 4) {
    return {
      success: false,
      message:
        "One or more selected managed-list values are no longer valid. Please re-select the KPI category, subcategory, unit, and aggregation level.",
    };
  }

  if (!canSetKpiLimits(currentUser.role) && hasLimitValuesInPayload(data)) {
    return {
      success: false,
      message:
        "Only DEV users can set KPI upper and lower limits for selected years or months.",
    };
  }

  const utilityOwnershipFields =
    !isGlobalRole(currentUser) && currentUser.org_id != null
      ? {
          owner_utility_id: currentUser.org_id,
        }
      : {};

  const insertPayload = {
    name,
    description: data.description ? String(data.description).trim() : null,
    unit_id: unitId,
    category_id: categoryId,
    subcategory_id: subcategoryId,
    strata_id: strataId,
    block: block ?? undefined,
    type: resolveCreateKpiType(currentUser, data.type),
    is_kpi_input: false,
    limits: null,
    formula: null,
    formula_inputs: null,
    ...utilityOwnershipFields,
  };

  const insertKpiDefinition = async () => {
    return db.insert(kpiDefinitions).values(insertPayload).returning();
  };

  try {
    const [created] = await insertKpiDefinition();

    revalidatePath("/settings/kpi");
    return {
      success: true,
      message: "KPI definition created successfully.",
      data: created,
    };
  } catch (error) {
    const baseError =
      typeof error === "object" && error !== null
        ? (error as Record<string, unknown>)
        : null;
    const nestedCause =
      baseError &&
      typeof baseError.cause === "object" &&
      baseError.cause !== null
        ? (baseError.cause as Record<string, unknown>)
        : null;

    const pick = (key: string): string | null => {
      const fromBase = baseError?.[key];
      if (typeof fromBase === "string" && fromBase.length > 0) {
        return fromBase;
      }

      const fromCause = nestedCause?.[key];
      if (typeof fromCause === "string" && fromCause.length > 0) {
        return fromCause;
      }

      return null;
    };

    const code = pick("code");
    const detail = pick("detail");
    const constraint = pick("constraint");
    const column = pick("column");
    const baseMessage =
      pick("message") ||
      (error instanceof Error ? error.message : String(error));

    if (code === "23505" && constraint === "kpi_definitions_pkey") {
      try {
        await syncKpiDefinitionIdSequence();
        const [created] = await insertKpiDefinition();

        revalidatePath("/settings/kpi");
        return {
          success: true,
          message: "KPI definition created successfully.",
          data: created,
        };
      } catch (retryError) {
        console.error(
          "[KPI settings] CreateKpiDefinition retry after sequence sync failed",
          {
            retryError,
          },
        );
      }
    }

    const contextParts = [
      code ? `code=${code}` : null,
      constraint ? `constraint=${constraint}` : null,
      column ? `column=${column}` : null,
      detail,
    ].filter((part): part is string => !!part);

    console.error("[KPI settings] CreateKpiDefinition failed", {
      role: currentUser.role,
      orgId: currentUser.org_id,
      payload: {
        name,
        unitId,
        categoryId,
        subcategoryId,
        strataId,
        block,
        type: resolveCreateKpiType(currentUser, data.type),
      },
      db: {
        code,
        constraint,
        column,
        detail,
      },
      error,
    });

    return {
      success: false,
      message: `Unable to create KPI definition. ${[baseMessage, ...contextParts].join(" | ")}`,
    };
  }
}

export async function UpdateKpiDefinition(
  data: KpiDefinitionWritePayload,
): Promise<DataTableFormResponse<KpiDefinition>> {
  const currentUser = await getCurrentUser();
  const id = Number(data.id);

  if (Number.isNaN(id)) {
    return {
      success: false,
      message: "Invalid KPI definition id.",
    };
  }

  const unitId = toOptionalNumber(data.unit_id);
  const categoryId = toOptionalNumber(data.category_id);
  const subcategoryId = toOptionalNumber(data.subcategory_id);
  const strataId = toOptionalNumber(data.strata_id);
  const block = toOptionalNumber(data.block);

  const hasInvalidManagedListValue =
    Number.isNaN(unitId) ||
    Number.isNaN(categoryId) ||
    Number.isNaN(subcategoryId) ||
    Number.isNaN(strataId);

  if (hasInvalidManagedListValue) {
    return {
      success: false,
      message: "Please select valid KPI managed-list values.",
    };
  }

  if (Number.isNaN(block)) {
    return {
      success: false,
      message: "Please provide a valid KPI block value.",
    };
  }

  const typePatch =
    typeof data.type === "undefined"
      ? undefined
      : isGlobalRole(currentUser)
        ? normalizeKpiType(data.type)
        : "custom";

  if (!canSetKpiLimits(currentUser.role) && hasLimitValuesInPayload(data)) {
    return {
      success: false,
      message:
        "Only DEV users can set KPI upper and lower limits for selected years or months.",
    };
  }

  try {
    const [updated] = await db
      .update(kpiDefinitions)
      .set({
        name: data.name ? String(data.name).trim() : undefined,
        description:
          typeof data.description === "undefined"
            ? undefined
            : data.description
              ? String(data.description).trim()
              : null,
        unit_id: unitId,
        category_id: categoryId,
        subcategory_id: subcategoryId,
        strata_id: strataId,
        block,
        type: typePatch,
        limits: !canSetKpiLimits(currentUser.role)
          ? undefined
          : resolveLimitsPayload(data),
      })
      .where(eq(kpiDefinitions.id, id))
      .returning();

    revalidatePath("/settings/kpi");
    return {
      success: true,
      message: "KPI definition updated successfully.",
      data: updated,
    };
  } catch (error) {
    const baseError =
      typeof error === "object" && error !== null
        ? (error as Record<string, unknown>)
        : null;
    const nestedCause =
      baseError &&
      typeof baseError.cause === "object" &&
      baseError.cause !== null
        ? (baseError.cause as Record<string, unknown>)
        : null;

    const pick = (key: string): string | null => {
      const fromBase = baseError?.[key];
      if (typeof fromBase === "string" && fromBase.length > 0) {
        return fromBase;
      }

      const fromCause = nestedCause?.[key];
      if (typeof fromCause === "string" && fromCause.length > 0) {
        return fromCause;
      }

      return null;
    };

    const code = pick("code");
    const detail = pick("detail");
    const constraint = pick("constraint");
    const column = pick("column");
    const baseMessage =
      pick("message") ||
      (error instanceof Error ? error.message : String(error));

    console.error("[KPI settings] UpdateKpiDefinition failed", {
      role: currentUser.role,
      orgId: currentUser.org_id,
      payload: {
        id,
        name: data.name,
        unitId,
        categoryId,
        subcategoryId,
        strataId,
        block,
        type: typePatch,
      },
      db: {
        code,
        constraint,
        column,
        detail,
      },
      error,
    });

    const contextParts = [
      code ? `code=${code}` : null,
      constraint ? `constraint=${constraint}` : null,
      column ? `column=${column}` : null,
      detail,
    ].filter((part): part is string => !!part);

    return {
      success: false,
      message: `Unable to update KPI definition. ${[baseMessage, ...contextParts].join(" | ")}`,
    };
  }
}

export async function SaveKpiLimits(
  payload: SaveKpiLimitsPayload,
): Promise<DataTableFormResponse<KpiDefinition>> {
  const currentUser = await getCurrentUser();

  if (!canSetKpiLimits(currentUser.role)) {
    return {
      success: false,
      message:
        "Only DEV users can set KPI upper and lower limits for selected years or months.",
    };
  }

  if (!payload.kpiId || Number.isNaN(payload.kpiId)) {
    return {
      success: false,
      message: "Please select a KPI.",
    };
  }

  const sanitizedLimits = (payload.limits ?? [])
    .filter((item) => Number.isFinite(item.year))
    .map((item) => ({
      year: Number(item.year),
      month:
        item.month === null || typeof item.month === "undefined"
          ? null
          : Number(item.month),
      lower: toNullableNumber(item.lower),
      upper: toNullableNumber(item.upper),
    }))
    .sort((a, b) => {
      if (a.year !== b.year) {
        return a.year - b.year;
      }
      return (a.month ?? 0) - (b.month ?? 0);
    });

  await db
    .update(kpiDefinitions)
    .set({
      limits: sanitizedLimits,
    })
    .where(eq(kpiDefinitions.id, Number(payload.kpiId)));

  const [updated] = await db
    .select()
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.id, Number(payload.kpiId)))
    .limit(1);

  revalidatePath("/settings/kpi");
  return {
    success: true,
    message: "KPI limits saved successfully.",
    data: updated,
  };
}

export interface KpiTargetsFilterOption {
  id: number;
  name: string;
  parent_id: number | null;
}

export interface KpiTargetsFilterOptions {
  categories: KpiTargetsFilterOption[];
  subcategories: KpiTargetsFilterOption[];
}

export async function GetKpiTargetsFilterOptions(): Promise<KpiTargetsFilterOptions> {
  const [listIdByName, kpiCategoryIdRows, kpiSubcategoryIdRows] =
    await Promise.all([
      (async () => {
        const listRows = await db
          .select({ id: managedLists.id, name: managedLists.name })
          .from(managedLists)
          .where(
            and(
              eq(managedLists.is_active, true),
              sql`${managedLists.name} in ('KPI Category', 'KPI Sub-Category')`,
            ),
          );
        const map = new Map<string, number>();
        for (const row of listRows) {
          map.set(row.name, row.id);
        }
        return map;
      })(),
      db
        .select({ id: kpiDefinitions.category_id })
        .from(kpiDefinitions)
        .where(
          and(
            eq(kpiDefinitions.is_active, true),
            sql`${kpiDefinitions.category_id} is not null`,
          ),
        )
        .groupBy(kpiDefinitions.category_id),
      db
        .select({ id: kpiDefinitions.subcategory_id })
        .from(kpiDefinitions)
        .where(
          and(
            eq(kpiDefinitions.is_active, true),
            sql`${kpiDefinitions.subcategory_id} is not null`,
          ),
        )
        .groupBy(kpiDefinitions.subcategory_id),
    ]);

  const categoryListId = listIdByName.get("KPI Category") ?? null;
  const subcategoryListId = listIdByName.get("KPI Sub-Category") ?? null;

  const [categoryRows, subcategoryRows] = await Promise.all([
    categoryListId != null
      ? db
          .select({ id: managedListItems.id, name: managedListItems.name })
          .from(managedListItems)
          .where(
            and(
              eq(managedListItems.list_id, categoryListId),
              eq(managedListItems.is_active, true),
            ),
          )
          .orderBy(asc(managedListItems.name))
      : Promise.resolve([]),
    subcategoryListId != null
      ? db
          .select({
            id: managedListItems.id,
            name: managedListItems.name,
            parentId: managedListItems.parent_id,
          })
          .from(managedListItems)
          .where(
            and(
              eq(managedListItems.list_id, subcategoryListId),
              eq(managedListItems.is_active, true),
            ),
          )
          .orderBy(asc(managedListItems.name))
      : Promise.resolve([]),
  ]);

  const distinctKpiCategoryIds = [
    ...new Set(
      kpiCategoryIdRows
        .map((row) => row.id)
        .filter((id): id is number => id != null),
    ),
  ];
  const distinctKpiSubcategoryIds = [
    ...new Set(
      kpiSubcategoryIdRows
        .map((row) => row.id)
        .filter((id): id is number => id != null),
    ),
  ];

  const missingCategoryIds = distinctKpiCategoryIds.filter(
    (id) => !categoryRows.some((row) => row.id === id),
  );
  const missingSubcategoryIds = distinctKpiSubcategoryIds.filter(
    (id) => !subcategoryRows.some((row) => row.id === id),
  );

  const [missingCategoryRows, missingSubcategoryRows] = await Promise.all([
    missingCategoryIds.length > 0
      ? db
          .select({ id: managedListItems.id, name: managedListItems.name })
          .from(managedListItems)
          .where(inArray(managedListItems.id, missingCategoryIds))
      : Promise.resolve([]),
    missingSubcategoryIds.length > 0
      ? db
          .select({
            id: managedListItems.id,
            name: managedListItems.name,
            parentId: managedListItems.parent_id,
          })
          .from(managedListItems)
          .where(inArray(managedListItems.id, missingSubcategoryIds))
      : Promise.resolve([]),
  ]);

  const allCategories: KpiTargetsFilterOption[] = [
    ...categoryRows.map((row) => ({
      id: row.id,
      name: row.name,
      parent_id: null as number | null,
    })),
    ...missingCategoryRows.map((row) => ({
      id: row.id,
      name: row.name,
      parent_id: null as number | null,
    })),
    ...missingCategoryIds
      .filter((id) => !missingCategoryRows.some((row) => row.id === id))
      .map((id) => ({
        id,
        name: `Category #${id}`,
        parent_id: null as number | null,
      })),
  ];

  const existingSubcategoryIds = new Set(subcategoryRows.map((row) => row.id));

  const allSubcategories: KpiTargetsFilterOption[] = [
    ...subcategoryRows.map((row) => ({
      id: row.id,
      name: row.name,
      parent_id: row.parentId,
    })),
    ...missingSubcategoryRows.map((row) => ({
      id: row.id,
      name: row.name,
      parent_id: row.parentId,
    })),
    ...missingSubcategoryIds
      .filter(
        (id) =>
          !existingSubcategoryIds.has(id) &&
          !missingSubcategoryRows.some((row) => row.id === id),
      )
      .map((id) => ({
        id,
        name: `Subcategory #${id}`,
        parent_id: null as number | null,
      })),
  ];

  return {
    categories: allCategories.sort((a, b) => a.name.localeCompare(b.name)),
    subcategories: allSubcategories.sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  };
}

export async function SaveKpiTargets(
  payload: SaveKpiTargetsPayload,
): Promise<DataTableFormResponse<KpiDefinition>> {
  const currentUser = await getCurrentUser();

  if (!canSetKpiTargets(currentUser)) {
    return {
      success: false,
      message: "Only utility users can set KPI targets from this page.",
    };
  }

  if (!payload.kpiId || Number.isNaN(payload.kpiId)) {
    return {
      success: false,
      message: "Please select a KPI.",
    };
  }

  const [existing] = await db
    .select({
      id: kpiDefinitions.id,
      targets: kpiDefinitions.targets,
    })
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.id, Number(payload.kpiId)))
    .limit(1);

  if (!existing) {
    return {
      success: false,
      message: "KPI definition not found.",
    };
  }

  const utilityId = currentUser.org_id!;

  const sanitizedTargets = (payload.targets ?? [])
    .map((item) => ({
      year: Number(item.year),
      month:
        item.month == null || typeof item.month === "undefined"
          ? null
          : Number(item.month),
      target_value: String(item.target_value ?? "").trim(),
    }))
    .filter(
      (item) =>
        Number.isInteger(item.year) &&
        item.year >= 1900 &&
        item.year <= 3000 &&
        (item.month == null ||
          (Number.isInteger(item.month) &&
            item.month >= 1 &&
            item.month <= 12)) &&
        item.target_value.length > 0,
    )
    .sort((a, b) => {
      if (a.year !== b.year) {
        return a.year - b.year;
      }

      return (a.month ?? 0) - (b.month ?? 0);
    });

  const byYearMonth = new Map<string, KpiTargetValue>();
  for (const target of sanitizedTargets) {
    const key = `${target.year}-${target.month ?? "fy"}`;
    byYearMonth.set(key, {
      utility_id: utilityId,
      year: target.year,
      month: target.month,
      target_value: target.target_value,
    });
  }

  const existingOtherUtilityTargets = (existing.targets ?? []).filter(
    (target) => target.utility_id !== utilityId,
  );

  const nextTargets = [...existingOtherUtilityTargets, ...byYearMonth.values()];

  await db
    .update(kpiDefinitions)
    .set({
      targets: nextTargets,
    })
    .where(eq(kpiDefinitions.id, Number(payload.kpiId)));

  const [updated] = await db
    .select()
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.id, Number(payload.kpiId)))
    .limit(1);

  revalidatePath("/settings/kpi");
  revalidatePath("/data-entry/review-kpi");
  return {
    success: true,
    message: "KPI targets saved successfully.",
    data: updated,
  };
}

export interface ExcelKpiDefinition {
  source_id: number;
  formula: string;
  kpi_category_id: number;
  kpi_subcategory_id: number;
  kpi_name: string;
  kpi_unit_id: number;
  kpi_block: number;
  kpi_agglevel_id: number;
  is_kpi_input: boolean;
  kpi_type_id: number;
  is_currency: boolean;
  is_descriptive: boolean;
  is_active: boolean;
}

export async function UpdateKpiDefinitionFromExcel(
  data: ExcelKpiDefinition[],
): Promise<DataTableFormResponse<KpiDefinition>> {
  const currentUser = await getCurrentUser();

  if (!isDevRole(currentUser.role)) {
    return {
      success: false,
      message: "Only DEV users can upload KPI definitions from Excel.",
    };
  }

  db.delete(kpiDefinitions)
    .where(gt(kpiDefinitions.id, 0))
    .then(async () => {
      const list: NewKpiDefinition[] = data.map((item) => {
        return {
          id: item.source_id,
          name: item.kpi_name,
          description: item.kpi_name,
          unit_id: item.kpi_unit_id,
          strata_id: item.kpi_agglevel_id,
          is_kpi_input: item.is_kpi_input,
          type: mapLegacyKpiTypeId(item.kpi_type_id),
          is_currency: item.is_currency,
          is_descriptive: item.is_descriptive,
          is_active: item.is_active,
          formula: null,
          category_id: item.kpi_category_id,
          subcategory_id: item.kpi_subcategory_id,
          limits: [
            {
              year: new Date().getFullYear(),
              month: null,
              upper: 100,
              lower: 0,
            },
          ],
          block: item.kpi_block || null,
          formula_inputs: null,
          is_aggregated: false,
          utilities: null,
          owner_utility_id: null,
        };
      });

      await db.insert(kpiDefinitions).values(list);
    });

  revalidatePath("/settings/kpi");

  return {
    success: true,
    message: "KPI definitions uploaded successfully.",
  };
}
