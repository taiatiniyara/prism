import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import {
  reportPeriods,
  publishedPeriodCondition,
} from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import { getAllExchangeRates } from "@/lib/exchange-rates";
import { countries, organisations } from "@/db/schema";

const SUBGROUP_NAME = "Cost Breakdown";

// p1's UtilityCosts columns, in emitted order. Each <label> maps onto a p2
// (measure, utility function, provider) slice of data_entries:
//   { label, measure: def name in subgroup "Cost Breakdown", fn: utility
//     function id, prov: provider id }
// Provider 22/23 split "Electricity Purchases" into the IPP and Customer
// columns respectively.
const COST_COLUMNS: { label: string; measure: string; fn: number; prov: number }[] = [
  { label: "Power Purchase Costs Customer", measure: "Electricity Purchases", fn: 1024, prov: 23 },
  { label: "Other Duty and Taxes", measure: "Duty and Taxes - Others", fn: 1023, prov: 21 },
  { label: "Distribution Labor Costs", measure: "Electricity Staff", fn: 1025, prov: 21 },
  { label: "Transmission Labor Costs", measure: "Electricity Staff", fn: 1026, prov: 21 },
  { label: "Generation Labor Costs", measure: "Electricity Staff", fn: 1024, prov: 21 },
  { label: "Duty on Fuel and Lube Oil", measure: "Duty and Taxes - Fuel & Oil", fn: 1024, prov: 21 },
  { label: "Other Expenditure", measure: "Other O&M", fn: 1030, prov: 21 },
  { label: "Other Labor Expenditure", measure: "Other Staff", fn: 1030, prov: 21 },
  { label: "Distribution OM Costs", measure: "Electricity O&M", fn: 1025, prov: 21 },
  { label: "Transmission OM Costs", measure: "Electricity O&M", fn: 1026, prov: 21 },
  { label: "Power Purchase Costs IPP", measure: "Electricity Purchases", fn: 1024, prov: 22 },
  { label: "Generation OM Costs", measure: "Electricity O&M", fn: 1024, prov: 21 },
  { label: "Fuel Expenditure", measure: "Fuel & Oil Expenditure", fn: 1024, prov: 21 },
];

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const groups = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .where(and(eq(managedListItems.name, SUBGROUP_NAME), eq(managedListItems.list_id, 13)));
  const subgroupId = groups[0]?.id;
  if (subgroupId == null) return Response.json([]);

  const defs = await db
    .select()
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.measures_subgroup_id, subgroupId),
      ),
    );
  const measureIdByName = new Map(defs.map((d) => [d.name, d.id]));
  const entries = await db
    .select()
    .from(dataEntries)
    .where(
      and(
        inArray(dataEntries.measure_def_id, defs.map((d) => d.id)),
        eq(dataEntries.is_deleted, false),
      ),
    );
  const rps = await db
    .select()
    .from(reportPeriods)
    .where(publishedPeriodCondition);
  const utilities = await db
    .select()
    .from(organisations)
    .leftJoin(countries, eq(organisations.country_id, countries.id));
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));
  const itemsById = new Map(allItems.map((i) => [i.id, i.name]));
  const exchangeRates = await getAllExchangeRates();

  // Cost data is stored once per utility (null service area), so each value is
  // a single entry keyed by report period + measure + function + provider.
  const valMap = new Map<string, (typeof entries)[number]>();
  for (const e of entries) {
    valMap.set(
      `${e.report_period_id}:${e.measure_def_id}:${e.utility_function_id}:${e.provider_id}`,
      e,
    );
  }
  const findValue = (rpId: number, measure: string, fn: number, prov: number) => {
    const m = measureIdByName.get(measure);
    if (m == null) return null;
    const e = valMap.get(`${rpId}:${m}:${fn}:${prov}`);
    if (!e || e.value_numeric == null) return null;
    return Number(e.value_numeric);
  };

  const purchaseDefId = measureIdByName.get("Electricity Purchases");
  const unitName =
    itemsById.get(
      defs.find((d) => d.id === purchaseDefId)?.unit_id ?? 0,
    ) ?? "Currency";

  return Response.json(
    rps.map((r) => {
      const utility = utilities.find((u) => u.organisations.id === r.utility_id);
      const country = utility?.countries ?? null;
      const currency = country
        ? (itemsById.get(country.currency_id) ?? null)
        : null;
      const fxRate = exchangeRates[currency ?? "USD"] ?? 1;
      const reportType = itemsById.get(r.report_type_id) ?? null;

      const row: Record<string, unknown> = {
        ReportType: reportType,
        ReportPeriod: formatReportPeriodIso(r.report_date, reportType),
        ReportPeriodId: r.id,
        UtilityId: r.utility_id,
        Currency: currency,
        UsdExchangeRate: fxRate,
        Unit: unitName,
      };
      // p1 carries the LAST column's multiplier, i.e. the "Power Purchase
      // Costs Customer" slice (provider 23) when present.
      const customerEntry = valMap.get(
        `${r.id}:${purchaseDefId}:1024:23`,
      );
      row.Multiplier = customerEntry?.multiplier || "Ones";

      for (const c of COST_COLUMNS) {
        const value = findValue(r.id, c.measure, c.fn, c.prov);
        const base = typeof value === "number" && Number.isFinite(value) ? value : 0;
        row[c.label] = base;
        // p1 emits null USD when the base is falsy (missing or zero).
        row[`${c.label} USD`] = base ? base / fxRate : null;
      }
      return row;
    }),
  );
}