import { db } from "@/db/connection";
import { organisations } from "@/db/schema/utility";
import { countries } from "@/db/schema/country";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { eq, and, gt, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { getCountryCoordinates } from "@/lib/legacy/country-coordinates";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const allUtilities = await db
    .select()
    .from(organisations)
    .where(
      and(
        eq(organisations.is_utility, true),
        eq(organisations.is_active, true),
        gt(organisations.id, 1),
      ),
    );

  const allCountries = await db.select().from(countries);

  const rps = await db
    .select({ utility_id: reportPeriods.utility_id })
    .from(reportPeriods)
    .where(isNotNull(reportPeriods.status_id));

  const utilityIdsWithRps = new Set(rps.map((r) => r.utility_id));

  return Response.json(
    allUtilities
      .filter((u) => utilityIdsWithRps.has(u.id))
      .map((u) => {
        const fy = u.financial_year_end
          ? new Date(u.financial_year_end)
          : null;
        const fyIso =
          fy && !isNaN(fy.getTime()) ? fy.toISOString() : null;
        const countryName = allCountries.find(
          (c) => c.id === u.country_id,
        )?.name;
        const coords = getCountryCoordinates(countryName);
        return {
          UtilityId: u.id,
          Utility: u.name,
          Acronym: u.acronym || u.name,
          Lat: coords.lat,
          Lng: coords.lng,
          Country: countryName,
          "Financial Year End": fyIso,
        };
      }),
  );
}
