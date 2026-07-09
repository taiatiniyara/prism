import { db } from "@/db/connection";
import { assertMigrationKey } from "../../migration/prism-training/_lib";
import { inputDefinitions } from "@/db/schema";
import { listColumnsAndTypes } from "@/lib/utils";

export async function GET(req: Request) {
  assertMigrationKey(req);
  const [record] = await db.select().from(inputDefinitions).limit(1);
  return Response.json(listColumnsAndTypes(record));
}
