"use server";

import { DataTableFormResponse } from "@/components/tables/data-table-create-form";
import { db } from "@/db/connection";
import { FormulaInput, inputDefinitions } from "@/db/schema/dataEntry";
import {
  KpiDefinition,
  kpiDefinitions,
  NewKpiDefinition,
} from "@/db/schema/kpi";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { and, asc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CurrentUser, getCurrentUser } from "@/lib/user.service";

export interface KpiFormulaInputOption {
  id: number;
  name: string;
  variable_name: string | null;
  unit: string | null;
  actualSamples: KpiFormulaInputActualSample[];
}

export interface KpiFormulaInputActualSample {
  inputDefId: number;
  energyProviderId: number | null;
  energyTypeId: number | null;
  energySourceId: number | null;
  value: number;
}

export interface KpiFormulaBuilderData {
  kpis: KpiDefinition[];
  inputs: KpiFormulaInputOption[];
  energyProviderOptions: ManagedDimensionOption[];
  energyTypeOptions: ManagedDimensionOption[];
  energySourceOptions: ManagedDimensionOption[];
  previewContextLabel: string | null;
}

export interface ManagedDimensionOption {
  id: number;
  name: string;
}

export interface KpiTypeOption {
  label: string;
  value: "benchmarking" | "custom";
}

export interface SaveKpiFormulaPayload {
  kpiId: number;
  formula: string;
  formulaInputs: FormulaInput[];
}

