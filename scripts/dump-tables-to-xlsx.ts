/**
 * Pre-DDL snapshot: dump every base table in the schema to an Excel workbook —
 * ONE worksheet per table, header row = column names (in ordinal order), data
 * rows = the current data. Plus an "__index" sheet listing each table, its row
 * and column counts, and whether it was truncated.
 *
 * Intended to capture the DB state BEFORE the physical column renames, so you
 * have a reference/backup of names + data.
 *
 * Run:
 *   node --env-file=.env --import tsx scripts/dump-tables-to-xlsx.ts
 *   node --env-file=.env --import tsx scripts/dump-tables-to-xlsx.ts --out="C:/path/p2_preDDL_tables.xlsx"
 *
 * Flags:
 *   --out=PATH        output file (default ./p2_preDDL_tables.xlsx)
 *   --schema=NAME     schema to dump (default public)
 *   --tables=a,b,c    only these tables (default: all base tables in the schema)
 *   --exclude=a,b     skip these tables
 *   --max-rows=N      cap rows per table (default 1048575 = Excel's per-sheet limit);
 *                     a table with more rows is truncated and flagged in __index.
 */
import ExcelJS from "exceljs";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const OUT = arg("out") ?? "./p2_preDDL_tables.xlsx";
const SCHEMA = arg("schema") ?? "public";
const ONLY = arg("tables")?.split(",").map((s) => s.trim()).filter(Boolean);
const EXCLUDE = new Set((arg("exclude")?.split(",").map((s) => s.trim()) ?? []));
const EXCEL_MAX_DATA_ROWS = 1048575; // 1,048,576 sheet rows − 1 header
const MAX_ROWS = Math.min(Number(arg("max-rows") ?? EXCEL_MAX_DATA_ROWS), EXCEL_MAX_DATA_ROWS);

/** Double-quote a SQL identifier (names come from information_schema — still quoted for safety). */
const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

/** Serialize a pg cell to something Excel can hold. */
function cell(v: unknown): string | number | boolean | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return `[binary ${v.length} bytes]`;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object") return JSON.stringify(v); // json / jsonb / arrays
  return v as string | number | boolean;
}

/** Excel worksheet name: ≤31 chars, no []:*?/\, unique (case-insensitive). */
function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]*/\\?:]/g, "_").slice(0, 31);
  let candidate = base;
  let i = 1;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `~${i++}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

async function main() {
  const tablesRes = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
    [SCHEMA],
  );
  let tables = tablesRes.rows.map((r) => r.table_name);
  if (ONLY) tables = tables.filter((t) => ONLY.includes(t));
  tables = tables.filter((t) => !EXCLUDE.has(t));

  if (tables.length === 0) {
    console.error(`No base tables found in schema "${SCHEMA}" (after filters).`);
    process.exit(1);
  }
  console.log(`Dumping ${tables.length} table(s) from schema "${SCHEMA}" → ${OUT}`);

  const wb = new ExcelJS.Workbook();
  const index = wb.addWorksheet("__index");
  index.addRow(["table", "worksheet", "rows", "rows_dumped", "columns", "truncated"]);
  index.getRow(1).font = { bold: true };

  const used = new Set<string>(["__index"]);
  let anyTruncated = false;

  for (const table of tables) {
    // columns in ordinal order
    const cols = (
      await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position`,
        [SCHEMA, table],
      )
    ).rows.map((r) => r.column_name);

    const total = Number(
      (await pool.query<{ n: string }>(`SELECT count(*)::bigint AS n FROM ${q(SCHEMA)}.${q(table)}`))
        .rows[0]?.n ?? 0,
    );
    const truncated = total > MAX_ROWS;

    const ws = wb.addWorksheet(sheetName(table, used));
    ws.addRow(cols);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    // stream rows in pages to keep memory bounded on large tables
    const PAGE = 5000;
    let dumped = 0;
    for (let offset = 0; offset < Math.min(total, MAX_ROWS); offset += PAGE) {
      const limit = Math.min(PAGE, MAX_ROWS - offset);
      const rows = (
        await pool.query(`SELECT * FROM ${q(SCHEMA)}.${q(table)} OFFSET ${offset} LIMIT ${limit}`)
      ).rows as Record<string, unknown>[];
      for (const r of rows) ws.addRow(cols.map((c) => cell(r[c])));
      dumped += rows.length;
      if (rows.length < limit) break;
    }

    if (truncated) anyTruncated = true;
    index.addRow([table, ws.name, total, dumped, cols.length, truncated ? "YES" : ""]);
    console.log(`  ${table}: ${cols.length} cols, ${dumped}/${total} rows${truncated ? " (TRUNCATED)" : ""}`);
  }

  index.columns.forEach((c) => (c.width = 18));
  await wb.xlsx.writeFile(OUT);
  console.log(`\nWritten: ${OUT}`);
  if (anyTruncated) console.log("⚠ Some tables were truncated — raise --max-rows or dump those separately.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
