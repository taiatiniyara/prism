/**
 * Backfill Strategy-Map display defaults onto an ALREADY-seeded BSC master
 * template (see docs/bsc-builder-spec.md §13).
 *
 * The seed (seed-bsc-template.ts) sets `is_map_node` / `map_label`, but it is
 * idempotent and skips when template rows already exist. Installs seeded before
 * migration 0028 therefore have no map flags. This script applies the same
 * mapping to existing rows, matched by (level, label). Idempotent and additive
 * — re-running it just re-sets the same values; it never unsets anything.
 *
 * Run: npx tsx scripts/backfill-bsc-map-defaults.ts
 */
import { and, eq } from "drizzle-orm";

import { db } from "@/db/connection";
import {
  type BscTemplateLevel,
  bscTemplateNodes,
} from "@/db/schema/bsc-builder";

type MapDefault = {
  level: BscTemplateLevel;
  label: string;
  mapLabel: string;
};

// Financial promotes its key_focus_area (its strategic_objective labels are full
// sentences); every other perspective uses strategic_objective. Matches the
// annotations in seed-bsc-template.ts.
const MAP_DEFAULTS: MapDefault[] = [
  { level: "key_focus_area", label: "Revenue Growth", mapLabel: "Revenue growth" },
  { level: "key_focus_area", label: "Productivity Strategy", mapLabel: "Productivity" },

  { level: "strategic_objective", label: "Improve Image", mapLabel: "Brand & image" },
  { level: "strategic_objective", label: "Improve Relationship", mapLabel: "Customer relationships" },
  { level: "strategic_objective", label: "Improve Product & Service Attributes", mapLabel: "Product & service" },

  { level: "strategic_objective", label: "Improve Procurement Processes", mapLabel: "Procurement" },
  { level: "strategic_objective", label: "Improve Finance Processes", mapLabel: "Finance" },
  { level: "strategic_objective", label: "Improve HR Processes", mapLabel: "HR" },
  { level: "strategic_objective", label: "Improve Legal Processes", mapLabel: "Legal" },
  { level: "strategic_objective", label: "Improve ICT Processes", mapLabel: "ICT" },
  { level: "strategic_objective", label: "Improve Regulatory Processes", mapLabel: "Regulatory" },
  { level: "strategic_objective", label: "Improve Social Processes", mapLabel: "Social / ESG" },
  { level: "strategic_objective", label: "Improve Customer Management", mapLabel: "Customer management" },
  { level: "strategic_objective", label: "Improve Operations Management", mapLabel: "Operations management" },
  { level: "strategic_objective", label: "Improve Innovation Processes", mapLabel: "Innovation" },

  { level: "strategic_objective", label: "Maintain & Improve capabilities", mapLabel: "Workforce capability" },
  { level: "strategic_objective", label: "Secure & Timely Access to Decision-Making Information", mapLabel: "Decision-info access" },
  { level: "strategic_objective", label: "Effective Business Culture", mapLabel: "Business culture" },
  { level: "strategic_objective", label: "Effective Leadership", mapLabel: "Leadership" },
  { level: "strategic_objective", label: "Cohesive Teamwork", mapLabel: "Teamwork" },
  { level: "strategic_objective", label: "Aligned with Org. Vision, Mission and Values", mapLabel: "Vision & values" },
];

async function main() {
  let updated = 0;
  let missing = 0;
  for (const m of MAP_DEFAULTS) {
    const rows = await db
      .update(bscTemplateNodes)
      .set({ is_map_node: true, map_label: m.mapLabel, updated_at: new Date() })
      .where(
        and(
          eq(bscTemplateNodes.level, m.level),
          eq(bscTemplateNodes.label, m.label),
        ),
      )
      .returning({ id: bscTemplateNodes.id });
    if (rows.length === 0) {
      missing += 1;
      console.warn(`  no match: [${m.level}] ${m.label}`);
    } else {
      updated += rows.length;
    }
  }
  console.log(
    `Backfilled map defaults: ${updated} row(s) updated, ${missing} label(s) not found.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
