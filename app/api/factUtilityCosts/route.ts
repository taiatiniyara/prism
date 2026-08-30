import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { organisations } from "@/db/schema/utility";
import { countries } from "@/db/schema/country";
import { reportPeriods, publishedPeriodCondition } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and } from "drizzle-orm";
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

// The PBIX model was built on PRISM 1's data-list names, which differ from the
// enriched catalogue names. Staff/O&M are stored per utility-function slice in
// PRISM 2 but were separate data lists in PRISM 1 — map each slice to its own
// legacy column.
const UTILITY_COSTS_P1_LABELS: Record<
  string,
  string | Record<number, string>
> = {
  "Electricity Staff": {
    1024: "Generation Labor Costs",
    1025: "Distribution Labor Costs",
    1026: "Transmission Labor Costs",
  },
  "Electricity O&M": {
    1024: "Generation OM Costs",
    1025: "Distribution OM Costs",
    1026: "Transmission OM Costs",
  },
  "Electricity Purchases": "Power Purchase Costs",
  "Fuel & Oil Expenditure": "Fuel Expenditure",
  "Other Staff": "Other Labor Expenditure",
  "Other O&M": "Other Expenditure",
  "Duty and Taxes - Fuel & Oil": "Duty on Fuel and Lube Oil",
  "Duty and Taxes - Others": "Other Duty and Taxes",
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
    .where(publishedPeriodCondition);
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
            const slices = entries.filter(
              (l) => l.measure_def_id === dl.id && l.report_period_id === r.id,
            );
            const baseLabel =
              UTILITY_COSTS_COLUMN_LABELS[dl.name] ?? dl.name;
            const p1Spec = UTILITY_COSTS_P1_LABELS[dl.name];
            const cols: Record<string, unknown> = {};
            for (const val of slices) {
              const rawValue = resolveEntryValue(
                val,
                dataTypeNameById.get(dl.id) ?? null,
                itemsById,
              );
              if (rawValue == null) continue;
              const numericValue =
                typeof rawValue === "number" ? rawValue : null;
              const factor = multiplierFactor(val.multiplier);
              acc.mults.add(val.multiplier);
              const usd =
                numericValue != null
                  ? (numericValue * factor) / fxRate
                  : null;

              // Function-sliced measures emit one legacy column per slice.
              if (typeof p1Spec !== "string" && p1Spec != null) {
                const fnLabel =
                  val.utility_function_id != null
                    ? p1Spec[val.utility_function_id]
                    : undefined;
                if (fnLabel) {
                  cols[fnLabel] = numericValue;
                  cols[`${fnLabel} USD`] = usd;
                  continue;
                }
              }

              cols[baseLabel] = numericValue ?? 0;
              cols[`${baseLabel} USD`] = usd;
              // Legacy PRISM 1 alias alongside the enriched label.
              if (typeof p1Spec === "string") {
                cols[p1Spec] = numericValue ?? 0;
                cols[`${p1Spec} USD`] = usd;
              }
            }
            return { ...acc, cols: { ...acc.cols, ...cols } };
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
