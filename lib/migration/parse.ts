/**
 * Workbook parsers for the migration CLI (scripts/migrate.ts).
 *
 *   - parseControlTotalsWorkbook — the p1 control-totals sheet. This template is OURS
 *     (scripts/gen-control-totals-template.ts), so its columns are known exactly.
 *   - parseExtractWorkbook — the customer's p1→p2 extract (already resolved to p2 ids,
 *     see types.ts). Its exact column headers are the CUSTOMER's, so the header map
 *     `EXTRACT_COLUMNS` below is the ONE place to adjust when the real sample arrives.
 *
 * Both return their good rows plus a list of ParseErrors — structural problems caught
 * before load (missing required id, bad value_type, value without a type). Parse errors
 * are REPORTED, never silently dropped; DB-level rejections are handled later by the
 * loader's migration_rejections ledger.
 */
import ExcelJS from "exceljs";

import { NO_DATA_REASONS, type NoDataReason } from "@/db/schema/dataEntry";
import type { ControlTotals } from "./loads";
import type { ExtractRow, ValueType } from "./types";

export interface ParseError {
  sheet: string;
  row: number; // 1-based worksheet row number
  field: string;
  reason: string;
  raw?: unknown;
}

export interface ParseResult<T> {
  rows: T[];
  errors: ParseError[];
}

const VALUE_TYPES: ReadonlySet<string> = new Set([
  "numeric",
  "boolean",
  "text",
  "option",
]);

const NO_DATA_REASON_SET: ReadonlySet<string> = new Set(NO_DATA_REASONS);

/** Extract the primitive value from an ExcelJS cell (formulas, rich text, hyperlinks). */
function cellValue(v: ExcelJS.CellValue): string | number | boolean | null {
  if (v == null) return null;
  if (typeof v === "object") {
    if ("result" in v) return cellValue((v as { result: ExcelJS.CellValue }).result);
    if ("text" in v) return String((v as { text: unknown }).text);
    if ("richText" in v)
      return (v as { richText: { text: string }[] }).richText
        .map((r) => r.text)
        .join("");
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return null;
  }
  return v as string | number | boolean;
}

/** Map header text -> 1-based column number for a worksheet's first row. */
function headerIndex(ws: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const h = cellValue(cell.value);
    if (h != null && String(h).trim() !== "")
      idx.set(String(h).trim().toLowerCase(), col);
  });
  return idx;
}

function toInt(v: string | number | boolean | null): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isInteger(n) ? n : Number.isFinite(n) ? Math.trunc(n) : null;
}

// ---------------------------------------------------------------------------
// Control totals — exact, known template (gen-control-totals-template.ts)
// ---------------------------------------------------------------------------
export async function parseControlTotalsWorkbook(
  path: string,
): Promise<ParseResult<ControlTotals>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet("control_totals") ?? wb.worksheets[0];
  const sheet = ws.name;
  const h = headerIndex(ws);
  const rows: ControlTotals[] = [];
  const errors: ParseError[] = [];

  const cell = (r: ExcelJS.Row, key: string) => {
    const col = h.get(key);
    return col ? cellValue(r.getCell(col).value) : null;
  };

  ws.eachRow((r, rowNumber) => {
    if (rowNumber === 1) return; // header
    const p1 = toInt(cell(r, "p1_report_period_id"));
    if (p1 == null) return; // blank line or the italic EXAMPLE row — skip silently
    const num = (key: string): number => {
      const val = toInt(cell(r, key));
      if (val == null)
        errors.push({ sheet, row: rowNumber, field: key, reason: "missing/non-numeric" });
      return val ?? 0;
    };
    // values_calculated is EXCLUDED from the migration and from the balance tallies (RAW-ONLY: p2
    // recomputes calculated/KPI values). It is informational-only, so it is OPTIONAL — a blank or
    // absent column is treated as 0 with no parse error.
    const optNum = (key: string): number => toInt(cell(r, key)) ?? 0;
    const sumRaw = cell(r, "sum_value_numeric");
    rows.push({
      p1ReportPeriodId: p1,
      reportPeriodId: p1, // report_period_id is unchanged p1<->p2 (types.ts)
      periodLabel: (cell(r, "period_label") as string) ?? undefined,
      relevanceRecords: num("relevance_records"),
      valuesNumeric: num("values_numeric"),
      valuesBoolean: num("values_boolean"),
      valuesText: num("values_text"),
      valuesOption: num("values_option"),
      sumValueNumeric: sumRaw == null ? 0 : Number(String(sumRaw).replace(/,/g, "")),
      valuesNoncalcUnfiltered: num("values_noncalc_unfiltered"),
      valuesCalculated: optNum("values_calculated"), // optional/info-only — excluded from tallies
    });
  });
  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Extract — CUSTOMER's file. EXTRACT_COLUMNS is the one spot to adjust to the
