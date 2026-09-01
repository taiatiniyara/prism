/**
 * Sample workbook for the redesigned data_entries table (medallion migration).
 *   Sheet 1 — exact physical columns of data_entries, ids only (relevance shells)
 *   Sheet 2 — same rows, with name/label columns added beside each id
 *   Sheet 3 — values loaded: legacy raw string stays in `value`, typed copy in
 *             value_numeric / value_boolean / value_text / value_option_id
 * Source: real entries from EFL FY2023 (report period 175) on the dev DB.
 * Ids for not-yet-created lists (band/division/gender/function) marked "(new)".
 */
import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

const PERIOD_ID = 175;
const OUT =
  "C:/Users/eugen/OneDrive - Innov8 Pacific/0 Innov8/3.Customers/DHI/PPA/Phase 2/10 Implementation/Migration/Data Cleansing/new_data_entries_sample_v2.xlsx";

const ALL = {
  provider: { id: 20, label: "All" },
  type: { id: 30, label: "All" },
  source: { id: 40, label: "All GEN" },
  customer: { id: 690, label: "All Customers" },
  paymode: { id: 720, label: "All Payment Modes" },
  resourceType: { id: 988, label: "Generator + Storage" },
};
const ESS_SOURCES = new Set(["Battery", "Hydrogen Cells", "Hydro Pumped Storage", "All ESS"]);
const DIVISION_MAP: Record<string, string> = {
  technical: "Technical", other: "Other", finance: "Finance",
  administrative: "Administration", procurement: "Procurement", ict: "ICT",
  human_resource: "HR", pr_marketing_and_customer_service: "PR/Marketing/CustService",
};
const STATUS_NAMES: Record<number, string> = {
  1: "Requested", 2: "Pending", 3: "Entered", 4: "Reviewed", 5: "Approved", 7: "Not Available",
};

