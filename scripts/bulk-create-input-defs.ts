import { db } from "@/db/connection";
import { measureDefinitions, inputDlDefMappings } from "@/db/schema/dataEntry";

const MIGRATION_URL = process.env.PRISM_TRAINING_MIGRATION_URL?.trim();
const MIGRATION_KEY = process.env.PRISM_TRAINING_MIGRATION_KEY?.trim();

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  const result = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  if (result.toLowerCase().endsWith("/api/migration")) return result;
  if (result.toLowerCase().endsWith("/api")) return `${result}/migration`;
  return `${result}/api/migration`;
}

const baseUrl = normalizeBaseUrl(MIGRATION_URL!);

async function fetchSource(path: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (MIGRATION_KEY) headers["x-migration-key"] = MIGRATION_KEY;
  const url = `${baseUrl}${path}`;
  process.stderr.write(`  GET ${url}\n`);
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

type SourceTrainingDef = {
  id: number;
  name: string;
  variableName: string | null;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 255);
}

function guessUnitId(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("rated capacity")) return 107; // MW
  if (
    n.includes("electricity generated") ||
    n.includes("energy stored") ||
    n.includes("electricity discharged")
  )
    return 108; // MWh
  if (n.includes("fuel") || (n.includes("oil") && !n.includes("downtime")))
    return 104; // Litres
  if (
    n.includes("downtime") ||
    n.includes("hours worked") ||
    n.includes("hours paid")
  )
    return 98; // Hours
  if (n.includes("ftz") || n.includes("employee")) return 94; // Employees
  if (
    n.includes("cost") ||
    n.includes("revenue") ||
    n.includes("sales") ||
    n.includes("price")
  )
    return 92; // Currency
  if (n.includes("%") || n.includes("percentage") || n.includes("ratio"))
    return 91; // %
  if (n.includes("customers")) return 93; // Customers
  if (n.includes("gender")) return 97; // Gender
  if (n.includes("mva")) return 106; // MVA
  if (n.includes("km")) return 101; // km
  return 115; // Number (generic)
}

function guessCategorySubcategory(
  name: string,
  varName: string | null,
): { cat: number; subcat: number } {
  const n = (name + " " + (varName ?? "")).toLowerCase();

  if (n.includes("country context") || n.includes("country & utility"))
    return { cat: 201, subcat: 221 };
  if (n.includes("utility context")) return { cat: 201, subcat: 222 };

  if (
    n.includes("financial") ||
    n.includes("cost") ||
    n.includes("revenue") ||
    n.includes("sales") ||
    n.includes("price") ||
    n.includes("account") ||
    n.includes("profit") ||
    n.includes("depreciation")
  )
    return { cat: 202, subcat: 230 };

  if (
    n.includes("governance") ||
    n.includes("board") ||
    n.includes("regulation") ||
    n.includes("code of conduct") ||
    n.includes("performance culture") ||
    n.includes("strategic") ||
    n.includes("annual report")
  )
    return { cat: 203, subcat: 241 };

  if (
    n.includes("gender") ||
    n.includes("ftz") ||
    n.includes("employee") ||
    n.includes("staff") ||
    n.includes("hours work") ||
    n.includes("hours paid") ||
    n.includes("safety") ||
    n.includes("hr ")
  )
    return { cat: 204, subcat: 262 };

  if (
    n.includes("gen") ||
    n.includes("rated capacity") ||
    n.includes("electricity generated") ||
    n.includes("energy stored") ||
    n.includes("electricity discharged") ||
    n.includes("fuel") ||
    n.includes("downtime") ||
    n.includes("engine oil") ||
    n.includes("lubrication oil") ||
    n.includes("generation")
  )
    return { cat: 205, subcat: 273 };

  if (n.includes("tariff") || n.includes("payment") || n.includes("billing"))
    return { cat: 205, subcat: 232 };
  if (n.includes("distribution") || n.includes("transformer"))
    return { cat: 205, subcat: 270 };
  if (n.includes("transmission")) return { cat: 205, subcat: 272 };
  if (
    n.includes("interruption") ||
    n.includes("outage") ||
    n.includes("saidi") ||
    n.includes("saifi")
  )
    return { cat: 205, subcat: 274 };

  return { cat: 205, subcat: 273 }; // Default to Operational/Generation
}