// real sample's headers (each logical field -> accepted header aliases, lower-case).
// ---------------------------------------------------------------------------
const EXTRACT_COLUMNS = {
  reportPeriodId: ["report_period_id", "reportperiodid", "period_id"],
  measureId: ["measure_id", "measure_def_id", "measureid"],
  provider: ["provider_id", "provider_id", "provider"],
  type: ["category_id", "type_id", "type"],
  source: ["technology_id", "source_id", "source"],
  resource_type: ["asset_class_id", "resource_type_id", "resource_type"],
  customer_type: ["customer_type_id", "customer_id", "customer_type"],
  payment_mode: ["payment_mode_id", "paymode_id", "payment_mode"],
  band: ["consumption_band_id", "band_id", "band"],
  division: ["division_id", "division"],
  gender: ["gender_id", "gender"],
  utility_function: ["utility_function_id", "function_id", "utility_function"],
  utilityId: ["utility_id", "utility"],
  serviceAreaId: ["service_area_id", "service_area"],
  powerStationId: ["power_station_id", "power_station"],
  unitId: ["unit_id", "energy_resource"],
  countryId: ["country_id", "country"],
  valueType: ["value_type", "valuetype"],
  value: ["value"],
  // answer availability (optional; mutually exclusive with value)
  noDataReason: ["no_data_reason", "no_data", "nodata_reason", "availability"],
  statusId: ["status_id", "status"],
  // p1 provenance (optional)
  updatedById: ["updated_by_id", "entered_by_id", "entered_by", "data_entry_user_id", "user_id"],
  updatedAt: ["updated_at", "update_date", "entered_at", "entry_date", "date_entered"],
  comment: ["comment", "comments", "note", "notes"],
} as const;

type ExtractField = keyof typeof EXTRACT_COLUMNS;
const DIM_FIELDS: ExtractField[] = [
  "provider", "type", "source", "resource_type", "customer_type",
  "payment_mode", "band", "division", "gender", "utility_function",
];

