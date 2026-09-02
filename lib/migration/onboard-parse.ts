/**
 * New-organisation onboarding — Excel PARSER (pure; no DB import, so scripts/migrate.ts --dry-run
 * can validate the file's structure without a DATABASE_URL).
 *
 * Reads a workbook with up to three sheets — `organisations` / `service_areas` / `report_periods`,
 * linked by EXPLICIT p2 ids — into typed rows plus structural ParseErrors. Semantic + DB validation
 * (fye present for FY periods, ids exist, status vocabulary) and the actual inserts live in
 * ./onboard (onboardNewOrganisations). See docs/migration-new-organisation-format.md.
 */
import ExcelJS from "exceljs";

import type { ParseError } from "./parse";

// ---------------------------------------------------------------------------
// Row shapes (each carries _row = 1-based worksheet row for error attribution)
// ---------------------------------------------------------------------------
export interface NewOrgRow {
  _row: number;
  id: number | null;
  name: string | null;
  acronym: string | null;
  country_id: number | null;
  is_utility: boolean;
  fye_month: number | null;
  fye_day: number | null;
  is_mth_report_relevant: boolean;
  utility_type_id: number | null;
  utility_size_id: number | null;
  operating_basis_id: number | null;
  entity_type_id: number | null;
  accounting_standard_id: number | null;
  electricity_regulation_id: number | null;
  powerquality_standard_id: number | null;
  ppa_membership_type_id: number | null;
  services_provided_id: number | null;
  is_active: boolean;
  updated_date: string | null;
}

export interface NewServiceAreaRow {
  _row: number;
  id: number | null;
  utility_id: number | null;
  name: string | null;
  strata_id: number | null;
  provides_electricity: boolean;
  provides_water: boolean;
  provides_sanitation: boolean;
  operations_only: boolean;
  is_virtual: boolean;
  is_active: boolean;
}

export interface NewReportPeriodRow {
  _row: number;
  id: number | null;
  utility_id: number | null;
  report_type_id: number | null;
  fy_end_year: number | null;
  report_date: string | null; // explicit ISO date (non-FY periods)
  status: string | null;
  request_date: string | null;
  lean_mode: boolean;
  who_id: number | null;
}

export interface NewOrgFile {
  organisations: NewOrgRow[];
  serviceAreas: NewServiceAreaRow[];
  reportPeriods: NewReportPeriodRow[];
}

// ---------------------------------------------------------------------------
// Cell helpers (mirror lib/migration/parse.ts; kept local so parse.ts stays untouched)
// ---------------------------------------------------------------------------
function cellValue(v: ExcelJS.CellValue): string | number | boolean | null {
  if (v == null) return null;
  if (typeof v === "object") {
    if ("result" in v) return cellValue((v as { result: ExcelJS.CellValue }).result);
    if ("text" in v) return String((v as { text: unknown }).text);
    if ("richText" in v)
      return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return null;
  }
  return v as string | number | boolean;
}

function headerIndex(ws: ExcelJS.Worksheet): Map<string, number> {
  const idx = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const h = cellValue(cell.value);
    if (h != null && String(h).trim() !== "") idx.set(String(h).trim().toLowerCase(), col);
  });
  return idx;
}

function toInt(v: string | number | boolean | null): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isInteger(n) ? n : Number.isFinite(n) ? Math.trunc(n) : null;
}

function toBool(v: string | number | boolean | null, dflt: boolean): boolean {
  if (v == null || v === "") return dflt;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "y", "1", "x"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return dflt;
}

