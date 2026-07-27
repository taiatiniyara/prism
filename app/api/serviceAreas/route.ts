import { db } from "@/db/connection";
import { assertMigrationKey } from "../migration/prism-training/_lib";
import { serviceAreas } from "@/db/schema";

export async function GET(req: Request) {
  assertMigrationKey(req);

  const list = await db.select().from(serviceAreas);
  return Response.json(list);
}
