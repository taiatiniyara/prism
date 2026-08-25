import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { organisations } from "@/db/schema/utility";
import { countries } from "@/db/schema/country";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import { resolveEntryValue } from "@/lib/legacy/entry-value";
import { getAllExchangeRates } from "@/lib/exchange-rates";
import {
  multiplierFactor,
  rollUpMultiplier,
} from "@/lib/pbi/multiplier";

// Power BI column labels (measure name -> legacy semantic-model name).
const UTILITY_COSTS_COLUMN_LABELS: Record<string, string> = {
  "Electricity Staff": "Direct Costs: Electricity Staff",
  "Electricity O&M": "Direct Costs: Electricity O&M",
  "Electricity Purchases": "Direct Costs: Electricity Purchases",
  "Fuel & Oil Expenditure": "Apportioned Cost: Fuel & Oil Expenditure",
  "Other Staff": "Apportioned Cost: Other Staff",
  "Other O&M": "Apportioned Cost: Other O&M",
  "Duty and Taxes - Fuel & Oil": "Apportioned Cost: Duty and Taxes - Fuel & Oil",
  "Duty and Taxes - Others": "Apportioned Cost: Duty and Taxes - Others",
};

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
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.measures_subgroup_id, 230),
      ),
    );
  const exchangeRates = await getAllExchangeRates();

  const utilsMap = new Map(allUtils.map((u) => [u.id, u]));
  const countriesMap = new Map(allCountries.map((c) => [c.id, c]));
  const itemsById = new Map(allItems.map((i) => [i.id, i.name]));
  const dataTypeNameById = new Map(
    inputDefs.map((d) => [d.id, itemsById.get(d.data_type_id) ?? null]),
  );
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
            const rawValue = resolveEntryValue(
              val,
              dataTypeNameById.get(dl.id) ?? null,
              itemsById,
            );
            const numericValue =
              typeof rawValue === "number" ? rawValue : null;
            const label = UTILITY_COSTS_COLUMN_LABELS[dl.name] ?? dl.name;
            const factor = multiplierFactor(val?.multiplier);
            if (numericValue != null && val) acc.mults.add(val.multiplier);
            return {
              ...acc,
              cols: {
                ...acc.cols,
                [label]: numericValue ?? 0,
                [`${label} USD`]:
                  numericValue != null
                    ? (numericValue * factor) / fxRate
                    : null,
              },
            };
          },
          { cols: {} as Record<string, unknown>, mults: new Set<string>() },
        );
      const reportType = findItem(r.report_type_id)?.name;
      return {
        ReportType: reportType,
        ReportPeriod: formatReportPeriodIso(r.report_date, reportType),
        UtilityId: r.utility_id,
        Currency: currency,
        UsdExchangeRate: fxRate,
        Multiplier: rollUpMultiplier(dls.mults),
        ...dls.cols,
      };
    }),
  );
}
