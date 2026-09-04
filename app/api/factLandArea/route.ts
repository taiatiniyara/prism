import { db } from "@/db/connection";
import { countries } from "@/db/schema/country";
import { authorizeApiKey } from "../service";
import { getResolvedContextRows } from "@/lib/legacy/context-data";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const ctxRows = await getResolvedContextRows(221);
  const allCountries = await db.select().from(countries);

  return Response.json(
    allCountries.map((c) => {
      // country-keyed (not period-keyed): take the latest available figure
      const val = ctxRows
        .filter((r) => r.country_id === c.id && r.measureName === "Land Area")
        .sort((a, b) => b.source_date.getTime() - a.source_date.getTime())[0];
      return {
        Country: c.name,
        Area: val?.value ?? null,
        ReportPeriodId: val?.report_period_id ?? null,
        Source: "unknown",
      };
    }),
  );
}
