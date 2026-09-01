import { db } from "@/db/connection";
import { assertMigrationKey } from "../migration/prism-training/_lib";
import { powerStations } from "@/db/schema";

export async function GET(req: Request) {
  assertMigrationKey(req);
  const list = await db.select().from(powerStations);

  return Response.json(list);
}
