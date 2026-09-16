import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { organisations, serviceAreas } from "@/db/schema/utility";
import { countries } from "@/db/schema/country";
import { reportPeriods, publishedPeriodCondition } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import { getAllExchangeRates } from "@/lib/exchange-rates";

// Column set mirrors prism-training's /api/factTariffStructure: 155 tariff
// labels, each emitted as <label> then <label> USD. p1 maps each label onto a
// (payment_mode_id, customer_type_id, measure_id, block_id) slice; p2 stores
// that same slice in data_entries' ten canonical dimensions, so the value is
// found by matching those four dimensions (block => consumption_band_id).
const TARIFF_LABEL = [
  "Prepaid Residential VAT or GST Rate",
  "Prepaid Residential Fixed Monthly Charge",
  "Prepaid Residential Block 1 Rate per kwh",
  "Prepaid Residential Block 1 Limit",
  "Prepaid Residential Block 2 Rate per kwh",
  "Prepaid Residential Block 2 Limit",
  "Prepaid Residential Block 3 Rate per kwh",
  "Prepaid Residential Block 3 Limit",
  "Prepaid Residential Block 4 Rate per kwh",
  "Prepaid Residential Block 4 Limit",
  "Prepaid Residential Block 5 Rate per kwh",
  "Prepaid Commercial VAT or GST Rate",
  "Prepaid Commercial Fixed Monthly Charge",
  "Prepaid Commercial Block 1 Limit",
  "Prepaid Commercial Block 1 Rate per kwh",
  "Prepaid Commercial Block 2 Limit",
  "Prepaid Commercial Block 2 Rate per kwh",
  "Prepaid Commercial Block 3 Rate per kwh",
  "Prepaid Commercial Block 3 Limit",
  "Prepaid Commercial Block 4 Rate per kwh",
  "Prepaid Commercial Block 4 Limit",
  "Prepaid Commercial Block 5 Rate per kwh",
  "Prepaid Industrial VAT or GST Rate",
  "Prepaid Industrial Fixed Monthly Charge",
  "Prepaid Industrial Block 1 Rate per kwh",
  "Prepaid Industrial Block 1 Limit",
  "Prepaid Industrial Block 2 Rate per kwh",
  "Prepaid Industrial Block 2 Limit",
  "Prepaid Industrial Block 3 Rate per kwh",
  "Prepaid Industrial Block 3 Limit",
  "Prepaid Industrial Block 4 Rate per kwh",
  "Prepaid Industrial Block 4 Limit",
  "Prepaid Industrial Block 5 Rate per kwh",
  "Prepaid Government VAT or GST Rate",
  "Prepaid Government Fixed Monthly Charge",
  "Prepaid Government Block 1 Rate per kwh",
  "Prepaid Government Block 1 Limit",
  "Prepaid Government Block 2 Rate per kwh",
  "Prepaid Government Block 2 Limit",
  "Prepaid Government Block 3 Rate per kwh",
  "Prepaid Government Block 3 Limit",
  "Prepaid Government Block 4 Rate per kwh",
  "Prepaid Government Block 4 Limit",
  "Prepaid Government Block 5 Rate per kwh",
  "Prepaid Streetlights VAT or GST Rate",
  "Prepaid Streetlights Fixed Monthly Charge",
  "Prepaid Streetlights Block 1 Rate per kwh",
  "Prepaid Streetlights Block 1 Limit",
  "Prepaid Streetlights Block 2 Rate per kwh",
  "Prepaid Streetlights Block 2 Limit",
  "Prepaid Streetlights Block 3 Rate per kwh",
  "Prepaid Streetlights Block 3 Limit",
  "Prepaid Streetlights Block 4 Rate per kwh",
  "Prepaid Streetlights Block 4 Limit",
  "Prepaid Streetlights Block 5 Rate per kwh",
  "Prepaid Recreational Parks VAT or GST Rate",
  "Prepaid Recreational Parks Fixed Monthly Charge",
  "Prepaid Recreational Parks Block 1 Rate per kwh",
  "Prepaid Recreational Parks Block 1 Limit",
  "Prepaid Recreational Parks Block 2 Rate per kwh",
  "Prepaid Recreational Parks Block 2 Limit",
  "Prepaid Recreational Parks Block 3 Rate per kwh",
  "Prepaid Recreational Parks Block 3 Limit",
  "Prepaid Recreational Parks Block 4 Rate per kwh",
  "Prepaid Recreational Parks Block 4 Limit",
  "Prepaid Recreational Parks Block 5 Rate per kwh",
  "Prepaid Others VAT or GST Rate",
  "Prepaid Others Fixed Monthly Charge",
  "Prepaid Others Block 1 Rate per kwh",
  "Prepaid Others Block 1 Limit",
  "Prepaid Others Block 2 Rate per kwh",
  "Prepaid Others Block 2 Limit",
  "Prepaid Others Block 3 Rate per kwh",
  "Prepaid Others Block 3 Limit",
  "Prepaid Others Block 4 Rate per kwh",
  "Prepaid Others Block 4 Limit",
  "Prepaid Others Block 5 Rate per kwh",
  "Postpaid Residential VAT or GST Rate",
  "Postpaid Residential Fixed Monthly Charge",
  "Postpaid Residential Block 1 Rate per kwh",
  "Postpaid Residential Block 1 Limit",
  "Postpaid Residential Block 2 Rate per kwh",
  "Postpaid Residential Block 2 Limit",
  "Postpaid Residential Block 3 Rate per kwh",
  "Postpaid Residential Block 3 Limit",
  "Postpaid Residential Block 4 Rate per kwh",
  "Postpaid Residential Block 4 Limit",
  "Postpaid Residential Block 5 Rate per kwh",
  "Postpaid Commercial VAT or GST Rate",
  "Postpaid Commercial Fixed Monthly Charge",
  "Postpaid Commercial Block 1 Rate per kwh",
  "Postpaid Commercial Block 1 Limit",
  "Postpaid Commercial Block 2 Rate per kwh",
  "Postpaid Commercial Block 2 Limit",
  "Postpaid Commercial Block 3 Rate per kwh",
  "Postpaid Commercial Block 3 Limit",
  "Postpaid Commercial Block 4 Rate per kwh",
  "Postpaid Commercial Block 4 Limit",
  "Postpaid Commercial Block 5 Rate per kwh",
  "Postpaid Industrial VAT or GST Rate",
  "Postpaid Industrial Fixed Monthly Charge",
  "Postpaid Industrial Block 1 Rate per kwh",
  "Postpaid Industrial Block 1 Limit",
  "Postpaid Industrial Block 2 Rate per kwh",
  "Postpaid Industrial Block 2 Limit",
  "Postpaid Industrial Block 3 Rate per kwh",
  "Postpaid Industrial Block 3 Limit",
  "Postpaid Industrial Block 4 Rate per kwh",
  "Postpaid Industrial Block 4 Limit",
  "Postpaid Industrial Block 5 Rate per kwh",
  "Postpaid Government VAT or GST Rate",
  "Postpaid Government Fixed Monthly Charge",
  "Postpaid Government Block 1 Rate per kwh",
  "Postpaid Government Block 1 Limit",
  "Postpaid Government Block 2 Rate per kwh",
  "Postpaid Government Block 2 Limit",
  "Postpaid Government Block 3 Rate per kwh",
  "Postpaid Government Block 3 Limit",
  "Postpaid Government Block 4 Rate per kwh",
  "Postpaid Government Block 4 Limit",
  "Postpaid Government Block 5 Rate per kwh",
  "Postpaid Streetlights VAT or GST Rate",
  "Postpaid Streetlights Fixed Monthly Charge",
  "Postpaid Streetlights Block 1 Rate per kwh",
  "Postpaid Streetlights Block 1 Limit",
  "Postpaid Streetlights Block 2 Rate per kwh",
  "Postpaid Streetlights Block 2 Limit",
  "Postpaid Streetlights Block 3 Rate per kwh",
  "Postpaid Streetlights Block 3 Limit",
  "Postpaid Streetlights Block 4 Rate per kwh",
  "Postpaid Streetlights Block 4 Limit",
  "Postpaid Streetlights Block 5 Rate per kwh",
  "Postpaid Recreational Parks VAT or GST Rate",
  "Postpaid Recreational Parks Fixed Monthly Charge",
  "Postpaid Recreational Parks Block 1 Rate per kwh",
  "Postpaid Recreational Parks Block 1 Limit",
  "Postpaid Recreational Parks Block 2 Rate per kwh",
  "Postpaid Recreational Parks Block 2 Limit",
  "Postpaid Recreational Parks Block 3 Rate per kwh",
  "Postpaid Recreational Parks Block 3 Limit",
  "Postpaid Recreational Parks Block 4 Rate per kwh",
  "Postpaid Recreational Parks Block 4 Limit",
  "Postpaid Recreational Parks Block 5 Rate per kwh",
  "Postpaid Other Customer Group",
  "Postpaid Other VAT or GST Rate",
  "Postpaid Other Fixed Monthly Charge",
  "Postpaid Other Block 1 Rate per kwh",
  "Postpaid Other Block 1 Limit",
  "Postpaid Other Block 2 Rate per kwh",
  "Postpaid Other Block 2 Limit",
  "Postpaid Other Block 3 Rate per kwh",
  "Postpaid Other Block 3 Limit",
  "Postpaid Other Block 4 Rate per kwh",
  "Postpaid Other Block 4 Limit",
  "Postpaid Other Block 5 Rate per kwh",
];

