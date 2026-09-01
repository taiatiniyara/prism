import { DataEntryStatusList } from "@/db/schema";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const migrationKey = process.env.PRISM_TRAINING_MIGRATION_KEY ?? "";

  const providedKey = req.headers.get("x-migration-key") ?? "";

  if (migrationKey.length === 0 || providedKey !== migrationKey) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
    });
  }

  return new Response(JSON.stringify(DataEntryStatusList), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
