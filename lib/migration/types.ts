/**
 * Migration input contract.
 *
 * Per the 2026-07-23 decision, the customer's extract is ALREADY RESOLVED to p2 ids — it carries
 * `measure_id` + the 10 dimension member ids + the physical grain directly (the p1→p2 map did that
 * resolution during extraction). `report_period_id` and all grain ids are unchanged p1↔p2, so the
 * loader does NO map / period / grain resolution — it validates and inserts.
 *
 * Relevance and values arrive in ONE file: each row is an expected shell; a row carrying a value is
 * a filled shell, a row without is an empty (awaiting-entry) shell.
 *
 * Separately, the p1→p2 map (map.ts / MapEntry) is still used to regenerate `input_dl_def_mappings`
 * for the legacy fact API — not in this load path.
 */
import type { NoDataReason } from "@/db/schema/dataEntry";

/** The ten canonical dimensions, as managed_list_items member ids. */
export interface DimensionMembers {
  provider: number;
  type: number;
  source: number;
  resource_type: number;
  customer_type: number;
  payment_mode: number;
  band: number;
  division: number;
  gender: number;
  utility_function: number;
}

/** One row of the p1→p2 map (dl_def → measure + dims). Used only for fact-API crosswalk regen. */
export interface MapEntry {
  dlDefId: number;
  dlDefName: string;
  measureId: number;
  dims: DimensionMembers;
}

export type ValueType = "numeric" | "boolean" | "text" | "option";

/**
 * One extract row = one expected shell, pre-resolved to p2 ids. Carries the address (period +
 * measure + 10 dims + grain) and, optionally, a typed value. All ids are p2-valid and unchanged
 * from p1. Grain ids are null at higher levels (utility-level → serviceArea/resource null, etc.).
 */
export interface ExtractRow {
  // migration-only reference: the customer's own unique id for this source row. NOT persisted to
  // data_entries — carried into migration_rejections.source_ref so any rejection traces straight
  // back to the exact source row.
  sourceRowId?: string | null;
  reportPeriodId: number; // same id in p1 and p2
  measureId: number;
  dims: DimensionMembers;
  // physical grain (nullable at higher levels)
  utilityId?: number | null;
  serviceAreaId?: number | null;
  powerStationId?: number | null;
  unitId?: number | null;
  countryId?: number | null;
  // value — present = filled shell, absent = empty shell
  valueType?: ValueType | null;
  value?: number | boolean | string | null; // option: the managed_list_items id
  // answer availability — a "no value, but here's why" answer. Mutually exclusive with value
  // (data_entries.chk_value_xor_nodata). One of NO_DATA_REASONS.
  noDataReason?: NoDataReason | null; // → data_entries.no_data_reason
  statusId?: number | null; // optional explicit status; else derived (filled/no-data→Entered, empty→Pending)
  // p1 provenance (all optional) — the original data-entry person, time, and note.
  updatedById?: string | null; // → data_entries.updated_by_id (a p2-valid user.id; unresolved → nulled + logged)
  updatedAt?: string | null; // → data_entries.updated_at (the ORIGINAL entry time; preserved, not overwritten)
  comment?: string | null; // → wrapped into data_entries.comments as one DataEntryComment by the original person
}
