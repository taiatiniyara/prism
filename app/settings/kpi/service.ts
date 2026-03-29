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
import { and, asc, eq, gt, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface KpiFormulaInputOption {
  id: number;
  name: string;
  variable_name: string | null;
}

export interface KpiFormulaBuilderData {
  kpis: KpiDefinition[];
  inputs: KpiFormulaInputOption[];
  energyProviderOptions: ManagedDimensionOption[];
  energyTypeOptions: ManagedDimensionOption[];
  energySourceOptions: ManagedDimensionOption[];
}

export interface ManagedDimensionOption {
  id: number;
  name: string;
}

export interface KpiTypeOption {
  label: string;
  value: number;
}

export interface SaveKpiFormulaPayload {
  kpiId: number;
  formula: string;
  formulaInputs: FormulaInput[];
}

export async function GetAllKpiDefinitions(): Promise<KpiDefinition[]> {
  const managedListsItems = await db.select().from(managedListItems);
  const list = await db
    .select()
    .from(kpiDefinitions)
    .orderBy(asc(kpiDefinitions.name));

  return list.map((item) => {
    const i: KpiDefinition = {
      ...item,
      type: managedListsItems.find((m) => m.id === item.type_id)?.name || null,
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
  const list = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
      list: managedLists.name,
    })
    .from(managedListItems)
    .leftJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(ilike(managedLists.name, "%kpi%"))
    .orderBy(asc(managedListItems.name));

  return list.map((item) => ({
    label: `${item.list || "KPI"}: ${item.name}`,
    value: item.id,
  }));
}

export async function CreateKpiDefinition(
  data: Partial<KpiDefinition>,
): Promise<DataTableFormResponse<KpiDefinition>> {
  const [created] = await db
    .insert(kpiDefinitions)
    .values({
      name: String(data.name || "").trim(),
      description: data.description ? String(data.description) : null,
      type_id: Number(data.type_id),
      limit_lower: data.limit_lower ? String(data.limit_lower) : null,
      limit_upper: data.limit_upper ? String(data.limit_upper) : null,
      formula: data.formula ? String(data.formula) : "0",
      formula_inputs:
        Array.isArray(data.formula_inputs) && data.formula_inputs.length > 0
          ? data.formula_inputs
          : [],
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
  data: Partial<KpiDefinition>,
): Promise<DataTableFormResponse<KpiDefinition>> {
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
      type_id:
        typeof data.type_id === "undefined" ? undefined : Number(data.type_id),
      limit_lower:
        typeof data.limit_lower === "undefined"
          ? undefined
          : data.limit_lower
            ? String(data.limit_lower)
            : null,
      limit_upper:
        typeof data.limit_upper === "undefined"
          ? undefined
          : data.limit_upper
            ? String(data.limit_upper)
            : null,
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
      type: managedListsItems.find((m) => m.id === i.type_id)?.name || null,
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
    })
    .from(inputDefinitions)
    .where(
      and(
        eq(inputDefinitions.is_active, true),
        eq(inputDefinitions.is_kpi_input, true),
      ),
    )
    .orderBy(asc(inputDefinitions.name));

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
    inputs,
    energyProviderOptions: energyProviderRows,
    energyTypeOptions: energyTypeRows,
    energySourceOptions: energySourceRows,
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

export async function UpdateKpiDefinitionFromExcel(data: ExcelKpiDefinition[]) {
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
          type_id: item.kpi_type_id,
          is_currency: item.is_currency,
          is_descriptive: item.is_descriptive,
          is_active: item.is_active,
          formula: null,
          category_id: item.kpi_category_id,
          subcategory_id: item.kpi_subcategory_id,
          limit_upper: "100",
          limit_lower: "0",
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
}
