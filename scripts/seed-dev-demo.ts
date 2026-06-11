/**
 * LOCAL DEMO ONLY — creates a minimal country/utility and two verified login
 * users so the app can be run end-to-end against a throwaway local database.
 * Do NOT run against production. Idempotent.
 *
 * Run: npx tsx scripts/seed-dev-demo.ts
 */
import "dotenv/config";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { auth } from "@/lib/auth";
import { account, roles, user } from "@/db/schema/auth-schema";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { countries, subRegions } from "@/db/schema/country";
import { organisations } from "@/db/schema/utility";

const PASSWORD = "Passw0rd!";

async function getCurrencyItemId(): Promise<number> {
  const [list] = await db
    .select()
    .from(managedLists)
    .where(eq(managedLists.name, "Currency"))
    .limit(1);
  if (!list) throw new Error("Run db-seed first (Currency list missing).");
  const [existing] = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.list_id, list.id))
    .limit(1);
  if (existing) return existing.id;
  const [item] = await db
    .insert(managedListItems)
    .values({ list_id: list.id, name: "Fijian Dollar (FJD)" })
    .returning({ id: managedListItems.id });
  return item.id;
}

async function getCountryId(currencyId: number): Promise<number> {
  const [existing] = await db.select().from(countries).limit(1);
  if (existing) return existing.id;
  const [sub] = await db.select().from(subRegions).limit(1);
  if (!sub) throw new Error("Run db-seed first (sub-regions missing).");
  const [row] = await db
    .insert(countries)
    .values({
      name: "Fiji",
      dial_code: "679",
      iso_code_alpha2: "FJ",
      iso_code_alpha3: "FJI",
      currency_id: currencyId,
      sub_region_id: sub.id,
    })
    .returning({ id: countries.id });
  return row.id;
}

async function getOrgId(countryId: number): Promise<number> {
  const [existing] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.name, "Demo Power Utility"))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(organisations)
    .values({
      name: "Demo Power Utility",
      acronym: "DPU",
      country_id: countryId,
      is_utility: true,
    })
    .returning({ id: organisations.id });
  return row.id;
}

async function upsertUser(
  email: string,
  name: string,
  roleName: string,
  orgId: number | null,
) {
  const ctx = await auth.$context;
  const [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);
  if (!role) throw new Error(`Role ${roleName} missing; run db-seed first.`);

  const [existing] = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(user)
      .set({
        role_id: role.id,
        organisation_id: orgId,
        status: "active",
        emailVerified: true,
      })
      .where(eq(user.id, existing.id));
    return;
  }

  const id = crypto.randomUUID();
  const hashed = await ctx.password.hash(PASSWORD);
  await db.insert(user).values({
    id,
    name,
    email,
    emailVerified: true,
    status: "active",
    role_id: role.id,
    organisation_id: orgId,
  });
  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: hashed,
  });
}

async function main() {
  const currencyId = await getCurrencyItemId();
  const countryId = await getCountryId(currencyId);
  const orgId = await getOrgId(countryId);

  await upsertUser("dev@prism.local", "Dev User", "DEV", null);
  await upsertUser("ceo@prism.local", "CEO User", "CEO", orgId);

  console.log("Demo users ready (password for both: " + PASSWORD + ")");
  console.log("  dev@prism.local  (DEV  — template editor + Design mode)");
  console.log("  ceo@prism.local  (CEO  — builds the Demo Power Utility BSC)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Demo seed failed:", err);
    process.exit(1);
  });
