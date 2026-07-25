import { db } from "@/db/connection";
import { measureDimensionScope } from "@/db/schema";
import { assertMigrationKey } from "../prism-training/_lib";

export async function GET(req: Request) {
  assertMigrationKey(req);
  const list = await db.select().from(measureDimensionScope);
  return Response.json(list);
}
