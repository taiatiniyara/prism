import { db } from "@/db/connection";
import { countries, countryContext, subRegions } from "@/db/schema/country";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { eq, and } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { dlValueOrNull } from "@/lib/legacy/legacy-dl-resolver";

// Display-name aliases so the legacy Power BI dimension matches prism-training's
// country labels. The underlying `countries.name` (UN M49 short names) is left
// untouched — this mapping is scoped to this route only.
const COUNTRY_DISPLAY_NAMES: Record<string, string> = {
  "Micronesia (Federated States of)": "Federated States of Micronesia",
  Pitcairn: "Pitcairn Islands",
  "Wallis and Futuna Islands": "Wallis and Futuna",
};

// The "Country Context" measures subgroup — country_context.measure_def_id ∈ this set.
const COUNTRY_CONTEXT_SUBGROUP_ID = 221;

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const allCountries = await db.select().from(countries);
  const allSubRegions = await db.select().from(subRegions);
  const [fuelReg] = await db
    .select({ id: measureDefinitions.id })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.name, "Fuel Pricing Regulation"),
        eq(measureDefinitions.measures_subgroup_id, COUNTRY_CONTEXT_SUBGROUP_ID),
      ),
    )
    .limit(1);
  const fuelRegulationMeasureId = fuelReg?.id;

  let contextRows: (typeof countryContext.$inferSelect)[] = [];
  if (fuelRegulationMeasureId) {
    contextRows = await db
      .select()
      .from(countryContext)
      .where(eq(countryContext.measure_def_id, fuelRegulationMeasureId));
  }

  const rows = allCountries.map((country) => {
    // dimension (not period-keyed): take the latest available figure
    const val = contextRows
      .filter((cc) => cc.country_id === country.id)
      .sort((a, b) => b.period_year - a.period_year)[0]?.value;
    return {
      Country: COUNTRY_DISPLAY_NAMES[country.name] ?? country.name,
      "ISO 3166 Alpha-2": country.iso_code_alpha2.toUpperCase(),
      Region: allSubRegions.find((sr) => sr.id === country.sub_region_id)
        ?.name,
      "Fuel Regulation": dlValueOrNull(val),
    };
  });

  rows.push({
    Country: "All Countries",
    "ISO 3166 Alpha-2": "ALL",
    Region: "All SubRegions",
    "Fuel Regulation": null,
  });

  return Response.json(rows);
}
