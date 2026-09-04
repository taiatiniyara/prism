import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";

import type { RollupCandidate } from "./dimension-rollup";

/** One dimensioned `data_entries` row, tagged with the measure it belongs to. */
export interface DimensionedRow extends RollupCandidate {
  measureDefId: number;
}

export interface MeasureMeta {
  strataId: number | null;
  isContextFed: boolean;
}

export interface DimensionedRowsQuery {
  reportPeriodId: number;
  /** the non-context input measures to read from `data_entries` */
  measureIds: number[];
  /** pinned service-area scope, or null for the utility target */
  serviceAreaId: number | null;
  /** pinned unit scope, or null */
  unitId: number | null;
}

/**
 * The database seam for the fact resolver. Everything the resolver needs to
 * read lives behind this: the two implementations are `DbFactSource` (prod) and
 * `InMemoryFactSource` (tests). The rollup rules in `dimension-rollup.ts` are
 * pure and take the rows this returns.
 */
export interface FactSource {
  /** strata level + context-fed flag per input measure id. */
  measureMeta(measureIds: number[]): Promise<Map<number, MeasureMeta>>;

  /**
   * `data_entries` rows for `reportPeriodId` × `measureIds`, filtered to the
   * scope's grain, `is_deleted = false`, `is_relevant = true`, ordered newest
   * first (so the resolver's single-value path is deterministic). Each row's
   * `energyTypeId` is resolved from the technology's parent.
   */
  dimensionedRows(query: DimensionedRowsQuery): Promise<DimensionedRow[]>;
}

export class DbFactSource implements FactSource {
  async measureMeta(measureIds: number[]): Promise<Map<number, MeasureMeta>> {
    if (measureIds.length === 0) return new Map();
    const rows = await db
      .select({
        id: measureDefinitions.id,
        strataId: measureDefinitions.strata_id,
        isContextFed: measureDefinitions.is_context_fed,
      })
      .from(measureDefinitions)
      .where(inArray(measureDefinitions.id, measureIds));
    return new Map(
      rows.map((row) => [
        row.id,
        { strataId: row.strataId, isContextFed: Boolean(row.isContextFed) },
      ]),
    );
  }

  async dimensionedRows(
    query: DimensionedRowsQuery,
  ): Promise<DimensionedRow[]> {
    if (query.measureIds.length === 0) return [];

    const conditions: Array<
      ReturnType<typeof eq> | ReturnType<typeof isNull>
    > = [
      eq(dataEntries.report_period_id, query.reportPeriodId),
      inArray(dataEntries.measure_def_id, query.measureIds),
      eq(dataEntries.is_deleted, false),
      eq(dataEntries.is_relevant, true),
    ];

    if (query.serviceAreaId != null) {
      // Include global rows (null service area) as fallback for utility-level inputs.
      conditions.push(
        or(
          eq(dataEntries.service_area_id, query.serviceAreaId),
          isNull(dataEntries.service_area_id),
        )!,
      );
    }
    if (query.unitId != null) {
      conditions.push(eq(dataEntries.unit_id, query.unitId));
    }

    const rows = await db
      .select({
        measureDefId: dataEntries.measure_def_id,
        // Prefer the typed numeric column; fall back to the legacy `value`
        // varchar for rows not yet migrated to value_numeric (§4.8).
        value: sql<
          string | null
        >`coalesce(${dataEntries.value_numeric}::text, ${dataEntries.value})`,
        isDeleted: dataEntries.is_deleted,
        isRelevant: dataEntries.is_relevant,
        energyProviderId: dataEntries.provider_id,
        energySourceId: dataEntries.technology_id,
        unitTypeId: dataEntries.asset_class_id,
        customerTypeId: dataEntries.customer_type_id,
        paymentModeId: dataEntries.payment_mode_id,
        consumptionBandId: dataEntries.consumption_band_id,
        divisionId: dataEntries.division_id,
        genderId: dataEntries.gender_id,
        utilityFunctionId: dataEntries.utility_function_id,
        grainAreaId: dataEntries.service_area_id,
        grainStationId: dataEntries.power_station_id,
        grainUnitId: dataEntries.unit_id,
      })
      .from(dataEntries)
      .where(and(...conditions))
      .orderBy(desc(dataEntries.updatedAt));

    const technologyIds = [
      ...new Set(
        rows
          .map((row) => row.energySourceId)
          .filter((id): id is number => id != null),
      ),
    ];

    const parents =
      technologyIds.length > 0
        ? await db
            .select({
              id: managedListItems.id,
              parentId: managedListItems.parent_id,
            })
            .from(managedListItems)
            .where(inArray(managedListItems.id, technologyIds))
        : [];

    const energyTypeByTechnology = new Map<number, number | null>(
      parents.map((row) => [row.id, row.parentId ?? null]),
    );

    return rows.map((row) => ({
      ...row,
      energyTypeId:
        row.energySourceId != null
          ? (energyTypeByTechnology.get(row.energySourceId) ?? null)
          : null,
    }));
  }
}
