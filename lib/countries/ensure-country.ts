import { and, eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { countries, subRegions, type Country, type Region } from "@/db/schema/country";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { COUNTRY_REFERENCE_BY_M49 } from "@/lib/countries/reference.generated";

const CURRENCY_LIST_NAME = "Currencies";
const VALID_REGIONS = new Set<Region>(["Oceania", "Europe", "Asia", "Africa", "Americas"]);

/**
 * Return the canonical `countries` row for a UN M49 code, lazy-inserting it (and
 * its `sub_regions` parent) from the vendored UN reference if it doesn't exist
 * yet (stream #13). Lets registration (#10) offer the full M49 list and only
 * materialize a country the first time someone picks it, keeping the live table
 * lean without blocking a non-Pacific subscriber.
 *
 * Idempotent + transactional; safe under concurrent first-picks (PK conflict is
 * ignored, then the row is re-read). Requires the ISO-4217 currencies to be
 * pre-seeded (scripts/seed-iso4217-currencies.ts) so the NOT-NULL currency FK
 * can be satisfied.
 */
export async function ensureCountry(m49Code: number): Promise<Country> {
  const existing = await db.select().from(countries).where(eq(countries.id, m49Code));
  if (existing.length > 0) return existing[0];

  const ref = COUNTRY_REFERENCE_BY_M49.get(m49Code);
  if (!ref) throw new Error(`No UN M49 reference for country code ${m49Code}`);
  if (ref.subRegionCode == null) {
    throw new Error(`Country ${ref.name} (${m49Code}) has no UN sub-region; cannot lazy-insert.`);
  }
  if (!ref.currencyCode) {
    throw new Error(`Country ${ref.name} (${m49Code}) has no ISO-4217 currency in the reference; cannot lazy-insert.`);
  }
  if (!VALID_REGIONS.has(ref.regionName as Region)) {
    throw new Error(`Country ${ref.name} (${m49Code}) has unexpected region "${ref.regionName}".`);
  }
  const subRegionCode = ref.subRegionCode;

  return db.transaction(async (tx) => {
    // 1. ensure the sub-region (carries the region name) exists
    const sr = await tx.select({ id: subRegions.id }).from(subRegions).where(eq(subRegions.id, subRegionCode));
    if (sr.length === 0) {
      await tx
        .insert(subRegions)
        .values({
          id: subRegionCode,
          name: ref.subRegionName,
          un_continental_region: ref.regionName as Region,
          is_active: true,
        })
        .onConflictDoNothing({ target: subRegions.id });
    }

    // 2. resolve the currency managed-list item, auto-ensuring it if absent.
    // (scripts/seed-iso4217-currencies.ts pre-seeds all of them, so this is
    // normally a plain lookup; the insert path makes ensureCountry self-sufficient
    // even if the pre-seed hasn't run.)
    const list = await tx
      .select({ id: managedLists.id })
      .from(managedLists)
      .where(eq(managedLists.name, CURRENCY_LIST_NAME));
    if (list.length === 0) throw new Error(`Managed list "${CURRENCY_LIST_NAME}" not found`);
    const existingCurrency = await tx
      .select({ id: managedListItems.id })
      .from(managedListItems)
      .where(and(eq(managedListItems.list_id, list[0].id), eq(managedListItems.name, ref.currencyCode)));
    let currencyId: number;
    if (existingCurrency.length > 0) {
      currencyId = existingCurrency[0].id;
    } else {
      const inserted = await tx
        .insert(managedListItems)
        .values({ list_id: list[0].id, name: ref.currencyCode, description: ref.currencyCode })
        .returning({ id: managedListItems.id });
      currencyId = inserted[0].id;
    }

    // 3. insert the country (PK = M49 code); ignore a concurrent insert then re-read
    await tx
      .insert(countries)
      .values({
        id: ref.m49,
        name: ref.name,
        dial_code: ref.dial,
        iso_code_alpha2: ref.iso2,
        iso_code_alpha3: ref.iso3,
        currency_id: currencyId,
        is_adb_member: false, // unknown for a lazy-inserted (non-Pacific) country
        sub_region_id: subRegionCode,
      })
      .onConflictDoNothing({ target: countries.id });

    const row = await tx.select().from(countries).where(eq(countries.id, m49Code));
    return row[0];
  });
}
