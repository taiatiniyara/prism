import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";
import type { MapEntry, DimensionMembers } from "./types";

/**
 * Loads and validates the p1→p2 dl_def → (measure + dimension tuple) map from the xlsx the
 * customer maintains. Only MAPPED rows (a numeric measure_id) are returned; unmapped rows
 * (blank / #N/A) are intentional exclusions and reported as a count.
 */

// map-file column -> canonical dimension (customer_type was p1 "tariff_type", since renamed)
const DIM_COLUMNS: Record<keyof DimensionMembers, string> = {
  provider: "provider_id",
  type: "category_id",
  source: "technology_id",
  resource_type: "asset_class_id",
  customer_type: "customer_type_id",
  payment_mode: "payment_mode_id",
  band: "consumption_band_id",
  division: "division_id",
  gender: "gender_id",
  utility_function: "utility_function_id",
};

const cellNum = (v: ExcelJS.CellValue): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "object") return null; // formula error / rich object
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface LoadedMap {
  byDlDef: Map<number, MapEntry>;
  mappedCount: number;
  unmappedCount: number;
}

/** Read the map xlsx into a dl_def_id → MapEntry lookup. */
export async function loadMap(filePath: string): Promise<LoadedMap> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  const hdr = ws.getRow(1).values as ExcelJS.CellValue[];
  const idx = (name: string) => {
    const i = (hdr as any[]).indexOf(name);
    if (i < 0) throw new Error(`map is missing column "${name}"`);
    return i;
  };
  const cDl = idx("dl_def_id"), cName = idx("dl_def_name"), cMid = idx("measure_id");
  const dimIdx = Object.fromEntries(
    Object.entries(DIM_COLUMNS).map(([k, col]) => [k, idx(col)]),
  ) as Record<keyof DimensionMembers, number>;

  const byDlDef = new Map<number, MapEntry>();
  let unmapped = 0;
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const dlDefId = cellNum(r.getCell(cDl).value);
    if (dlDefId == null) continue;
    const measureId = cellNum(r.getCell(cMid).value);
    if (measureId == null) { unmapped++; continue; } // blank / #N/A = intentional exclusion
    const dims = {} as DimensionMembers;
    for (const k of Object.keys(DIM_COLUMNS) as (keyof DimensionMembers)[]) {
      dims[k] = cellNum(r.getCell(dimIdx[k]).value) ?? 0;
    }
    byDlDef.set(dlDefId, { dlDefId, dlDefName: String(r.getCell(cName).value ?? ""), measureId, dims });
  }
  return { byDlDef, mappedCount: byDlDef.size, unmappedCount: unmapped };
}

export interface MapValidationIssue {
  dlDefId: number;
  measureId: number;
  problem: string;
}

/**
 * Cross-check the loaded map against the DB: every measure_id exists, and every dimension member
 * id is a real managed_list_items row in the list that dimension expects. Returns a list of issues
 * (empty = clean). Run before a load so a bad map is caught up front, not per-row at insert time.
 */
export async function validateMap(map: LoadedMap): Promise<MapValidationIssue[]> {
  const issues: MapValidationIssue[] = [];
  const entries = [...map.byDlDef.values()];

  // 1. measures exist?
  const measureIds = [...new Set(entries.map((e) => e.measureId))];
  const existing = new Set(
    (((await db.execute(sql.raw(`SELECT id FROM measure_definitions WHERE id IN (${measureIds.join(",")})`))).rows ?? []) as any[]).map((r) => Number(r.id)),
  );
  for (const e of entries) if (!existing.has(e.measureId)) issues.push({ dlDefId: e.dlDefId, measureId: e.measureId, problem: `measure ${e.measureId} does not exist` });

  // 2. dimension members exist? (collect all distinct member ids across all dims, one lookup)
  const memberIds = new Set<number>();
  for (const e of entries) for (const k of Object.keys(DIM_COLUMNS) as (keyof DimensionMembers)[]) if (e.dims[k]) memberIds.add(e.dims[k]);
  const validMembers = new Set(
    (((await db.execute(sql.raw(`SELECT id FROM managed_list_items WHERE id IN (${[...memberIds].join(",") || "0"})`))).rows ?? []) as any[]).map((r) => Number(r.id)),
  );
  for (const e of entries) {
    for (const k of Object.keys(DIM_COLUMNS) as (keyof DimensionMembers)[]) {
      const m = e.dims[k];
      if (m && !validMembers.has(m)) issues.push({ dlDefId: e.dlDefId, measureId: e.measureId, problem: `${k} member ${m} not in managed_list_items` });
    }
  }
  return issues;
}
