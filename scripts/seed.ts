import { db } from "@/db/connection";
import { roles } from "@/db/schema/auth-schema";
import { managedLists } from "@/db/schema/managedLists";
import { subRegions } from "@/db/schema/country";
import { sectors } from "@/db/schema/sector";
import { sidebarAccess } from "@/db/schema/rls";
import crypto from "node:crypto";

async function seedRoles() {
  const existing = await db.select({ id: roles.id }).from(roles).limit(1);
  if (existing.length > 0) {
    console.log("Roles already seeded, skipping.");
    return;
  }

  const roleNames = [
    { name: "DEV", description: "Developer / Administrator" },
    { name: "BMO", description: "Business Management Officer" },
    { name: "BLO", description: "Bulk Load Officer" },
    { name: "CEO", description: "Chief Executive Officer" },
    { name: "DAOF", description: "DAO Finance" },
    { name: "DAOH", description: "DAO Hydro" },
    { name: "DAOO", description: "DAO Operations" },
    { name: "EXE", description: "Executive" },
    { name: "EXT", description: "External" },
    { name: "MGR", description: "Manager" },
  ];

  await db.insert(roles).values(roleNames);
  console.log(`Seeded ${roleNames.length} roles.`);
}

async function seedManagedLists() {
  const existing = await db.select({ id: managedLists.id }).from(managedLists).limit(1);
  if (existing.length > 0) {
    console.log("Managed lists already seeded, skipping.");
    return;
  }

  const lists = [
    { name: "Report Type", description: "Report type dimension" },
    { name: "Measures Group", description: "Measure grouping (was Data Label Category)" },
    { name: "Measures Subgroup", description: "Measure sub-grouping (was Data Label Sub-Category)" },
    { name: "UoM", description: "Unit of measure (was Units)" },
    { name: "Data Type", description: "Data types for validation" },
    { name: "Category", description: "Category dimension (was Energy Type)" },
    { name: "Technology", description: "Technology dimension (was Energy Source)" },
    { name: "Provider", description: "Provider dimension (was Energy Provider)" },
    { name: "Customer Type", description: "Customer type dimension" },
    { name: "Payment Mode", description: "Payment mode dimension" },
    { name: "Currency", description: "Currency dimension" },
    { name: "Accounting Standards", description: "Accounting standards" },
    { name: "Electricity Regulation", description: "Electricity regulation types" },
    { name: "Feeder Type", description: "Feeder type dimension" },
    { name: "Fuel Supply Access", description: "Fuel supply access dimension" },
    { name: "Fuel Pricing Regulation", description: "Fuel pricing regulation dimension" },
    { name: "Ownership Type", description: "Ownership type dimension" },
    { name: "Power Quality Standards", description: "Power quality standards" },
    { name: "Gender", description: "Gender dimension" },
    { name: "Division", description: "Organisational division dimension" },
    { name: "Consumption Band", description: "Customer consumption band dimension" },
    { name: "Strata", description: "Aggregation levels" },
    { name: "Status", description: "Workflow statuses" },
  ];

  await db.insert(managedLists).values(lists);
  console.log(`Seeded ${lists.length} managed list types.`);
}

async function seedSubRegions() {
  const existing = await db.select({ id: subRegions.id }).from(subRegions).limit(1);
  if (existing.length > 0) {
    console.log("Sub-regions already seeded, skipping.");
    return;
  }

  const regions = [
    { name: "Melanesia", un_continental_region: "Oceania" },
    { name: "Micronesia", un_continental_region: "Oceania" },
    { name: "Polynesia", un_continental_region: "Oceania" },
  ];

  await db.insert(subRegions).values(regions);
  console.log(`Seeded ${regions.length} sub-regions.`);
}

