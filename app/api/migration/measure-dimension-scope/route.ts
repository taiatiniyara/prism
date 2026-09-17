import { db } from "@/db/connection";
import { measureDimensionScope } from "@/db/schema";
import { assertMigrationKey, migrationAuthErrorResponse } from "../prism-training/_lib";

export async function GET(req: Request) {
  try {
    assertMigrationKey(req);
    const list = await db.select().from(measureDimensionScope);
    return Response.json(list);
  } catch (error) {
    const authResponse = migrationAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return Response.json(
      { error: "Failed to export measure dimension scope." },
      { status: 500 },
    );
  }
}
