import { sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const migrationKey = process.env.PRISM_TRAINING_MIGRATION_KEY ?? "";

    if (!migrationKey) {
      return NextResponse.json(
        { error: "Migration key is not configured on this server." },
        { status: 500 },
      );
    }

    const providedKey = req.headers.get("x-migration-key") ?? "";

    if (providedKey !== migrationKey) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await db.execute(sql`
      SELECT
        m.id,
        m.measure_def_id,
        m.training_dl_def_id,
        m.training_dl_legacy_id,
        m.training_source_id,
        m.training_dl_name,
        m.training_variable_name,
        m.score,
        m.confidence,
        m.reasons,
        m.is_auto,
        m.is_approved,
        m.approved_at,
        m.approved_by_id,
        m.created_at,
        m.updated_at,
        i.name AS input_def_name,
        i.variable_name AS input_def_variable_name,
        i.description AS input_def_description,
        i.is_active AS input_def_is_active,
        i.formula AS input_def_formula,
        cat.name AS category_name,
        sub.name AS subcategory_name
      FROM input_dl_def_mappings m
      LEFT JOIN measure_definitions  i ON m.measure_def_id = i.id
      LEFT JOIN managed_list_items cat ON i.measures_group_id = cat.id
      LEFT JOIN managed_list_items sub ON i.measures_subgroup_id = sub.id
      ORDER BY m.id
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("[prism1ToPrism2InputMapping] failed", error);
    return NextResponse.json(
      { error: "Failed to fetch input mapping data." },
      { status: 500 },
    );
  }
}
