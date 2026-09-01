import { db } from "@/db/connection";
import { sidebarAccess } from "@/db/schema/rls";
import crypto from "node:crypto";

const entries = [
  { name: "Overview", page: "/settings/overview", roles: "DEV", order: 9 },
  { name: "Config", page: "/settings/config", roles: "DEV", order: 10 },
  { name: "Deployment", page: "/settings/deployment", roles: "DEV", order: 33 },
  { name: "Error Logs", page: "/settings/logs/errors", roles: "DEV", order: 34 },
  { name: "Audit Logs", page: "/settings/logs/audit", roles: "DEV", order: 35 },
  { name: "System Logs", page: "/settings/logs/system", roles: "DEV", order: 36 },
  { name: "AI Usage", page: "/settings/ai/usage", roles: "DEV,BMO", order: 37 },
  { name: "Costs", page: "/settings/costs", roles: "DEV", order: 38 },
  { name: "Data Pipeline", page: "/settings/data-pipeline", roles: "DEV,BMO", order: 39 },
  { name: "KPI Health", page: "/settings/kpi/health", roles: "DEV,BMO", order: 40 },
  { name: "Security", page: "/settings/security", roles: "DEV", order: 41 },
  { name: "Backup", page: "/settings/backup", roles: "DEV", order: 42 },
  { name: "Alerts", page: "/settings/alerts", roles: "DEV", order: 43 },
];

async function main() {
  // Check existing to avoid duplicates
  const existing = await db.select({ page: sidebarAccess.page }).from(sidebarAccess);
  const existingPages = new Set(existing.map((e) => e.page));

  const toInsert = entries.filter((e) => !existingPages.has(e.page));

  if (toInsert.length === 0) {
    console.log("All sidebar entries already exist.");
    return;
  }

  for (const entry of toInsert) {
    await db.insert(sidebarAccess).values({
      id: crypto.randomUUID(),
      ...entry,
    });
  }

  console.log(`Inserted ${toInsert.length} sidebar entries:`);
  for (const e of toInsert) console.log(`  ${e.name} → ${e.page} [${e.roles}]`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
