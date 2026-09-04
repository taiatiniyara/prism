import {
  type CountryContextReader,
} from "@/app/data-entry/kpi-worker/country-context-reader";
import type { RollupCandidate } from "@/app/data-entry/kpi-worker/dimension-rollup";
import {
  type DimensionedRow,
  type DimensionedRowsQuery,
  type FactSource,
  type MeasureMeta,
} from "@/app/data-entry/kpi-worker/fact-source";

/** Build a full DimensionedRow from a sparse spec (unset dims → null). */
export const dimRow = (
  measureDefId: number,
  over: Partial<RollupCandidate> = {},
): DimensionedRow => ({
  measureDefId,
  value: "1",
  isDeleted: false,
  isRelevant: true,
  energyProviderId: null,
  energyTypeId: null,
  energySourceId: null,
  unitTypeId: null,
  customerTypeId: null,
  paymentModeId: null,
  consumptionBandId: null,
  divisionId: null,
  genderId: null,
  utilityFunctionId: null,
  grainAreaId: null,
  grainStationId: null,
  grainUnitId: null,
  ...over,
});

/**
 * In-memory FactSource. `dimensionedRows` mirrors DbFactSource: it pre-filters
 * to the queried measures, `is_deleted = false`, `is_relevant = true`, and the
 * scope grain (a pinned service area still admits its null-area fallback rows).
 */
export class InMemoryFactSource implements FactSource {
  constructor(
    private readonly meta: Map<number, MeasureMeta>,
    private readonly rows: DimensionedRow[],
  ) {}

  async measureMeta(measureIds: number[]): Promise<Map<number, MeasureMeta>> {
    return new Map(
      measureIds
        .filter((id) => this.meta.has(id))
        .map((id) => [id, this.meta.get(id)!]),
    );
  }

  async dimensionedRows(
    query: DimensionedRowsQuery,
  ): Promise<DimensionedRow[]> {
    return this.rows.filter(
      (row) =>
        query.measureIds.includes(row.measureDefId) &&
        !row.isDeleted &&
        row.isRelevant &&
        (query.serviceAreaId == null ||
          row.grainAreaId === query.serviceAreaId ||
          row.grainAreaId == null) &&
        (query.unitId == null || row.grainUnitId === query.unitId),
    );
  }
}

/** In-memory CountryContextReader — a fixed value per measure id. */
export class InMemoryCountryContextReader implements CountryContextReader {
  constructor(private readonly values: Map<number, number | null>) {}

  async valuesForPeriod(
    measureIds: number[],
  ): Promise<Map<number, number | null>> {
    return new Map(
      [...this.values].filter(([id]) => measureIds.includes(id)),
    );
  }
}
