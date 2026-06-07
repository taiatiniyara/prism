import { db } from "@/db/connection";
import { inputDefinitions } from "@/db/schema/dataEntry";
import {
  managedListItems,
} from "@/db/schema/managedLists";
import { aliasedTable, and, asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { assertMigrationKey } from "../prism-training/_lib";

function parseOptionalInt(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export async function GET(request: NextRequest) {
  try {
    assertMigrationKey(request);
    const searchParams = request.nextUrl.searchParams;
    const limit = parseOptionalInt(searchParams.get("limit"));
    const offset = parseOptionalInt(searchParams.get("offset")) ?? 0;
    const includeInactive = searchParams.get("includeInactive") === "true";

    const catAlias = aliasedTable(managedListItems, "cat");
    const subAlias = aliasedTable(managedListItems, "sub");
    const unitAlias = aliasedTable(managedListItems, "unit");
    const dataTypeAlias = aliasedTable(managedListItems, "data_type");

    const conditions = [];
    if (!includeInactive) {
      conditions.push(eq(inputDefinitions.is_active, true));
    }

    let query = db
      .select({
        id: inputDefinitions.id,
        name: inputDefinitions.name,
        description: inputDefinitions.description,
        variable_name: inputDefinitions.variable_name,
        formula: inputDefinitions.formula,
        formula_inputs: inputDefinitions.formula_inputs,
        category_id: inputDefinitions.category_id,
        category_name: catAlias.name,
        subcategory_id: inputDefinitions.subcategory_id,
        subcategory_name: subAlias.name,
        unit_id: inputDefinitions.unit_id,
        unit_name: unitAlias.name,
        data_type_id: inputDefinitions.data_type_id,
        data_type_name: dataTypeAlias.name,
        is_descriptive: inputDefinitions.is_descriptive,
        is_currency: inputDefinitions.is_currency,
        is_aggregated: inputDefinitions.is_aggregated,
        is_active: inputDefinitions.is_active,
        is_mandatory: inputDefinitions.is_mandatory,
        is_system_generated: inputDefinitions.is_system_generated,
        is_calculated: inputDefinitions.is_calculated,
        is_kpi: inputDefinitions.is_kpi,
        is_kpi_input: inputDefinitions.is_kpi_input,
        sort_order: inputDefinitions.sort_order,
      })
      .from(inputDefinitions)
      .leftJoin(catAlias, eq(inputDefinitions.category_id, catAlias.id))
      .leftJoin(subAlias, eq(inputDefinitions.subcategory_id, subAlias.id))
      .leftJoin(unitAlias, eq(inputDefinitions.unit_id, unitAlias.id))
      .leftJoin(
        dataTypeAlias,
        eq(inputDefinitions.data_type_id, dataTypeAlias.id),
      )
      .orderBy(asc(inputDefinitions.id));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }
    if (limit != null) {
      query = query.limit(limit) as typeof query;
    }
    if (offset > 0) {
      query = query.offset(offset) as typeof query;
    }

    const rows = await query;

    const data = rows.map((r) => [
      r.id,
      r.name,
      r.variable_name,
      r.category_id,
      r.category_name,
      r.subcategory_id,
      r.subcategory_name,
      r.unit_id,
      r.unit_name,
      r.data_type_id,
      r.data_type_name,
    ]);

    return NextResponse.json({ data, count: data.length });
  } catch (error) {
    console.error("[input-definitions] failed", error);
    return NextResponse.json(
      { error: "Failed to export input definitions." },
      { status: 500 },
    );
  }
}
