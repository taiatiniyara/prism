import { db } from "@/db/connection";
import { countries, countryContext, subRegions } from "@/db/schema/country";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and } from "drizzle-orm";
import { authorizeApiKey } from "../service";

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
    .select({
      id: measureDefinitions.id,
      optionListId: measureDefinitions.option_list_id,
    })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.name, "Fuel Pricing Regulation"),
        eq(measureDefinitions.measures_subgroup_id, COUNTRY_CONTEXT_SUBGROUP_ID),
      ),
    )
    .limit(1);
  const fuelRegulationMeasureId = fuelReg?.id;

  // Option-typed measure: country_context.value stores the chosen managed-list
  // item id as text ("890"). Resolve it to its label ("Price Regulation") rather
  // than emitting the raw id.
  const fuelRegulationItems = fuelReg?.optionListId
    ? await db
        .select()
        .from(managedListItems)
        .where(
          and(
            eq(managedListItems.list_id, fuelReg.optionListId),
            eq(managedListItems.is_active, true),
          ),
        )
    : [];
  const fuelRegulationNameById = new Map(
    fuelRegulationItems.map((item) => [item.id, item.name]),
  );

  let contextRows: (typeof countryContext.$inferSelect)[] = [];
  if (fuelRegulationMeasureId) {
    contextRows = await db
      .select()
      .from(countryContext)
      .where(eq(countryContext.measure_def_id, fuelRegulationMeasureId));
  }

  function resolveFuelRegulation(value: string | null | undefined) {
    if (value == null) return null;
    const optionId = Number(value);
    if (Number.isNaN(optionId)) return value;
    return fuelRegulationNameById.get(optionId) ?? value;
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
      "Fuel Regulation": resolveFuelRegulation(val),
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