export async function parseExtractWorkbook(
  path: string,
  opts?: { limit?: number },
): Promise<ParseResult<ExtractRow>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  const sheet = ws.name;
  const h = headerIndex(ws);
  const rows: ExtractRow[] = [];
  const errors: ParseError[] = [];

  // Resolve each logical field to a present column (first matching alias).
  const colOf = new Map<ExtractField, number>();
  for (const field of Object.keys(EXTRACT_COLUMNS) as ExtractField[]) {
    for (const alias of EXTRACT_COLUMNS[field]) {
      const col = h.get(alias);
      if (col) {
        colOf.set(field, col);
        break;
      }
    }
  }
  // Fail fast on missing required columns (adjust EXTRACT_COLUMNS to the real headers).
  const required: ExtractField[] = ["reportPeriodId", "measureId", ...DIM_FIELDS];
  const missingCols = required.filter((f) => !colOf.has(f));
  if (missingCols.length) {
    errors.push({
      sheet,
      row: 1,
      field: missingCols.join(", "),
      reason:
        "required column(s) not found in the extract header — adjust EXTRACT_COLUMNS in lib/migration/parse.ts to the real headers",
    });
    return { rows, errors };
  }

  const get = (r: ExcelJS.Row, field: ExtractField) => {
    const col = colOf.get(field);
    return col ? cellValue(r.getCell(col).value) : null;
  };
  // text getter (trimmed, null when empty)
  const getStr = (r: ExcelJS.Row, field: ExtractField): string | null => {
    const v = get(r, field);
    const s = v == null ? "" : String(v).trim();
    return s === "" ? null : s;
  };
  // timestamp getter — preserve full ISO from a Date cell (cellValue truncates Dates to a date)
  const getTs = (r: ExcelJS.Row, field: ExtractField): string | null => {
    const col = colOf.get(field);
    if (!col) return null;
    const raw = r.getCell(col).value;
    if (raw instanceof Date) return raw.toISOString();
    return getStr(r, field);
  };

  let dataRows = 0;
  ws.eachRow((r, rowNumber) => {
    if (rowNumber === 1) return;
    if (opts?.limit != null && dataRows >= opts.limit) return;
    // treat a row with no period id as blank
    const reportPeriodId = toInt(get(r, "reportPeriodId"));
    const measureId = toInt(get(r, "measureId"));
    if (reportPeriodId == null && measureId == null) return;
    dataRows += 1;

    let bad = false;
    const reqInt = (field: ExtractField): number => {
      const val = toInt(get(r, field));
      if (val == null) {
        errors.push({ sheet, row: rowNumber, field, reason: "required id missing/non-numeric", raw: get(r, field) });
        bad = true;
      }
      return val ?? 0;
    };

    const dims = {
      provider: reqInt("provider"),
      type: reqInt("type"),
      source: reqInt("source"),
      resource_type: reqInt("resource_type"),
      customer_type: reqInt("customer_type"),
      payment_mode: reqInt("payment_mode"),
      band: reqInt("band"),
      division: reqInt("division"),
      gender: reqInt("gender"),
      utility_function: reqInt("utility_function"),
    };
    const rowReportPeriodId = reqInt("reportPeriodId");
    const rowMeasureId = reqInt("measureId");

    // value routing: value present ⇒ value_type required and valid
    const rawValue = get(r, "value");
    const rawType = get(r, "valueType");
    let valueType: ValueType | null = null;
    let value: number | boolean | string | null = null;
    if (rawValue != null && rawValue !== "") {
      const t = rawType == null ? "" : String(rawType).trim().toLowerCase();
      if (!VALUE_TYPES.has(t)) {
        errors.push({ sheet, row: rowNumber, field: "value_type", reason: `value present but value_type is "${rawType ?? ""}" (want numeric|boolean|text|option)`, raw: rawType });
        bad = true;
      } else {
        valueType = t as ValueType;
        value = rawValue;
      }
    }

    // answer availability: no_data_reason (optional). Must be in the vocab, and mutually exclusive
    // with a value (mirrors data_entries.chk_value_xor_nodata). The measure-level mandatory gate
    // (reject asserted_not_applicable on is_mandatory=true) is enforced in the loader, which knows
    // is_mandatory.
    const rawNoData = getStr(r, "noDataReason");
    let noDataReason: NoDataReason | null = null;
    if (rawNoData != null) {
      const nd = rawNoData.trim().toLowerCase();
      if (!NO_DATA_REASON_SET.has(nd)) {
        errors.push({ sheet, row: rowNumber, field: "no_data_reason", reason: `no_data_reason "${rawNoData}" not in (${[...NO_DATA_REASON_SET].join(" | ")})`, raw: rawNoData });
        bad = true;
      } else if (value != null) {
        errors.push({ sheet, row: rowNumber, field: "no_data_reason", reason: "a row cannot carry BOTH a value and no_data_reason (value XOR no-data)", raw: rawNoData });
        bad = true;
      } else {
        noDataReason = nd as NoDataReason;
      }
    }

    if (bad) return; // reported above; don't emit a malformed ExtractRow
    rows.push({
      reportPeriodId: rowReportPeriodId,
      measureId: rowMeasureId,
      dims,
      utilityId: toInt(get(r, "utilityId")),
      serviceAreaId: toInt(get(r, "serviceAreaId")),
      powerStationId: toInt(get(r, "powerStationId")),
      unitId: toInt(get(r, "unitId")),
      countryId: toInt(get(r, "countryId")),
      noDataReason,
      valueType,
      value,
      statusId: toInt(get(r, "statusId")),
      updatedById: getStr(r, "updatedById"),
      updatedAt: getTs(r, "updatedAt"),
      comment: getStr(r, "comment"),
    });
  });

  return { rows, errors };
}