function toStr(v: string | number | boolean | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

/** Full-ISO timestamp getter — preserves time from a Date cell (cellValue truncates Dates to a date). */
function tsCell(ws: ExcelJS.Worksheet, rowNum: number, col: number | undefined): string | null {
  if (!col) return null;
  const raw = ws.getRow(rowNum).getCell(col).value;
  if (raw instanceof Date) return raw.toISOString();
  return toStr(cellValue(raw));
}

/** Resolve each logical field to a present column (first matching alias, lower-cased). */
function resolver(h: Map<string, number>, aliases: Record<string, string[]>): Map<string, number> {
  const colOf = new Map<string, number>();
  for (const [field, names] of Object.entries(aliases)) {
    for (const a of names) {
      const c = h.get(a);
      if (c) {
        colOf.set(field, c);
        break;
      }
    }
  }
  return colOf;
}

const ORG_ALIASES: Record<string, string[]> = {
  id: ["id", "org_id", "organisation_id", "organization_id"],
  name: ["name", "organisation", "organization", "org_name"],
  acronym: ["acronym", "code"],
  country_id: ["country_id", "country"],
  is_utility: ["is_utility", "utility"],
  fye_month: ["fye_month", "fy_end_month", "financial_year_end_month"],
  fye_day: ["fye_day", "fy_end_day", "financial_year_end_day"],
  is_mth_report_relevant: ["is_mth_report_relevant", "is_mth_reports_relevant", "monthly_reporting"],
  utility_type_id: ["utility_type_id"],
  utility_size_id: ["utility_size_id"],
  operating_basis_id: ["operating_basis_id"],
  entity_type_id: ["entity_type_id"],
  accounting_standard_id: ["accounting_standard_id"],
  electricity_regulation_id: ["electricity_regulation_id"],
  powerquality_standard_id: ["powerquality_standard_id", "powequality_standard_id"],
  ppa_membership_type_id: ["ppa_membership_type_id"],
  services_provided_id: ["services_provided_id"],
  is_active: ["is_active", "active"],
  updated_date: ["updated_date"],
};

const SA_ALIASES: Record<string, string[]> = {
  id: ["id", "service_area_id", "sa_id"],
  utility_id: ["utility_id", "org_id", "organisation_id"],
  name: ["name", "service_area", "sa_name"],
  strata_id: ["strata_id", "strata"],
  provides_electricity: ["provides_electricity", "electricity"],
  provides_water: ["provides_water", "water"],
  provides_sanitation: ["provides_sanitation", "sanitation"],
  operations_only: ["operations_only"],
  is_virtual: ["is_virtual"],
  is_active: ["is_active", "active"],
};

const RP_ALIASES: Record<string, string[]> = {
  id: ["id", "report_period_id", "period_id"],
  utility_id: ["utility_id", "org_id", "organisation_id"],
  report_type_id: ["report_type_id", "report_type"],
  fy_end_year: ["fy_end_year", "fy_year", "financial_year", "year"],
  report_date: ["report_date", "period_end", "date"],
  status: ["status", "status_name"],
  request_date: ["request_date", "requested_date", "open_date"],
  lean_mode: ["lean_mode", "lean"],
  who_id: ["who_id"],
};

function findSheet(wb: ExcelJS.Workbook, names: string[]): ExcelJS.Worksheet | null {
  for (const ws of wb.worksheets) {
    if (names.includes(ws.name.trim().toLowerCase())) return ws;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parse — structural only. Semantic/DB validation happens in onboardNewOrganisations.
// ---------------------------------------------------------------------------
export async function parseNewOrganisationsWorkbook(
  path: string,
): Promise<{ data: NewOrgFile; errors: ParseError[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const errors: ParseError[] = [];

  const orgsWs = findSheet(wb, ["organisations", "organizations", "orgs"]);
  const saWs = findSheet(wb, ["service_areas", "service areas", "sas"]);
  const rpWs = findSheet(wb, ["report_periods", "report periods", "periods"]);

  const organisationsOut: NewOrgRow[] = [];
  const serviceAreasOut: NewServiceAreaRow[] = [];
  const reportPeriodsOut: NewReportPeriodRow[] = [];

  if (orgsWs) {
    const c = resolver(headerIndex(orgsWs), ORG_ALIASES);
    const g = (r: ExcelJS.Row, f: string) => (c.get(f) ? cellValue(r.getCell(c.get(f)!).value) : null);
    orgsWs.eachRow((r, n) => {
      if (n === 1) return;
      const id = toInt(g(r, "id"));
      const name = toStr(g(r, "name"));
      if (id == null && name == null) return; // blank / example row
      organisationsOut.push({
        _row: n,
        id,
        name,
        acronym: toStr(g(r, "acronym")),
        country_id: toInt(g(r, "country_id")),
        is_utility: toBool(g(r, "is_utility"), true),
        fye_month: toInt(g(r, "fye_month")),
        fye_day: toInt(g(r, "fye_day")),
        is_mth_report_relevant: toBool(g(r, "is_mth_report_relevant"), false),
        utility_type_id: toInt(g(r, "utility_type_id")),
        utility_size_id: toInt(g(r, "utility_size_id")),
        operating_basis_id: toInt(g(r, "operating_basis_id")),
        entity_type_id: toInt(g(r, "entity_type_id")),
        accounting_standard_id: toInt(g(r, "accounting_standard_id")),
        electricity_regulation_id: toInt(g(r, "electricity_regulation_id")),
        powerquality_standard_id: toInt(g(r, "powerquality_standard_id")),
        ppa_membership_type_id: toInt(g(r, "ppa_membership_type_id")),
        services_provided_id: toInt(g(r, "services_provided_id")),
        is_active: toBool(g(r, "is_active"), true),
        updated_date: toStr(g(r, "updated_date")),
      });
    });
  }

  if (saWs) {
    const c = resolver(headerIndex(saWs), SA_ALIASES);
    const g = (r: ExcelJS.Row, f: string) => (c.get(f) ? cellValue(r.getCell(c.get(f)!).value) : null);
    saWs.eachRow((r, n) => {
      if (n === 1) return;
      const id = toInt(g(r, "id"));
      const utility_id = toInt(g(r, "utility_id"));
      if (id == null && utility_id == null) return;
      serviceAreasOut.push({
        _row: n,
        id,
        utility_id,
        name: toStr(g(r, "name")),
        strata_id: toInt(g(r, "strata_id")),
        provides_electricity: toBool(g(r, "provides_electricity"), true),
        provides_water: toBool(g(r, "provides_water"), false),
        provides_sanitation: toBool(g(r, "provides_sanitation"), false),
        operations_only: toBool(g(r, "operations_only"), false),
        is_virtual: toBool(g(r, "is_virtual"), false),
        is_active: toBool(g(r, "is_active"), true),
      });
    });
  }

  if (rpWs) {
    const c = resolver(headerIndex(rpWs), RP_ALIASES);
    const g = (r: ExcelJS.Row, f: string) => (c.get(f) ? cellValue(r.getCell(c.get(f)!).value) : null);
    rpWs.eachRow((r, n) => {
      if (n === 1) return;
      const id = toInt(g(r, "id"));
      const utility_id = toInt(g(r, "utility_id"));
      if (id == null && utility_id == null) return;
      reportPeriodsOut.push({
        _row: n,
        id,
        utility_id,
        report_type_id: toInt(g(r, "report_type_id")),
        fy_end_year: toInt(g(r, "fy_end_year")),
        report_date: tsCell(rpWs, n, c.get("report_date")),
        status: toStr(g(r, "status")),
        request_date: tsCell(rpWs, n, c.get("request_date")),
        lean_mode: toBool(g(r, "lean_mode"), false),
        who_id: toInt(g(r, "who_id")),
      });
    });
  }

  if (!orgsWs && !saWs && !rpWs) {
    errors.push({
      sheet: "(workbook)",
      row: 0,
      field: "sheets",
      reason:
        "no organisations / service_areas / report_periods sheet found — see docs/migration-new-organisation-format.md",
    });
  }

  return {
    data: { organisations: organisationsOut, serviceAreas: serviceAreasOut, reportPeriods: reportPeriodsOut },
    errors,
  };
}
