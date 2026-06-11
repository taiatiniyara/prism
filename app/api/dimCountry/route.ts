import { db } from "@/db/connection";
import { countries, countryContext, subRegions } from "@/db/schema/country";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { dlValueOrNull } from "@/lib/legacy-dl-resolver";

async function getManagedListByName(listName: string) {
  const [list] = await db
    .select()
    .from(managedLists)
    .where(eq(managedLists.name, listName))
    .limit(1);
  if (!list) return null;
  const items = await db
    .select()
    .from(managedListItems)
    .where(
      and(
        eq(managedListItems.list_id, list.id),
        eq(managedListItems.is_active, true),
      ),
    );
  return items;
}

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const allCountries = await db.select().from(countries);
  const allSubRegions = await db.select().from(subRegions);
  const fuelRegulationItems = (await getManagedListByName("Fuel Regulation")) ?? [];
  const fuelRegulationDlDefId = fuelRegulationItems[0]?.id;

  let contextRows: (typeof countryContext.$inferSelect)[] = [];
  if (fuelRegulationDlDefId) {
    contextRows = await db
      .select()
      .from(countryContext)
      .where(eq(countryContext.dl_def_id, fuelRegulationDlDefId));
  }

  return Response.json(
    allCountries.map((country) => {
      const val = contextRows.find(
        (cc) => cc.country_id === country.id,
      )?.value;
      return {
        Country: country.name,
        "ISO 3166 Alpha-2": country.iso_code_alpha2.toUpperCase(),
        Region: allSubRegions.find((sr) => sr.id === country.sub_region_id)
          ?.name,
        "Fuel Regulation": dlValueOrNull(val),
      };
    }),
  );
}
