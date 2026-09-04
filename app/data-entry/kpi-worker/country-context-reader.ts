import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/connection";
import { countryContext } from "@/db/schema/country";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";

import { asNumber } from "./dimension-rollup";

/**
 * Reads the national reference figures that back `is_context_fed` measures
 * (Population, GDP per Capita, …). These live in `country_context`
 * (country × metric × source_date), never in `data_entries`, and are
 * dimensionless — every utility in a country resolves to the same value.
 *
 * The as-of rule: for the period's country, carry forward the latest
 * `source_date` at or before the period's `report_date`. A `no_data_reason`
 * row resolves to `null`.
 *
 * This is the kpi-worker's targeted counterpart to the Power BI bridge
 * `lib/legacy/context-data.ts` (`getResolvedContextRows`), which applies the
 * same carry-forward rule across every period at once for the fact routes.
 */
export interface CountryContextReader {
  /**
   * National as-of value per measure for the period's country.
   * `null` = the figure exists but is unavailable / non-numeric;
   * a missing key = no figure for that measure/country/date.
   */
  valuesForPeriod(
    measureIds: number[],
    reportPeriodId: number,
  ): Promise<Map<number, number | null>>;
}

export interface CountryContextRow {
  measureId: number;
  sourceDate: Date;
  value: string | null;
  noDataReason: string | null;
}

/**
 * The as-of carry-forward, pure: for each metric keep the latest `sourceDate`
 * at or before `reportDate`; a `noDataReason` row resolves to `null`.
 */
export const carryForwardContextValues = (
  rows: CountryContextRow[],
  reportDate: Date,
): Map<number, number | null> => {
  const reportTime = reportDate.getTime();
  const best = new Map<
    number,
    { time: number; value: string | null; noData: string | null }
  >();

  for (const row of rows) {
    const time = row.sourceDate.getTime();
    if (time > reportTime) continue;
    const current = best.get(row.measureId);
    if (!current || time > current.time) {
      best.set(row.measureId, {
        time,
        value: row.value,
        noData: row.noDataReason,
      });
    }
  }

  const out = new Map<number, number | null>();
  for (const [measureId, pick] of best) {
    out.set(measureId, pick.noData ? null : asNumber(pick.value));
  }
  return out;
};

export class DbCountryContextReader implements CountryContextReader {
  async valuesForPeriod(
    measureIds: number[],
    reportPeriodId: number,
  ): Promise<Map<number, number | null>> {
    const out = new Map<number, number | null>();
    if (measureIds.length === 0) return out;

    const [period] = await db
      .select({
        utilityId: reportPeriods.utility_id,
        reportDate: reportPeriods.report_date,
      })
      .from(reportPeriods)
      .where(eq(reportPeriods.id, reportPeriodId))
      .limit(1);
    if (!period) return out;

    const [org] = await db
      .select({ countryId: organisations.country_id })
      .from(organisations)
      .where(eq(organisations.id, period.utilityId))
      .limit(1);

    const countryId = org?.countryId ?? null;
    if (countryId == null) return out;

    const rows = await db
      .select({
        measureId: countryContext.measure_def_id,
        sourceDate: countryContext.source_date,
        value: countryContext.value,
        noDataReason: countryContext.no_data_reason,
      })
      .from(countryContext)
      .where(
        and(
          eq(countryContext.country_id, countryId),
          inArray(countryContext.measure_def_id, measureIds),
        ),
      );

    return carryForwardContextValues(rows, period.reportDate);
  }
}
