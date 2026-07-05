import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { energyResources, organisations, serviceAreas } from "@/db/schema/utility";
import { countries } from "@/db/schema/country";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import { getAllExchangeRates } from "@/lib/exchange-rates";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) return Response.json({ message: authorize.message }, { status: 401 });

  const entries = await db.select().from(dataEntries).where(eq(dataEntries.is_deleted, false));
  const rps = await db.select().from(reportPeriods).where(isNotNull(reportPeriods.status_id));
  const allSa = await db.select().from(serviceAreas).where(eq(serviceAreas.is_active, true));
  const allResources = await db.select().from(energyResources).where(eq(energyResources.is_virtual, false));
  const allUtils = await db.select().from(organisations).where(eq(organisations.is_active, true));
  const allCountries = await db.select().from(countries);
  const allItems = await db.select().from(managedListItems).where(eq(managedListItems.is_active, true));
  const inputDefs = await db.select().from(inputDefinitions).where(eq(inputDefinitions.is_active, true));
  const exchangeRates = await getAllExchangeRates();

  const utilsMap = new Map(allUtils.map((u) => [u.id, u]));
  const countriesMap = new Map(allCountries.map((c) => [c.id, c]));
  function findItem(id: number | null) { return id ? allItems.find((m) => m.id === id) : undefined; }

  return Response.json(rps
    .filter((r) => entries.some((l) => l.report_period_id === r.id))
    .map((r) => {
      const org = utilsMap.get(r.utility_id);
      const country = org ? countriesMap.get(org.country_id) : undefined;
      const currency = country ? findItem(country.currency_id)?.name : "USD";
      const fxRate = exchangeRates[currency ?? "USD"] ?? 1;
      const reportType = findItem(r.report_type_id)?.name;
      return {
        ReportType: reportType,
        ReportPeriod: formatReportPeriodIso(r.report_date, reportType),
        UtilityId: r.utility_id,
        Currency: currency,
        UsdExchangeRate: fxRate,
        Data: allSa.filter((sa) => sa.utility_id === r.utility_id).map((sa) =>
          inputDefs.filter((dlDef) => entries.some((l) => l.input_def_id === dlDef.id)).reduce((acc, dl) => {
            const val = entries.find((l) =>
              l.input_def_id === dl.id && l.report_period_id === r.id &&
              allResources.some((g) =>
                g.id === l.energy_resource_id && g.service_area_id === sa.id &&
                g.period_entries?.some((pe) => pe.report_period_id === r.id)
              )
            );
            const numericValue = val ? Number(val.value) : null;
            return {
              ...acc,
              ServiceAreaId: sa.id,
              [dl.name]: numericValue,
              Unit: findItem(dl.unit_id)?.name,
              Multiplier: "Ones",
              [`${dl.name} USD`]: numericValue != null && isFinite(numericValue) ? numericValue / fxRate : 0,
            };
          }, {} as Record<string, unknown>)
        ),
      };
    }));
}
