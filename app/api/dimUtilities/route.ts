import { db } from "@/db/connection";
import { organisations } from "@/db/schema/utility";
import { countries } from "@/db/schema/country";
import { reportPeriods, publishedPeriodCondition } from "@/db/schema/reportPeriods";
import { eq, and, gt } from "drizzle-orm";
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
    .where(publishedPeriodCondition);

  const utilityIdsWithRps = new Set(rps.map((r) => r.utility_id));

  return Response.json(
    allUtilities
      .filter((u) => utilityIdsWithRps.has(u.id))
      .map((u) => {
        // FY-end is a recurring month/day (organisations.fye_month/fye_day); the year is
        // a display placeholder only (2024, matching the retired text field's convention).
        const fy =
          u.fye_month != null && u.fye_day != null
            ? new Date(2024, u.fye_month - 1, u.fye_day)
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
