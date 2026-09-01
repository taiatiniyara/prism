import { db } from "@/db/connection";
import { dataEntryLogs } from "@/db/schema/dataEntry";
import { user } from "@/db/schema/auth-schema";
import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user.service";

export async function GET(req: NextRequest) {
  try {
    await getCurrentUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "200"), 500);

  const logs = await db
    .select({
      id: dataEntryLogs.id,
      data_entry_id: dataEntryLogs.data_entry_id,
      previous_value: dataEntryLogs.previous_value,
      new_value: dataEntryLogs.new_value,
      updated_at: dataEntryLogs.updated_at,
      updated_by_name: user.name,
      updated_by_email: user.email,
    })
    .from(dataEntryLogs)
    .leftJoin(user, eq(dataEntryLogs.updated_by_id, user.id))
    .orderBy(desc(dataEntryLogs.updated_at))
    .limit(limit);

  return NextResponse.json(logs);
}
