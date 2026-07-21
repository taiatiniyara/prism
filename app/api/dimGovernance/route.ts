import { db } from "@/db/connection";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { eq } from "drizzle-orm";
import { authorizeApiKey } from "../service";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  function findItem(id: number | null) {
    if (!id) return undefined;
    return allItems.find((m) => m.id === id);
  }

  const dlDefs = await db
    .select()
    .from(measureDefinitions)
    .where(eq(measureDefinitions.is_active, true));

  return Response.json(
    dlDefs.map((dl) => ({
      "Governance Indicator ID": dl.id,
      "Governance Indicator": dl.name,
      "Governance Indicator Category": findItem(dl.subcategory_id)?.name,
      "Good Governance": "Yes",
      "Poor Governance": "No",
    })),
  );
}