async function main() {
  const src = await db.execute(sql`
    SELECT de.id, de.measure_def_id, d.name AS def_name, d.variable_name,
           dt.name AS data_type, sc.name AS subcategory,
           de.service_area_id, sa.name AS service_area,
           de.energy_resource_id, er.name AS energy_resource,
           er.power_station_id, ps.name AS power_station,
           de.energy_provider_id AS provider_id, mp.name AS provider,
           de.energy_type_id AS type_id, mt.name AS type_name,
           de.energy_source_id AS source_id, ms.name AS source,
           de.customer_type_id AS customer_id, mc.name AS customer,
           de.payment_mode_id AS paymode_id, mm.name AS paymode,
           de.value, de.status_id
    FROM (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY measure_def_id
        ORDER BY (value IS NULL OR value = '') ASC, value DESC
      ) AS rn
      FROM data_entries WHERE report_period_id = ${PERIOD_ID} AND is_deleted = false
    ) de
    JOIN measure_definitions d ON d.id = de.measure_def_id
    LEFT JOIN managed_list_items dt ON dt.id = d.data_type_id
    LEFT JOIN managed_list_items sc ON sc.id = d.measures_subgroup_id
    LEFT JOIN service_areas sa ON sa.id = de.service_area_id
    LEFT JOIN energy_resources er ON er.id = de.energy_resource_id
    LEFT JOIN power_stations ps ON ps.id = er.power_station_id
    LEFT JOIN managed_list_items mp ON mp.id = de.energy_provider_id
    LEFT JOIN managed_list_items mt ON mt.id = de.energy_type_id
    LEFT JOIN managed_list_items ms ON ms.id = de.energy_source_id
    LEFT JOIN managed_list_items mc ON mc.id = de.customer_type_id
    LEFT JOIN managed_list_items mm ON mm.id = de.payment_mode_id
    WHERE de.rn = 1
    ORDER BY dt.name, sc.name, d.name
  `);
  type Src = {
    id: string; measure_def_id: number; def_name: string; variable_name: string | null;
    data_type: string | null; subcategory: string | null;
    service_area_id: number | null; service_area: string | null;
    energy_resource_id: number | null; energy_resource: string | null;
    power_station_id: number | null; power_station: string | null;
    provider_id: number | null; provider: string | null;
    type_id: number | null; type_name: string | null;
    source_id: number | null; source: string | null;
    customer_id: number | null; customer: string | null;
    paymode_id: number | null; paymode: string | null;
    value: string | null; status_id: number | null;
  };
  const all = (src.rows ?? src) as unknown as Src[];

  // ~40 diverse rows: up to 2 per (data_type, subcategory), values first
  const picked: Src[] = [];
  const perBucket = new Map<string, number>();
  const withVal = all.filter((r) => r.value && r.value.trim() !== "");
  const noVal = all.filter((r) => !r.value || r.value.trim() === "");
  for (const r of [...withVal, ...noVal]) {
    const k = `${r.data_type}|${r.subcategory}`;
    const n = perBucket.get(k) ?? 0;
    if (n >= 2 || picked.length >= 40) continue;
    perBucket.set(k, n + 1);
    picked.push(r);
  }

  const period = await db.execute(sql`
    SELECT rp.id, to_char(rp.report_date, 'YYYY') AS fy, o.id AS utility_id, o.acronym,
           co.id AS country_id, co.name AS country, sr.id AS subregion_id, sr.name AS subregion
    FROM report_periods rp
    JOIN organisations o ON o.id = rp.utility_id
    JOIN countries co ON co.id = o.country_id
    LEFT JOIN sub_regions sr ON sr.id = co.sub_region_id
    WHERE rp.id = ${PERIOD_ID}`);
  const p = ((period.rows ?? period) as Record<string, unknown>[])[0] as {
    id: number; fy: string; utility_id: number; acronym: string;
    country_id: number; country: string; subregion_id: number | null; subregion: string | null;
  };

  const opts = await db.execute(sql`SELECT id, name FROM managed_list_items`);
  const optByName = new Map(
    ((opts.rows ?? opts) as { id: number; name: string }[]).map((o) => [o.name.toLowerCase(), o]),
  );

  // Derivations per source row → one flat record covering every physical column + labels
  const records = picked.map((r) => {
    const vn = r.variable_name ?? "";
    let division: { id: number | string; label: string } = { id: "(new)", label: "All" };
    let gender: { id: number | string; label: string } = { id: "(new)", label: "All" };
    const m = vn.match(/^(technical|other|finance|administrative|procurement|ict|human_resource|pr_marketing_and_customer_service)_employees_(female|male|total)(?:_.*)?$/);
    if (m) {
      division = { id: "(new)", label: DIVISION_MAP[m[1]] ?? m[1] };
      gender = { id: "(new)", label: m[2] === "total" ? "All" : m[2] === "female" ? "Female" : "Male" };
    }
    let fn: { id: number | string; label: string } = { id: "(new)", label: "All" };
    if (r.subcategory && ["Transmission", "Distribution", "Generation"].includes(r.subcategory)) {
      fn = { id: "(new)", label: r.subcategory };
    }
    const genRelated = r.subcategory === "Generation" || r.subcategory === "Energy Storage";
    let resType: { id: number | string; label: string } = ALL.resourceType;
    if (genRelated && r.source && ESS_SOURCES.has(r.source)) resType = { id: 985, label: "Energy Storage" };
    else if (genRelated && r.source) resType = { id: 984, label: "Generator" };

    const provider = r.provider_id ? { id: r.provider_id, label: r.provider! } : ALL.provider;
    const etype = r.type_id ? { id: r.type_id, label: r.type_name! } : ALL.type;
    const source = r.source_id ? { id: r.source_id, label: r.source! } : ALL.source;
    const customer = r.customer_id ? { id: r.customer_id, label: r.customer! } : ALL.customer;
    const paymode = r.paymode_id ? { id: r.paymode_id, label: r.paymode! } : ALL.paymode;

    // typed routing
    const raw = r.value?.trim() ?? "";
    let vNum: number | null = null; let vBool: string | null = null;
    let vText: string | null = null; let vOpt: { id: number; label: string } | null = null;
    if (raw !== "") {
      if ((r.data_type ?? "number") === "number") {
        const n = Number(raw.replace(/,/g, ""));
        if (Number.isFinite(n)) vNum = n; else vText = raw;
      } else if (r.data_type === "boolean") {
        vBool = /^(yes|true|1)$/i.test(raw) ? "TRUE" : "FALSE";
      } else {
        const o = optByName.get(raw.toLowerCase());
        if (o) vOpt = { id: o.id, label: o.name }; else vText = raw;
      }
    }
    let statusId = r.status_id ?? 1;
    if (statusId === 6) statusId = 5;

    return { r, vn, division, gender, fn, resType, provider, etype, source, customer, paymode, raw, vNum, vBool, vText, vOpt, statusId };
  });

  const wb = new ExcelJS.Workbook();
  const style = (ws: ExcelJS.Worksheet, xSplit: number) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
    ws.views = [{ state: "frozen", ySplit: 1, xSplit }];
    ws.columns.forEach((c) => { c.width = Math.max(12, String(c.header ?? "").length + 2); });
  };

  // ---------- Sheet 1: exact physical columns, ids only ----------
  const s1 = wb.addWorksheet("1 data_entries (ids)");
  s1.columns = [
    "id", "report_period_id", "energy_resource_id", "service_area_id", "measure_def_id",
    "value", "comments", "update_medium_id", "status_id", "is_relevant", "is_deleted",
    "energy_provider_id", "energy_source_id", "customer_type_id", "payment_mode_id",
    "updated_at", "updated_by_id", "power_station_id", "utility_id", "country_id",
    "subregion_id", "region", "value_boolean", "value_text", "energy_type_id",
    "consumption_band_id", "division_id", "gender_id", "value_numeric", "value_option_id",
    "energy_resource_type_id", "utility_function_id",
  ].map((h) => ({ header: h }));
  for (const x of records) {
    s1.addRow([
      x.r.id, p.id, x.r.energy_resource_id ?? null, x.r.service_area_id ?? null, x.r.measure_def_id,
      null, null, null, 1, "TRUE", "FALSE",
      x.provider.id, x.source.id, x.customer.id, x.paymode.id,
      "2026-07-09", "migration", x.r.power_station_id ?? null, p.utility_id, p.country_id,
      p.subregion_id ?? null, "Pacific", null, null, x.etype.id,
      "(new)", x.division.id, x.gender.id, null, null,
      x.resType.id, x.fn.id,
    ]);
  }
  style(s1, 1);

  // ---------- Sheets 2 & 3: ids + name columns ----------
  const labeledColumns = [
    "id", "report_period_id", "period", "utility_id", "utility", "country_id", "country",
    "subregion_id", "subregion", "region", "power_station_id", "power_station",
    "service_area_id", "service_area", "energy_resource_id", "energy_resource",
    "measure_def_id", "measure (variable_name)", "measure name", "data_type",
    "energy_provider_id", "provider", "energy_type_id", "type", "energy_source_id", "source",
    "energy_resource_type_id", "resource_type", "customer_type_id", "customer_type",
    "payment_mode_id", "payment_mode", "consumption_band_id", "band",
    "division_id", "division", "gender_id", "gender", "utility_function_id", "utility_function",
    "value", "value_numeric", "value_boolean", "value_text", "value_option_id", "value_option (name)",
    "status_id", "status", "is_relevant", "is_deleted", "update_medium_id", "updated_at", "updated_by_id",
  ];
  const labeledRow = (x: (typeof records)[number], loaded: boolean) => [
    x.r.id, p.id, `FY${p.fy}`, p.utility_id, p.acronym, p.country_id, p.country,
    p.subregion_id ?? null, p.subregion ?? "", "Pacific", x.r.power_station_id ?? null, x.r.power_station ?? "",
    x.r.service_area_id ?? null, x.r.service_area ?? "", x.r.energy_resource_id ?? null, x.r.energy_resource ?? "",
    x.r.measure_def_id, x.vn, x.r.def_name, x.r.data_type ?? "",
    x.provider.id, x.provider.label, x.etype.id, x.etype.label, x.source.id, x.source.label,
    x.resType.id, x.resType.label, x.customer.id, x.customer.label,
    x.paymode.id, x.paymode.label, "(new)", "All",
    x.division.id, x.division.label, x.gender.id, x.gender.label, x.fn.id, x.fn.label,
    loaded ? (x.raw || null) : null,
    loaded ? x.vNum : null, loaded ? x.vBool : null, loaded ? x.vText : null,
    loaded ? (x.vOpt?.id ?? null) : null, loaded ? (x.vOpt?.label ?? null) : null,
    loaded ? x.statusId : 1, loaded ? (STATUS_NAMES[x.statusId] ?? `#${x.statusId}`) : "Requested",
    "TRUE", "FALSE", null, "2026-07-09", loaded ? "migration-values" : "migration-shells",
  ];

  const s2 = wb.addWorksheet("2 with names (shells)");
  s2.columns = labeledColumns.map((h) => ({ header: h }));
  for (const x of records) s2.addRow(labeledRow(x, false));
  style(s2, 1);

  const s3 = wb.addWorksheet("3 values loaded");
  s3.columns = labeledColumns.map((h) => ({ header: h }));
  for (const x of records) s3.addRow(labeledRow(x, true));
  style(s3, 1);

  await wb.xlsx.writeFile(OUT);
  const loaded = records.filter((x) => x.raw !== "").length;
  console.log(`rows: ${records.length} (${loaded} with values) | sheet1 cols: ${s1.columnCount} | sheets 2/3 cols: ${s2.columnCount}`);
  console.log(`written: ${OUT}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
