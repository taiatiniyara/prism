import "dotenv/config";
import { db } from "@/db/connection";
import { serviceAreas, organisations } from "@/db/schema/utility";
import { eq } from "drizzle-orm";

const FIX = process.argv.includes("--fix");

const CORRECTIONS: Record<number, number> = {
  // Chuuk (org 3): Weno
  3: 3,
  // CNMI (org 4): Guguan, Rota, Saipan, Tinian
  4: 4,
  5: 4,
  6: 4,
  7: 4,
  8: 4,
  // Fiji (org 10): Viti Levu, Labasa, Savusavu, Taveuni, Ovalau
  9: 10,
  10: 10,
  11: 10,
  12: 10,
  13: 10,
  14: 10,
  // Samoa (org 5): Apolima, Savaii, Upolu
  15: 5,
  16: 5,
  17: 5,
  18: 5,
  // Guam (org 11)
  19: 11,
  // Kwajalein/Marshall Is (org 14): Ebeye
  20: 14,
  // Kosrae (org 13)
  21: 13,
  // Marshalls (org 15): Majuro
  22: 15,
  // Niue (org 17)
  23: 17,
  // Nauru (org 16)
  24: 16,
  // PNG Power (org 20): Gazelle, Mini Grids, Port Moresby, Ramu
  25: 20,
  26: 20,
  27: 20,
  28: 20,
  29: 20,
  // Palau (org 19): Koror-Babeldaob, Outlying States
  30: 19,
  31: 19,
  32: 19,
  // Kiribati/PUB (org 22): South Tarawa
  33: 22,
  // Vanuatu (org 27): Efate
  56: 27,
  // Pohnpei (org 21)
  57: 21,
  // Yap (org 28): Fais, Satawal, Ulithi, Yap Proper, Woleai
  58: 28,
  59: 28,
  60: 28,
  61: 28,
  62: 28,
  63: 28,
  // New Caledonia EEC (org 7): Bourail, Lifou, Noumea, Koumac
  64: 7,
  65: 7,
  66: 7,
  67: 7,
  68: 7,
  // ENERCAL (org 9): Grande Terre, Iles Loyautes
  69: 9,
  70: 9,
  71: 9,
  // French Polynesia/Tahiti (org 6)
  72: 6,
  // Wallis & Futuna (org 8)
  73: 8,
  // Marshalls All (org 15)
  84: 15,
  // Vanuatu All (org 27)
  90: 27,
  // Pohnpei All (org 21)
  91: 21,
};

async function main() {
  console.log("=== Service Area → Organisation Mapping Fix ===\n");

  const orgs = await db
    .select({ id: organisations.id, name: organisations.name })
    .from(organisations);
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));

  const sas = await db
    .select({
      id: serviceAreas.id,
      name: serviceAreas.name,
      utility_id: serviceAreas.utility_id,
    })
    .from(serviceAreas);
  const saMap = new Map(sas.map((s) => [s.id, s]));

  const changes: {
    saId: number;
    saName: string;
    fromOrgId: number;
    fromOrgName: string;
    toOrgId: number;
    toOrgName: string;
  }[] = [];

  for (const [saId, newUtilityId] of Object.entries(CORRECTIONS)) {
    const sa = saMap.get(Number(saId));
    if (!sa) {
      console.log(`  WARN: SA ${saId} not found in database`);
      continue;
    }
    if (sa.utility_id === newUtilityId) {
      continue;
    }
    const targetOrg = orgMap.get(newUtilityId);
    if (!targetOrg) {
      console.log(`  SKIP SA ${saId}: target org ${newUtilityId} doesn't exist`);
      continue;
    }
    changes.push({
      saId: sa.id,
      saName: sa.name,
      fromOrgId: sa.utility_id,
      fromOrgName: orgMap.get(sa.utility_id) ?? `id=${sa.utility_id}`,
      toOrgId: newUtilityId,
      toOrgName: targetOrg,
    });
  }

  if (changes.length === 0) {
    console.log("✓ All service area mappings are already correct.\n");
    process.exit(0);
  }

  console.log(`${changes.length} mismatches to fix:\n`);
  console.log(
    `${"SA ID".padEnd(6)} ${"Service Area".padEnd(35)} ${"From".padEnd(35)} ${"To".padEnd(35)}`,
  );
  console.log("─".repeat(120));
  for (const c of changes) {
    console.log(
      `${String(c.saId).padEnd(6)} ${c.saName.slice(0, 34).padEnd(35)} ${(c.fromOrgName + ` (${c.fromOrgId})`).slice(0, 34).padEnd(35)} ${(c.toOrgName + ` (${c.toOrgId})`).slice(0, 34).padEnd(35)}`,
    );
  }
  console.log("─".repeat(120));

  if (FIX) {
    console.log("\nApplying fixes...");
    for (const c of changes) {
      await db
        .update(serviceAreas)
        .set({ utility_id: c.toOrgId })
        .where(eq(serviceAreas.id, c.saId));
      console.log(`  FIXED SA ${c.saId} "${c.saName}" → ${c.toOrgName} (${c.toOrgId})`);
    }

    // Verify
    console.log("\nVerifying...");
    const remaining = sas.filter(
      (s) =>
        saMap.get(s.id)!.utility_id !== s.utility_id &&
        CORRECTIONS[s.id] !== undefined,
    );
    if (remaining.length === 0) {
      console.log("✓ All corrections applied successfully.");
    }
  } else {
    console.log("\nRun with --fix to apply these corrections.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
