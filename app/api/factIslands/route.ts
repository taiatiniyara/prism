import { db } from "@/db/connection";
import { countryContext as ccTable, countries } from "@/db/schema/country";
import { managedListItems } from "@/db/schema/managedLists";
import { eq } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { dlValue } from "@/lib/legacy/legacy-dl-resolver";

async function getDlItemId(name: string): Promise<number | null> {
  const [item] = await db.select({ id: managedListItems.id }).from(managedListItems).where(eq(managedListItems.name, name)).limit(1);
  return item?.id ?? null;
}

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) return Response.json({ message: authorize.message }, { status: 401 });

  const dlItemId = await getDlItemId("Number of Islands");
  const allCountries = await db.select().from(countries);
  const ctxRows = dlItemId ? await db.select().from(ccTable).where(eq(ccTable.dl_def_id, dlItemId)) : [];

  return Response.json(allCountries.map((c) => {
    const val = ctxRows.find((row) => row.country_id === c.id);
    return {
      Country: c.name,
      Islands: dlValue(val?.value),
      Year: val?.updated_date?.toISOString() ?? null,
      Source: val?.source_url || "unknown",
    };
  }));
}
