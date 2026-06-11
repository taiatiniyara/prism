import { db } from "@/db/connection";
import { subRegions } from "@/db/schema/country";
import { eq } from "drizzle-orm";
import { authorizeApiKey } from "../service";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const regions = await db
    .select()
    .from(subRegions)
    .where(eq(subRegions.is_active, true));

  return Response.json(
    regions.map((r) => ({
      Region: r.name,
      "UN Continental Region": r.un_continental_region,
    })),
  );
}
