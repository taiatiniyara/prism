import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const required = process.env.PRISM_TRAINING_MIGRATION_KEY ?? process.env.MIGRATION_API_KEY;
    if (!required) {
      return NextResponse.json(
        { error: "MIGRATION_API_KEY is not configured on this server." },
        { status: 500 },
      );
    }
    const hdrs = await headers();
    const provided = hdrs.get("x-migration-key") ?? "";
    if (provided !== required) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await db.execute(sql`
      SELECT i.*, cat.name AS category_name, sub.name AS subcategory_name
      FROM input_definitions i
      LEFT JOIN managed_list_items cat ON i.category_id = cat.id
      LEFT JOIN managed_list_items sub ON i.subcategory_id = sub.id
      ORDER BY i.id
    `);

    const data = result.rows.map((row) => {
      return {
        category_name: row.category_name || null,
        subcategory_name: row.subcategory_name || null,
        ...row,
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to export input definitions." },
      { status: 500 },
    );
  }
}
