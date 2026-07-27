import { db } from "@/db/connection";
import { assertMigrationKey } from "../migration/prism-training/_lib";
import { dataEntries } from "@/db/schema";

export async function GET(req: Request) {
  assertMigrationKey(req);
  const list = await db.select().from(dataEntries);

  return Response.json(list);
}
