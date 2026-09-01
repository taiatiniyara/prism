import { sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { NextResponse } from "next/server";
import { assertMigrationKey } from "../prism-training/_lib";

export async function GET(request: Request) {
  try {
    assertMigrationKey(request);

    const result = await db.execute(sql`
      SELECT i.*, cat.name AS category_name, sub.name AS subcategory_name
      FROM measure_definitions  i
      LEFT JOIN managed_list_items cat ON i.category_id = cat.id
      LEFT JOIN managed_list_items sub ON i.subcategory_id = sub.id
      ORDER BY i.id
    `);

    const data = result.rows.map((row) => {
      return {
        ...row,
        category_name: row.category_name || null,
        subcategory_name: row.subcategory_name || null,
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[input-definitions] failed", error);
    return NextResponse.json(
      { error: "Failed to export input definitions." },
      { status: 500 },
    );
  }
}
