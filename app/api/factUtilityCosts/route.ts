import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { organisations } from "@/db/schema/utility";
import { countries } from "@/db/schema/country";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import { getAllExchangeRates } from "@/lib/exchange-rates";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const entries = await db
    .select()
    .from(dataEntries)
    .where(eq(dataEntries.is_deleted, false));
  const rps = await db
    .select()
    .from(reportPeriods)
    .where(isNotNull(reportPeriods.status_id));
  const allUtils = await db
    .select()
    .from(organisations)
    .where(eq(organisations.is_active, true));
  const allCountries = await db.select().from(countries);
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));
  const inputDefs = await db
    .select()
    .from(measureDefinitions)
    .where(eq(measureDefinitions.is_active, true));
  const exchangeRates = await getAllExchangeRates();

  const utilsMap = new Map(allUtils.map((u) => [u.id, u]));
  const countriesMap = new Map(allCountries.map((c) => [c.id, c]));
  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  return Response.json(
    rps.map((r) => {
      const utility = utilsMap.get(r.utility_id);
      const country = utility
        ? countriesMap.get(utility.country_id)
        : undefined;
      const currency = country ? findItem(country.currency_id)?.name : "USD";
      const fxRate = exchangeRates[currency ?? "USD"] ?? 1;

      const dls = inputDefs
        .filter((dl) =>
          entries.some(
            (l) => l.measure_def_id === dl.id && l.report_period_id === r.id,
          ),
        )
        .reduce(
          (acc, dl) => {
            const val = entries.find(
              (l) => l.measure_def_id === dl.id && l.report_period_id === r.id,
            );
            const numericValue = val ? Number(val.value) : null;
            return {
              Unit: findItem(dl.unit_id)?.name,
              Multiplier: "Ones",
              [dl.name]: Number(val?.value ?? "0"),
              [`${dl.name} USD`]:
                numericValue != null ? numericValue / fxRate : null,
              ...acc,
            };
          },
          {} as Record<string, unknown>,
        );
      const reportType = findItem(r.report_type_id)?.name;
      return {
        ReportType: reportType,
        ReportPeriod: formatReportPeriodIso(r.report_date, reportType),
        UtilityId: r.utility_id,
        Currency: currency,
        UsdExchangeRate: fxRate,
        ...dls,
      };
    }),
  );
}
