import { db } from "@/db/connection";
import { countries } from "@/db/schema/country";
import { organisations } from "@/db/schema/utility";
import {
  reportPeriods,
  publishedPeriodCondition,
} from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { getResolvedContextRows } from "@/lib/legacy/context-data";

// Power BI column labels (measure name -> legacy semantic-model name).
const COUNTRY_CONTEXT_COLUMN_LABELS: Record<string, string> = {
  "IATA Air Connectivity per 1000 People": "Air Connectivity per 1000 People",
  "IATA Air Connectivity per Unit GDP": "Air Connectivity per Unit GDP",
};

// Emission order mirrors prism-training's /api/factCountryContextData.
const COUNTRY_CONTEXT_COLUMN_ORDER = [
  "Fuel Supply Access",
  "Fuel Pricing Regulation",
  "Access to Electricity",
  "Unemployment Rate",
  "Inflation Rate",
  "GDP Per Capita",
  "Average Household Size",
  "Households",
  "Rural Population",
  "Urban Population",
  "Population",
  "Air Connectivity per Unit GDP",
  "Air Connectivity per 1000 People",
  "IATA Air Connectivity Score",
  "Islands",
  "Land Area",
];

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const ctxRows = await getResolvedContextRows(221);
  const rps = await db
    .select()
    .from(reportPeriods)
    .where(publishedPeriodCondition);
  const allUtils = await db
    .select()
    .from(organisations)
    .where(
      and(
        eq(organisations.is_utility, true),
        eq(organisations.is_active, true),
      ),
    );
  const allCountries = await db.select().from(countries);
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const uMap = new Map(allUtils.map((u) => [u.id, u]));
  const cMap = new Map(allCountries.map((c) => [c.id, c]));
  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  return Response.json(
    rps.flatMap((urp) => {
      const u = uMap.get(urp.utility_id);
      const country = u ? cMap.get(u.country_id) : undefined;
      const ccData = ctxRows
        .filter(
          (r) =>
            r.report_period_id === urp.id &&
            r.country_id === (country?.id ?? -1),
        )
        .reduce(
          (acc, r) => {
            const label =
              COUNTRY_CONTEXT_COLUMN_LABELS[r.measureName] ?? r.measureName;
            let value: unknown = r.value;
            if (typeof value === "string") {
              const num = Number(value);
              if (!Number.isNaN(num)) value = num;
            }
            acc[label] = value;
            return acc;
          },
          {} as Record<string, unknown>,
        );
      const orderedCc: Record<string, unknown> = {};
      for (const col of COUNTRY_CONTEXT_COLUMN_ORDER) {
        if (col in ccData) orderedCc[col] = ccData[col];
      }
      for (const col of Object.keys(ccData)) {
        if (!(col in orderedCc)) orderedCc[col] = ccData[col];
      }
      const reportType = findItem(urp.report_type_id)?.name;
      // Emit the report period's own date exactly as stored in report_periods
      // (the column is a naive timestamp; format its local components so the
      // value matches the table, with no time/timezone artifacts).
      const d =
        typeof urp.report_date === "string"
          ? new Date(urp.report_date)
          : urp.report_date;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return [
        {
          ReportType: reportType,
          ReportPeriod: `${y}-${m}-${day}`,
          ReportPeriodId: urp.id,
          CountryId: country?.id,
          AlphaCode2: country?.iso_code_alpha2,
          AlphaCode3: country?.iso_code_alpha3,
          UtilityId: u?.id,
          ...orderedCc,
        },
      ];
    }),
  );
}