async function seedSidebar() {
  const existing = await db.select({ id: sidebarAccess.id }).from(sidebarAccess).limit(1);
  if (existing.length > 0) {
    console.log("Sidebar already seeded, skipping.");
    return;
  }

  const entries = [
    { name: "Dashboard", page: "/dashboard", roles: "DEV,BMO,BLO,CEO,DAOF,DAOH,DAOO,EXE,EXT,MGR", order: 1 },
    { name: "PRISM AI", page: "/prism-ai", roles: "DEV,BMO,BLO,CEO,DAOF,DAOH,DAOO,EXE,MGR", order: 2 },
    { name: "Enter Data", page: "/data-entry/enter-data", roles: "DEV,BLO,DAOF,DAOH,DAOO", order: 3 },
    { name: "Review KPI", page: "/data-entry/review-kpi", roles: "DEV,BLO,CEO,BMO,DAOO", order: 4 },
    { name: "Incomplete KPIs", page: "/data-entry/incomplete-kpis", roles: "DEV,BMO", order: 5 },
    { name: "Review Feedback", page: "/data-entry/review-feedback", roles: "DEV,BMO,CEO", order: 6 },
    { name: "Balanced Scorecard", page: "/data-entry/balanced-scorecard", roles: "DEV,BMO,CEO", order: 7 },
    { name: "Downloads", page: "/data-entry/downloads", roles: "DEV,BMO", order: 8 },
    { name: "Users", page: "/settings/users", roles: "DEV,BMO,BLO", order: 10 },
    { name: "Roles", page: "/settings/roles", roles: "DEV", order: 11 },
    { name: "Organisations", page: "/settings/organisations", roles: "DEV,BMO", order: 12 },
    { name: "Countries", page: "/settings/countries", roles: "DEV,BMO", order: 13 },
    { name: "Sub Regions", page: "/settings/sub-regions", roles: "DEV,BMO", order: 14 },
    { name: "Service Areas", page: "/settings/service-areas", roles: "DEV,BLO,DAOO", order: 15 },
    { name: "Power Stations", page: "/settings/power-stations", roles: "DEV,BLO,DAOO", order: 16 },
    { name: "Energy Resources", page: "/settings/energy-resources", roles: "DEV", order: 17 },
    { name: "Report Periods", page: "/settings/report-periods", roles: "DEV,BMO", order: 18 },
    { name: "Managed Lists", page: "/settings/managed-lists", roles: "DEV", order: 19 },
    { name: "Inputs", page: "/settings/inputs", roles: "DEV", order: 20 },
    { name: "KPI", page: "/settings/kpi", roles: "DEV", order: 21 },
    { name: "BSC Template", page: "/settings/bsc-template", roles: "DEV,BMO", order: 27 },
    { name: "Relevance", page: "/settings/relevance", roles: "DEV", order: 22 },
    { name: "Measure Scope", page: "/settings/measure-scope", roles: "DEV", order: 22.5 },
    { name: "Reporting", page: "/settings/reporting", roles: "DEV", order: 23 },
    { name: "Email Schedules", page: "/settings/email-schedules", roles: "DEV,BMO", order: 24 },
    { name: "Country Context", page: "/settings/country-context", roles: "DEV", order: 25 },
    { name: "External Registrations", page: "/settings/external-registrations", roles: "DEV", order: 26 },
    { name: "Data Entry Logs", page: "/settings/logs", roles: "DEV", order: 30 },
    { name: "Governance", page: "/settings/governance", roles: "DEV", order: 31 },
    { name: "Utility Context", page: "/settings/utility-context", roles: "DEV", order: 32 },
    { name: "Migration", page: "/migration", roles: "DEV", order: 40 },
    { name: "Docs", page: "/docs", roles: "DEV,BMO,BLO,CEO,DAOF,DAOH,DAOO,EXE,MGR", order: 50 },
  ];

  for (const entry of entries) {
    await db.insert(sidebarAccess).values({
      id: crypto.randomUUID(),
      ...entry,
    });
  }
  console.log(`Seeded ${entries.length} sidebar entries.`);
}

// ADR 0003 sector reference table. Explicit ids (same id = same sector across
// envs; FK target for #10's benchmarking_group_sector + Phase-5b sector_terminology).
// Idempotent: run after any `db-push --force`, which recreates tables and drops
// their seed rows — this restores them without duplicating.
async function seedSectors() {
  await db
    .insert(sectors)
    .values([
      { id: 1, code: "electricity", name: "Electricity", sort_order: 1 },
      { id: 2, code: "water", name: "Water", sort_order: 2 },
      { id: 3, code: "sanitation", name: "Sanitation", sort_order: 3 },
    ])
    .onConflictDoNothing();
  console.log("Seeded sectors (electricity/water/sanitation).");
}

async function main() {
  console.log("Seeding PRISM database...\n");
  await seedRoles();
  await seedManagedLists();
  await seedSubRegions();
  await seedSectors();
  await seedSidebar();
  console.log("\nSeed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
