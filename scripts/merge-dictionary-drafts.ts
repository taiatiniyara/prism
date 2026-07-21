import { readFileSync, writeFileSync } from "node:fs";

const DIR = "docs/dictionary-drafts";

interface Draft {
  id: number;
  variable_name?: string;
  name?: string;
  definition: string;
  synonyms: string[];
  definition_status: string;
}
interface SourceRow {
  id: number;
  name: string;
  variable_name?: string;
  category: string | null;
  subcategory: string | null;
  unit: string | null;
  formula?: string | null;
  used_by_kpis?: string[];
}

// eslint-disable-next-line security/detect-non-literal-fs-filename
const load = <T>(f: string): T => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"));

const sourceInputs = load<SourceRow[]>("source-inputs.json");
const sourceKpis = load<SourceRow[]>("source-kpis.json");

const inputDrafts: Draft[] = [
  ...load<Draft[]>("drafts-inputs-hr.json"),
  ...load<Draft[]>("drafts-inputs-context-gov-fin.json"),
  ...load<Draft[]>("drafts-inputs-operational.json"),
];
const kpiDrafts: Draft[] = [
  ...load<Draft[]>("drafts-kpis-hr.json"),
  ...load<Draft[]>("drafts-kpis-fin-gov.json"),
  ...load<Draft[]>("drafts-kpis-ops-context.json"),
];

function validate(drafts: Draft[], source: SourceRow[], label: string) {
  const srcIds = new Set(source.map((s) => s.id));
  const seen = new Set<number>();
  const problems: string[] = [];
  for (const d of drafts) {
    if (!srcIds.has(d.id)) problems.push(`${label} draft id ${d.id} not in source`);
    if (seen.has(d.id)) problems.push(`${label} duplicate draft id ${d.id}`);
    seen.add(d.id);
    if (!d.definition || d.definition.trim().length < 60)
      problems.push(`${label} id ${d.id} definition too short`);
    if (!Array.isArray(d.synonyms) || d.synonyms.length < 1)
      problems.push(`${label} id ${d.id} missing synonyms`);
  }
  for (const id of srcIds) if (!seen.has(id)) problems.push(`${label} source id ${id} has no draft`);
  return problems;
}

const problems = [
  ...validate(inputDrafts, sourceInputs, "input"),
  ...validate(kpiDrafts, sourceKpis, "kpi"),
];
if (problems.length) {
  console.error("VALIDATION PROBLEMS:\n" + problems.join("\n"));
  process.exit(1);
}

const bySrc = <T extends SourceRow>(src: T[]) => new Map(src.map((s) => [s.id, s]));
const _inputSrcMap = bySrc(sourceInputs);
const _kpiSrcMap = bySrc(sourceKpis);

const finalInputs = sourceInputs.map((s) => {
  const d = inputDrafts.find((x) => x.id === s.id)!;
  return {
    id: s.id, name: s.name, variable_name: s.variable_name,
    category: s.category, subcategory: s.subcategory, unit: s.unit,
    definition: d.definition, synonyms: d.synonyms, definition_status: "draft",
  };
});
const finalKpis = sourceKpis.map((s) => {
  const d = kpiDrafts.find((x) => x.id === s.id)!;
  return {
    id: s.id, name: s.name,
    category: s.category, subcategory: s.subcategory, unit: s.unit, formula: s.formula ?? null,
    definition: d.definition, synonyms: d.synonyms, definition_status: "draft",
  };
});

writeFileSync(`${DIR}/dictionary-inputs.json`, JSON.stringify(finalInputs, null, 1));
writeFileSync(`${DIR}/dictionary-kpis.json`, JSON.stringify(finalKpis, null, 1));

// ---- Review HTML ----
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function section(title: string, rows: typeof finalInputs | typeof finalKpis) {
  const cats = [...new Set(rows.map((r) => r.category ?? "Uncategorised"))];
  let h = `<h2>${esc(title)} (${rows.length})</h2>`;
  for (const c of cats) {
    const rs = rows.filter((r) => (r.category ?? "Uncategorised") === c);
    h += `<h3>${esc(c)} (${rs.length})</h3><table><thead><tr><th style="width:22%">Name</th><th style="width:8%">Unit</th><th>Drafted definition</th><th style="width:18%">Synonyms</th></tr></thead><tbody>`;
    for (const r of rs) {
      h += `<tr><td><strong>${esc(r.name)}</strong></td><td>${esc(r.unit ?? "")}</td><td>${esc(r.definition)}</td><td>${esc(r.synonyms.join(", "))}</td></tr>`;
    }
    h += `</tbody></table>`;
  }
  return h;
}

const html = `<!doctype html><html><head><meta charset="utf-8">
<title>PRISM Dictionary Drafts — for BMO review</title>
<style>
body{font-family:Segoe UI,Arial,sans-serif;margin:2rem auto;max-width:1100px;color:#1e293b;line-height:1.45}
h1{color:#0f172a} h2{margin-top:2.2rem;border-bottom:2px solid #0ea5e9;padding-bottom:.2rem}
h3{margin-top:1.6rem;color:#0369a1}
table{border-collapse:collapse;width:100%;font-size:.85rem;margin-bottom:1rem}
th{background:#f1f5f9;text-align:left} th,td{border:1px solid #cbd5e1;padding:.45rem .55rem;vertical-align:top}
.note{background:#fef9c3;border:1px solid #eab308;padding:.8rem 1rem;border-radius:6px}
</style></head><body>
<h1>PRISM Data Dictionary — AI-drafted definitions</h1>
<p>Generated 2026-07-07 from the live definitions database (101 active inputs, 144 active KPIs).
All entries are <strong>status: draft</strong> — pending BMO curation. Machine-readable versions:
<code>dictionary-inputs.json</code>, <code>dictionary-kpis.json</code>.</p>
<p class="note"><strong>Every definition below was written by AI from the stored names, formulas, units and
input–KPI relationships.</strong> Review for factual correctness against PPA's benchmarking methodology before
marking curated — especially inclusion/exclusion conventions, which encode the most judgment.</p>
${section("Input definitions", finalInputs)}
${section("KPI definitions", finalKpis)}
</body></html>`;

writeFileSync(`${DIR}/REVIEW.html`, html);
console.log(`OK: ${finalInputs.length} inputs + ${finalKpis.length} KPIs merged. Files: dictionary-inputs.json, dictionary-kpis.json, REVIEW.html`);
