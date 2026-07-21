import { count } from "drizzle-orm";
import { db } from "@/db/connection";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { inputDlDefMappings } from "@/db/schema/dataEntry";

const MIGRATION_URL = process.env.PRISM_TRAINING_MIGRATION_URL?.trim();
const MIGRATION_KEY = process.env.PRISM_TRAINING_MIGRATION_KEY?.trim();
const MIGRATION_API_KEY = process.env.PRISM_TRAINING_API_KEY?.trim();

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  const result = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  if (result.toLowerCase().endsWith("/api/migration")) return result;
  if (result.toLowerCase().endsWith("/api")) return `${result}/migration`;
  return `${result}/api/migration`;
}

const baseUrl = normalizeBaseUrl(MIGRATION_URL!);

async function fetchSource(path: string, key = MIGRATION_KEY) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (key) headers["x-migration-key"] = key;
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${path}`);
  return res.json();
}

async function main() {
  console.log("=== Input Definition Mapping Diagnostic ===\n");

  // Get all prism input definitions
  const prismDefs = await db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      variableName: measureDefinitions.variable_name,
    })
    .from(measureDefinitions);
  console.log(`Prism input definitions: ${prismDefs.length}`);

  // Get existing mappings
  const existingMappings = await db
    .select({ trainingDlDefId: inputDlDefMappings.training_dl_def_id })
    .from(inputDlDefMappings);
  const mappedTrainingIds = new Set(
    existingMappings.map((m) => m.trainingDlDefId),
  );
  console.log(`Existing mappings: ${mappedTrainingIds.size}`);

  // Try to get input definitions from prism-training
  console.log("\nFetching input definitions from prism-training...");
  try {
    const sourceResult = await fetchSource(
      "/measureDefinitions",
      MIGRATION_KEY,
    );
    const sourceDefs: Array<{
      id: number;
      name: string;
      variable_name?: string;
    }> = sourceResult.measureDefinitions ?? [];
    console.log(`Source input definitions: ${sourceDefs.length}`);

    const prismIds = new Set(prismDefs.map((d) => d.id));
    const missing = sourceDefs.filter((d) => !prismIds.has(d.id));
    console.log(`Missing from prism: ${missing.length}`);
    if (missing.length > 0) {
      console.log("  First 10:");
      for (const d of missing.slice(0, 10)) {
        console.log(
          `    ${d.id}: ${d.name} (vn: ${d.variable_name ?? "none"})`,
        );
      }
    }
  } catch (err) {
    console.log(
      `  Could not fetch input defs: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Try dlDef endpoint
  console.log("\nFetching dl_defs from prism-training...");
  try {
    const baseUrlDirect = (MIGRATION_URL ?? "").replace(
      /\/api\/migration\/?$/,
      "",
    );
    const dlDefUrl = `${baseUrlDirect}/api/mig/dlDef`;
    console.log(`  GET ${dlDefUrl}`);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (MIGRATION_KEY) headers["x-migration-key"] = MIGRATION_KEY;
    const res = await fetch(dlDefUrl, {
      headers,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.log(`  dlDef endpoint returned ${res.status}`);
    } else {
      const text = await res.text();
      const rows = JSON.parse(text, (_, v) =>
        typeof v === "bigint" ? Number(v) : v,
      ) as Array<Array<unknown>>;
      console.log(`  Got ${rows.length} dl_defs`);

      let mappableCount = 0;
      let unmappable = 0;
      const unmappableSamples: Array<{ id: number; name: string }> = [];

      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        const id = Number(row[0]);
        const name = String(row[1] ?? "");
        if (!id || !name) continue;

        const nameKey = name.trim().toLowerCase();
        const varName =
          typeof row[2] === "string" ? String(row[2]).trim().toLowerCase() : "";

        // Try to match to prism input def
        let matched = false;
        for (const pd of prismDefs) {
          const pName = (pd.name ?? "").trim().toLowerCase();
          const pVar = (pd.variableName ?? "").trim().toLowerCase();
          if (
            (varName && pVar === varName) ||
            (!varName && pName === nameKey)
          ) {
            matched = true;
            break;
          }
        }

        if (matched) {
          mappableCount++;
        } else {
          unmappable++;
          if (unmappableSamples.length < 15) {
            unmappableSamples.push({ id, name });
          }
        }
      }

      console.log(`  Mappable (name/var match): ${mappableCount}`);
      console.log(`  Unmappable (no match):    ${unmappable}`);
      console.log("  Unmappable samples:");
      for (const s of unmappableSamples) {
        console.log(`    ${s.id}: ${s.name}`);
      }
    }
  } catch (err) {
    console.log(
      `  Could not fetch dl_defs: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Show a few prism def names for comparison
  console.log("\nSample prism input definitions (generation-related):");
  const genDefs = prismDefs
    .filter(
      (d) =>
        (d.name ?? "").toLowerCase().includes("gen") ||
        (d.variableName ?? "").toLowerCase().includes("gen"),
    )
    .slice(0, 15);
  for (const d of genDefs) {
    console.log(`  ${d.id}: ${d.name} (vn: ${d.variableName ?? "none"})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