// p2 catalogue ids for the tariff dimensions p1 resolves each label against.
const PAYMENT_MODE_IDS: Record<string, number> = {
  Prepaid: 721,
  Postpaid: 722,
};
const CUSTOMER_TYPE_IDS: Record<string, number> = {
  Residential: 691,
  Commercial: 692,
  Industrial: 693,
  Government: 694,
  Streetlights: 695,
  "Recreational Parks": 696,
  Others: 697,
  Other: 697,
};
const BLOCK_IDS: Record<string, number> = {
  "Block 1": 1006,
  "Block 2": 1007,
  "Block 3": 1008,
  "Block 4": 1009,
  "Block 5": 1010,
};
const ALL_CONSUMPTION_BAND_ID = 1005;

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const inputDefs = await db
    .select()
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.measures_subgroup_id, 232),
      ),
    );
  const measureIdBySuffix: Record<string, number> = {};
  for (const d of inputDefs) {
    if (d.name.startsWith("Tariff VAT")) measureIdBySuffix["VAT or GST Rate"] = d.id;
    else if (d.name.startsWith("Tariff Fixed"))
      measureIdBySuffix["Fixed Monthly Charge"] = d.id;
    else if (d.name.includes("Rate per kwh"))
      measureIdBySuffix["Rate per kwh"] = d.id;
    else if (d.name.includes("Limit")) measureIdBySuffix["Limit"] = d.id;
  }

  const entries = await db
    .select()
    .from(dataEntries)
    .where(
      and(
        inArray(dataEntries.measure_def_id, inputDefs.map((d) => d.id)),
        eq(dataEntries.is_deleted, false),
      ),
    );
  const rps = await db
    .select()
    .from(reportPeriods)
    .where(publishedPeriodCondition);
  const allSa = await db
    .select()
    .from(serviceAreas)
    .where(eq(serviceAreas.is_active, true));
  const allUtils = await db
    .select()
    .from(organisations)
    .where(eq(organisations.is_active, true));
  const allCountries = await db.select().from(countries);
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));
  const exchangeRates = await getAllExchangeRates();

  const utilsMap = new Map(allUtils.map((u) => [u.id, u]));
  const countriesMap = new Map(allCountries.map((c) => [c.id, c]));
  const itemsById = new Map(allItems.map((i) => [i.id, i.name]));
  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  function coordinateFor(label: string): {
    paymentModeId: number;
    customerTypeId: number;
    bandId: number;
    measureId: number | null;
  } | null {
    const payment = label.startsWith("Prepaid") ? "Prepaid" : "Postpaid";
    const paymentModeId = PAYMENT_MODE_IDS[payment];
    let rest = label.slice(payment.length + 1);
    let customerTypeId: number | undefined;
    for (const [name, id] of Object.entries(CUSTOMER_TYPE_IDS)) {
      if (rest === name || rest.startsWith(`${name} `)) {
        customerTypeId = id;
        rest = rest.slice(name.length + 1);
        break;
      }
    }
    if (!customerTypeId) return null;
    const blockMatch = rest.match(/Block ([1-5])/);
    const bandId = blockMatch
      ? BLOCK_IDS[`Block ${blockMatch[1]}`]
      : ALL_CONSUMPTION_BAND_ID;
    let measureId: number | null = null;
    for (const [suffix, id] of Object.entries(measureIdBySuffix)) {
      if (rest.endsWith(suffix)) {
        measureId = id;
        break;
      }
    }
    return { paymentModeId, customerTypeId, bandId, measureId };
  }

  const valMap = new Map<string, (typeof entries)[number]>();
  for (const e of entries) {
    const key = `${e.report_period_id}:${e.service_area_id}:${e.measure_def_id}:${e.payment_mode_id}:${e.customer_type_id}:${e.consumption_band_id}`;
    valMap.set(key, e);
  }
  const findValue = (rpId: number, saId: number, label: string) => {
    const c = coordinateFor(label);
    if (!c || c.measureId == null) return null;
    const entry = valMap.get(
      `${rpId}:${saId}:${c.measureId}:${c.paymentModeId}:${c.customerTypeId}:${c.bandId}`,
    );
    if (!entry || entry.value_numeric == null) return null;
    return Number(entry.value_numeric);
  };

  const rateMeasurementId = measureIdBySuffix["Rate per kwh"];
  const unitName =
    itemsById.get(
      inputDefs.find((d) => d.id === rateMeasurementId)?.unit_id ?? 0,
    ) ?? "Currency";

  return Response.json(
    rps
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
          ReportPeriodId: r.id,
          UtilityId: r.utility_id,
          Currency: currency,
          UsdExchangeRate: fxRate,
          Data: allSa
            .filter((sa) => sa.utility_id === r.utility_id)
            .map((sa) => {
              const row: Record<string, unknown> = { ServiceAreaId: sa.id };
              for (let i = 0; i < TARIFF_LABEL.length; i++) {
                const label = TARIFF_LABEL[i];
                const value = findValue(r.id, sa.id, label);
                const usd =
                  typeof value === "number" && Number.isFinite(value)
                    ? value / fxRate
                    : 0;
                row[label] = value;
                if (i === 0) {
                  // p1 interleaves the unit/multiplier columns right after the
                  // first tariff label; both carry the LAST label's values.
                  row.Unit = unitName;
                  const lastEntry = valMap.get(
                    `${r.id}:${sa.id}:${rateMeasurementId}:722:697:${BLOCK_IDS["Block 5"]}`,
                  );
                  row.Multiplier = lastEntry?.multiplier || "Ones";
                }
                row[`${label} USD`] = usd;
              }
              return row;
            }),
        };
      }),
  );
}