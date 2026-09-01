/**
 * Pre-seed the ISO-4217 currencies into the "Currencies" managed list (stream #13).
 *
 * So that `ensureCountry` can lazy-insert any UN M49 country and satisfy the
 * NOT-NULL `countries.currency_id` FK. Idempotent — only inserts codes not
 * already present; matches the existing convention (name = code, description =
 * code). Currencies come from the distinct set in lib/countries/reference.generated.ts.
 *
 *   npx tsx scripts/seed-iso4217-currencies.ts --dry-run
 *   npx tsx scripts/seed-iso4217-currencies.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { COUNTRY_REFERENCE } from "@/lib/countries/reference.generated";

const DRY_RUN = process.argv.includes("--dry-run");
const CURRENCY_LIST_NAME = "Currencies";

async function main() {
  const list = await db
    .select({ id: managedLists.id })
    .from(managedLists)
    .where(eq(managedLists.name, CURRENCY_LIST_NAME));
  if (list.length === 0) throw new Error(`Managed list "${CURRENCY_LIST_NAME}" not found`);
  const listId = list[0].id;

  const existing = await db
    .select({ name: managedListItems.name })
    .from(managedListItems)
    .where(eq(managedListItems.list_id, listId));
  const have = new Set(existing.map((r) => r.name.toUpperCase()));

  // distinct currency codes from the reference
  const wanted = new Map<string, string>(); // code -> name
  for (const r of COUNTRY_REFERENCE) {
    if (r.currencyCode && !wanted.has(r.currencyCode)) {
      wanted.set(r.currencyCode, r.currencyName);
    }
  }

  const toAdd = [...wanted.keys()].filter((code) => !have.has(code)).sort();
  console.log(`"${CURRENCY_LIST_NAME}" (list ${listId}): ${have.size} existing, ${wanted.size} in reference, ${toAdd.length} to add.`);
  if (toAdd.length) console.log(`  adding: ${toAdd.join(", ")}`);

  if (DRY_RUN) {
    console.log("\n(dry run) no writes.");
    return;
  }
  if (toAdd.length) {
    await db.insert(managedListItems).values(
      toAdd.map((code) => ({ list_id: listId, name: code, description: code })),
    );
  }
  const after = await db
    .select({ name: managedListItems.name })
    .from(managedListItems)
    .where(eq(managedListItems.list_id, listId));
  console.log(`✅ Done. "${CURRENCY_LIST_NAME}" now has ${after.length} currencies.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("FAILED:", (e as Error).message);
    process.exit(1);
  },
);
