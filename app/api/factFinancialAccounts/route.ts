import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { organisations } from "@/db/schema/utility";
import { countries } from "@/db/schema/country";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy-dl-resolver";
import { getAllExchangeRates } from "@/lib/exchange-rates";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) return Response.json(authorize.message);

  const entries = await db.select().from(dataEntries).where(eq(dataEntries.is_deleted, false));
  const rps = await db.select().from(reportPeriods).where(isNotNull(reportPeriods.status_id));
  const allUtils = await db.select().from(organisations).where(eq(organisations.is_active, true));
  const allCountries = await db.select().from(countries);
  const allItems = await db.select().from(managedListItems).where(eq(managedListItems.is_active, true));
  const inputDefs = await db.select().from(inputDefinitions).where(eq(inputDefinitions.is_active, true));
  const exchangeRates = await getAllExchangeRates();

  const utilsMap = new Map(allUtils.map((u) => [u.id, u]));
  const countriesMap = new Map(allCountries.map((c) => [c.id, c]));
  function findItem(id: number | null) { return id ? allItems.find((m) => m.id === id) : undefined; }

  return Response.json(rps
    .map((r) => {
      const u = utilsMap.get(r.utility_id);
      const country = u ? countriesMap.get(u.country_id) : undefined;
      const currency = country ? findItem(country.currency_id)?.name : "USD";
      const fxRate = exchangeRates[currency ?? "USD"] ?? 1;
      const dls = inputDefs
        .filter((dl) => entries.some((l) => l.input_def_id === dl.id && l.report_period_id === r.id))
        .reduce((acc, dl) => {
          const v = entries.find((l) => l.input_def_id === dl.id && l.report_period_id === r.id);
          const numericValue = v?.value ? Number(v.value) : null;
          return {
            ...acc,
            [dl.name]: numericValue,
            Unit: findItem(dl.unit_id)?.name,
            Multiplier: "Ones",
            [`${dl.name} USD`]: numericValue != null ? numericValue / fxRate : null,
          };
        }, {} as Record<string, unknown>);
      const reportType = findItem(r.report_type_id)?.name;
      return {
        ReportType: reportType,
        ReportPeriod: formatReportPeriodIso(r.report_date, reportType),
        UtilityId: u?.id,
        Utility: u?.acronym ?? "",
        Currency: currency,
        UsdExchangeRate: fxRate,
        ...dls,
      };
    })
    .sort((a, b) => String(a.Utility).localeCompare(String(b.Utility))));
}