type KpiDefinitionWritePayload = Partial<KpiDefinition> & {
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

const isGlobalRole = (role: string) => role === "DEV" || role === "BMO";

const canSetKpiLimits = (role: string) => isDevRole(role);

const canSetKpiTargets = (user: CurrentUser) => {
  return !isGlobalRole(user.role) && user.org_id != null;
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
  if (!isGlobalRole(user.role)) {
    return "custom";
  }

  return normalizeKpiType(value);
};

const getKpiVisibilityFilter = (user: CurrentUser) => {
  if (isGlobalRole(user.role)) {
    return null;
  }

  if (user.org_id == null) {
    return sql`1 = 0`;
  }

  return or(
    eq(kpiDefinitions.owner_utility_id, user.org_id),
    sql`coalesce(${kpiDefinitions.utilities}::jsonb, '[]'::jsonb) @> ${JSON.stringify([user.org_id])}::jsonb`,
  );
};

export async function GetAllKpiDefinitions(): Promise<KpiDefinition[]> {
  const currentUser = await getCurrentUser();
  const visibilityFilter = getKpiVisibilityFilter(currentUser);
  const managedListsItems = await db.select().from(managedListItems);
  const list = await (
    visibilityFilter
      ? db.select().from(kpiDefinitions).where(visibilityFilter)
      : db.select().from(kpiDefinitions)
  ).orderBy(asc(kpiDefinitions.name));

  return list.map((item) => {
    const i: KpiDefinition = {
      ...item,
      agg_level:
        managedListsItems.find((m) => m.id === item.agg_level_id)?.name || null,
      category:
        managedListsItems.find((m) => m.id === item.category_id)?.name || null,
      subcategory:
        managedListsItems.find((m) => m.id === item.subcategory_id)?.name ||
        null,
      unit: managedListsItems.find((m) => m.id === item.unit_id)?.name || null,
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

  if (!isGlobalRole(currentUser.role) && currentUser.org_id == null) {
    return {
      success: false,
      message: "Your account is not scoped to a utility.",
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
    !isGlobalRole(currentUser.role) && currentUser.org_id != null
      ? {
          owner_utility_id: currentUser.org_id,
          utilities: [currentUser.org_id],
        }
      : {};

  const [created] = await db
    .insert(kpiDefinitions)
    .values({
      name: String(data.name || "").trim(),
      description: data.description ? String(data.description) : null,
      type: resolveCreateKpiType(currentUser, data.type),
      limits: canSetKpiLimits(currentUser.role)
        ? (resolveLimitsPayload(data) ?? null)
        : null,
      formula: data.formula ? String(data.formula) : "0",
      formula_inputs:
        Array.isArray(data.formula_inputs) && data.formula_inputs.length > 0
          ? data.formula_inputs
          : [],
      ...utilityOwnershipFields,
    })
    .returning();

  revalidatePath("/settings/kpi");
  return {
    success: true,
    message: "KPI definition created successfully.",
    data: created,
  };
}

export async function UpdateKpiDefinition(
  data: KpiDefinitionWritePayload,
): Promise<DataTableFormResponse<KpiDefinition>> {
  const currentUser = await getCurrentUser();

  if (!canSetKpiLimits(currentUser.role) && hasLimitValuesInPayload(data)) {
    return {
      success: false,
      message:
        "Only DEV users can set KPI upper and lower limits for selected years or months.",
    };
  }

  const [updated] = await db
    .update(kpiDefinitions)
    .set({
      name: data.name ? String(data.name).trim() : undefined,
      description:
        typeof data.description === "undefined"
          ? undefined
          : data.description
            ? String(data.description)
            : null,
      type:
        typeof data.type === "undefined"
          ? undefined
          : normalizeKpiType(data.type),
      limits: !canSetKpiLimits(currentUser.role)
        ? undefined
        : resolveLimitsPayload(data),
    })
    .where(eq(kpiDefinitions.id, Number(data.id)))
    .returning();

  revalidatePath("/settings/kpi");
  return {
    success: true,
    message: "KPI definition updated successfully.",
    data: updated,
  };
}

export async function GetKpiFormulaBuilderData(): Promise<KpiFormulaBuilderData> {
  const managedListsItems = await db.select().from(managedListItems);
  const kpis = (
    await db.select().from(kpiDefinitions).orderBy(asc(kpiDefinitions.name))
  ).map((i) => {
    const kpi: KpiDefinition = {
      ...i,
      agg_level:
        managedListsItems.find((m) => m.id === i.agg_level_id)?.name || null,
      category:
        managedListsItems.find((m) => m.id === i.category_id)?.name || null,
      subcategory:
        managedListsItems.find((m) => m.id === i.subcategory_id)?.name || null,
      unit: managedListsItems.find((m) => m.id === i.unit_id)?.name || null,
    };
    return kpi;
  });

  const inputs = await db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      variable_name: inputDefinitions.variable_name,
      unitId: inputDefinitions.unit_id,
    })
    .from(inputDefinitions)
    .where(
      and(
        eq(inputDefinitions.is_active, true),
        eq(inputDefinitions.is_kpi_input, true),
      ),
    )
    .orderBy(asc(inputDefinitions.name));

  const previewContextLabel = "Preview uses dummy values.";

  const formulaInputs: KpiFormulaInputOption[] = inputs.map((item) => ({
    id: item.id,
    name: item.name,
    variable_name: item.variable_name,
    unit: managedListsItems.find((m) => m.id === item.unitId)?.name || null,
    actualSamples: [],
  }));

  const energyProviderRows = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
    })
    .from(managedListItems)
    .leftJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedListItems.is_active, true),
        or(
          ilike(managedLists.name, "%energy provider%"),
          ilike(managedLists.name, "%energy providers%"),
        ),
      ),
    )
    .orderBy(asc(managedListItems.name));

  const energySourceRows = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
    })
    .from(managedListItems)
    .leftJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedListItems.is_active, true),
        or(
          ilike(managedLists.name, "%energy source%"),
          ilike(managedLists.name, "%energy sources%"),
        ),
      ),
    )
    .orderBy(asc(managedListItems.name));

  const energyTypeRows = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
    })
    .from(managedListItems)
    .leftJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedListItems.is_active, true),
        or(
          ilike(managedLists.name, "%energy type%"),
          ilike(managedLists.name, "%energy types%"),
        ),
      ),
    )
    .orderBy(asc(managedListItems.name));

  return {
    kpis,
    inputs: formulaInputs,
    energyProviderOptions: energyProviderRows,
    energyTypeOptions: energyTypeRows,
    energySourceOptions: energySourceRows,
    previewContextLabel,
  };
}

export async function SaveKpiFormula(payload: SaveKpiFormulaPayload) {
  const formula = payload.formula.trim();
  if (!payload.kpiId || Number.isNaN(payload.kpiId)) {
    return { success: false, message: "Please choose a KPI first." };
  }
  if (!formula) {
    return { success: false, message: "Formula is required." };
  }

  await db
    .update(kpiDefinitions)
    .set({
      formula,
      formula_inputs: payload.formulaInputs,
    })
    .where(eq(kpiDefinitions.id, payload.kpiId));

  revalidatePath("/settings/kpi");
  return { success: true, message: "KPI formula saved successfully." };
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

interface ExcelKpiDefinition {
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
          agg_level_id: item.kpi_agglevel_id,
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
