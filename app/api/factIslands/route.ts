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
      const val = ctxRows.find(
        (r) => r.country_id === c.id && r.measureName === "Islands",
      );
      return {
        Country: c.name,
        Islands: val?.value ?? null,
        Year: null,
        Source: "unknown",
      };
    }),
  );
}