async function main() {
  console.log("=== Bulk Create Missing Input Defs & Mappings ===\n");

  // 1. Get existing prism input definitions
  const prismDefs = await db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      variableName: measureDefinitions.variable_name,
    })
    .from(measureDefinitions);

  const prismByName = new Map<string, number>();
  const prismByVarName = new Map<string, number>();
  for (const d of prismDefs) {
    const nm = (d.name ?? "").trim().toLowerCase();
    const vn = (d.variableName ?? "").trim().toLowerCase();
    if (nm && !prismByName.has(nm)) prismByName.set(nm, d.id);
    if (vn && !prismByVarName.has(vn)) prismByVarName.set(vn, d.id);
  }

  // 2. Get existing mappings
  const existingMappings = await db
    .select({ trainingId: inputDlDefMappings.training_dl_def_id })
    .from(inputDlDefMappings);
  const mappedTrainingIds = new Set(existingMappings.map((m) => m.trainingId));

  // 3. Scan ALL source data entries to collect unique training def IDs & names
  const sourceDefs = new Map<number, SourceTrainingDef>();
  let cursor: number | null = null;
  let hasMore = true;
  let pages = 0;

  console.log("Scanning source data entries for unique input definitions...");
  while (hasMore) {
    const params = new URLSearchParams();
    params.set("limit", "2000");
    params.set("includeDeleted", "1");
    if (cursor != null) params.set("cursor", String(cursor));

    const page = await fetchSource(`/dataEntry?${params.toString()}`);
    const entries = page.dataEntry ?? [];
    if (entries.length === 0) break;
    pages++;

    for (const row of entries) {
      const id = Number(row.measure_def_id);
      const name = String(row.input_def_name ?? "");
      const varName =
        typeof row.input_def_variable_name === "string"
          ? String(row.input_def_variable_name)
          : null;
      if (!id || !name) continue;
      if (mappedTrainingIds.has(id)) continue;
      if (!sourceDefs.has(id)) {
        sourceDefs.set(id, { id, name, variableName: varName });
      }
    }

    cursor = page.pagination?.nextCursor;
    hasMore = page.pagination?.hasMore === true && cursor != null;
    if (pages % 5 === 0) {
      console.log(
        `  Scanned ${pages} pages, found ${sourceDefs.size} unmapped definitions so far...`,
      );
    }
  }

  console.log(`\nScanned ${pages} pages total.`);
  console.log(`Found ${sourceDefs.size} unmapped training definitions.\n`);

  if (sourceDefs.size === 0) {
    console.log("Nothing to do - all training definitions are mapped.");
    process.exit(0);
  }

  // 4. Try to match each source def to existing prism def by name/variable_name
  const toCreate: SourceTrainingDef[] = [];
  const directMaps: Array<{ trainingId: number; prismId: number }> = [];

  for (const def of sourceDefs.values()) {
    const nameKey = def.name.trim().toLowerCase();
    const varKey = (def.variableName ?? "").trim().toLowerCase();

    const byVar = varKey ? prismByVarName.get(varKey) : undefined;
    if (byVar != null) {
      directMaps.push({ trainingId: def.id, prismId: byVar });
      continue;
    }

    const byName = nameKey ? prismByName.get(nameKey) : undefined;
    if (byName != null) {
      directMaps.push({ trainingId: def.id, prismId: byName });
      continue;
    }

    toCreate.push(def);
  }

  console.log(`Directly mappable (name/var match): ${directMaps.length}`);
  console.log(`Need to create: ${toCreate.length}`);

  // 5. Create direct mappings
  if (directMaps.length > 0) {
    console.log("\nCreating direct mappings...");
    for (const { trainingId, prismId } of directMaps) {
      const sourceDef = sourceDefs.get(trainingId);
      try {
        await db.insert(inputDlDefMappings).values({
          training_dl_def_id: trainingId,
          measure_def_id: prismId,
          training_dl_legacy_id: String(trainingId),
          training_dl_name: sourceDef?.name ?? `DL Def ${trainingId}`,
          training_variable_name: sourceDef?.variableName,
          confidence: "auto",
          is_auto: true,
          score: 0,
        });
      } catch {
        // duplicate, ignore
      }
    }
    console.log(`  Created ${directMaps.length} mappings.`);
  }

  // 6. Create new input definitions and mappings
  if (toCreate.length > 0) {
    console.log(`\nCreating ${toCreate.length} new input definitions...`);

    let created = 0;
    for (const def of toCreate) {
      const varName = def.variableName ?? slugify(def.name);
      const { cat, subcat } = guessCategorySubcategory(
        def.name,
        def.variableName,
      );
      const unitId = guessUnitId(def.name);

      try {
        const [inserted] = await db
          .insert(measureDefinitions)
          .values({
            name: def.name.substring(0, 255),
            variable_name: varName,
            measures_group_id: cat,
            measures_subgroup_id: subcat,
            unit_id: unitId,
            data_type_id: 82, // number
            is_currency: unitId === 92,
            is_active: true,
            is_mandatory: false,
            is_system_generated: false,
            is_calculated: false,
            is_kpi: false,
            is_kpi_input: false,
            sort_order: 0,
          })
          .returning({ id: measureDefinitions.id });

        await db.insert(inputDlDefMappings).values({
          training_dl_def_id: def.id,
          measure_def_id: inserted.id,
          training_dl_legacy_id: String(def.id),
          training_dl_name: def.name.substring(0, 255),
          training_variable_name: def.variableName?.substring(0, 255),
          confidence: "auto",
          is_auto: true,
          score: 0,
        });

        // Add to lookup maps for subsequent matches
        prismByName.set(def.name.trim().toLowerCase(), inserted.id);
        prismByVarName.set(varName.toLowerCase(), inserted.id);

        created++;
        if (created % 50 === 0) {
          console.log(`  Created ${created}/${toCreate.length}...`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `  Failed for "${def.name}" (${def.id}): ${msg.slice(0, 120)}`,
        );
      }
    }

    console.log(`\nCreated ${created} of ${toCreate.length} definitions.`);
  }

  console.log(
    "\nDone. Now run the 'Data Entries' migration on /migration to pull in the data.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
