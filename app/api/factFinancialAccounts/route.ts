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

// Power BI column labels for measures whose catalogue name drifted from the
// legacy semantic-model name. Keyed by measure name.
const FINANCIAL_COLUMN_LABELS: Record<string, string> = {
  "Amortization Expenses": "Amortization Expense",
  "Income Tax": "Income Taxes",
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
        eq(measureDefinitions.measures_subgroup_id, 231),
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
    rps
      .map((r) => {
        const u = utilsMap.get(r.utility_id);
        const country = u ? countriesMap.get(u.country_id) : undefined;
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
            const v = entries.find(
              (l) =>
                l.measure_def_id === dl.id && l.report_period_id === r.id,
            );
            const rawValue = resolveEntryValue(
              v,
              dataTypeNameById.get(dl.id) ?? null,
              itemsById,
            );
            const numericValue =
              typeof rawValue === "number" ? rawValue : null;
            const label = FINANCIAL_COLUMN_LABELS[dl.name] ?? dl.name;
            const factor = multiplierFactor(v?.multiplier);
            if (numericValue != null && v) acc.mults.add(v.multiplier);
            return {
              ...acc,
              cols: {
                ...acc.cols,
                [label]: numericValue,
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
        Utility: u?.acronym ?? "",
        Currency: currency,
        UsdExchangeRate: fxRate,
        Multiplier: rollUpMultiplier(dls.mults),
        // legacy spelling kept as an alias for models keyed on "Multipler"
        Multipler: rollUpMultiplier(dls.mults),
        ...dls.cols,
      };
    })
      .sort((a, b) => String(a.Utility).localeCompare(String(b.Utility))),
  );
}
