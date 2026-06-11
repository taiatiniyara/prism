/**
 * Seed the BSC master template (see docs/bsc-builder-spec.md).
 *
 * Source: "BSC Hierarchy Structure.pdf" (DHI/PPA). Levels seeded:
 *   perspective -> overall_objective -> key_focus_area
 *     -> strategic_objective -> strategic_lever
 *
 * Mandatory (pre-ticked, locked) items from the PDF:
 *   - Strategic Objective: "Optimizing returns within regulatory constraints"
 *   - Strategic Objective: "Balancing capital deployment with cost discipline"
 *   - Strategic Lever:     "Growth from Existing Customers"
 * Perspectives and Overall Objectives are inherently mandatory (the fixed
 * framework). Everything else is optional. Red text in the PDF is ignored.
 *
 * NOTE: two labels preserve PDF spelling verbatim ("Business Apps Responsivenss",
 * "Planning Processess"). Correct them later via the admin template editor if
 * desired rather than silently diverging from the source here.
 *
 * Idempotent: skips entirely if any template nodes already exist.
 *
 * Run: npx tsx scripts/seed-bsc-template.ts
 */
import { db } from "@/db/connection";
import { bscTemplateNodes, type BscTemplateLevel } from "@/db/schema/bsc-builder";

type SeedNode = {
  label: string;
  level: BscTemplateLevel;
  mandatory?: boolean;
  children?: SeedNode[];
};

const TEMPLATE: SeedNode[] = [
  {
    label: "Financial",
    level: "perspective",
    mandatory: true,
    children: [
      {
        label: "Improve Shareholder Value",
        level: "overall_objective",
        mandatory: true,
        children: [
          {
            label: "Revenue Growth",
            level: "key_focus_area",
            children: [
              {
                label: "Optimizing returns within regulatory constraints",
                level: "strategic_objective",
                mandatory: true,
                children: [
                  {
                    label: "Growth from Existing Customers",
                    level: "strategic_lever",
                    mandatory: true,
                  },
                  { label: "Acquire New Customers", level: "strategic_lever" },
                ],
              },
            ],
          },
          {
            label: "Productivity Strategy",
            level: "key_focus_area",
            children: [
              {
                label: "Balancing capital deployment with cost discipline",
                level: "strategic_objective",
                mandatory: true,
                children: [
                  { label: "Improve Cost Structure", level: "strategic_lever" },
                  {
                    label: "Increase Asset Utilisation",
                    level: "strategic_lever",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    label: "Customer",
    level: "perspective",
    mandatory: true,
    children: [
      {
        label: "Improve Customer Outcomes",
        level: "overall_objective",
        mandatory: true,
        children: [
          {
            label: "Customer Value Proposition",
            level: "key_focus_area",
            children: [
              {
                label: "Improve Image",
                level: "strategic_objective",
                children: [{ label: "Branding", level: "strategic_lever" }],
              },
              {
                label: "Improve Relationship",
                level: "strategic_objective",
                children: [
                  { label: "Service", level: "strategic_lever" },
                  { label: "Partnership", level: "strategic_lever" },
                ],
              },
              {
                label: "Improve Product & Service Attributes",
                level: "strategic_objective",
                children: [
                  { label: "Price", level: "strategic_lever" },
                  { label: "Quality", level: "strategic_lever" },
                  { label: "Availability", level: "strategic_lever" },
                  { label: "Selection/Range", level: "strategic_lever" },
                  { label: "Functionality", level: "strategic_lever" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    label: "Processes",
    level: "perspective",
    mandatory: true,
    children: [
      {
        label: "Efficient & Effective Processes",
        level: "overall_objective",
        mandatory: true,
        children: [
          {
            label: "Corporate Services",
            level: "key_focus_area",
            children: [
              {
                label: "Improve Procurement Processes",
                level: "strategic_objective",
                children: [
                  {
                    label: "Timely Items Availability",
                    level: "strategic_lever",
                  },
                ],
              },
              {
                label: "Improve Finance Processes",
                level: "strategic_objective",
                children: [
                  { label: "Month-End Reporting", level: "strategic_lever" },
                  { label: "Financial Liquidity", level: "strategic_lever" },
                  { label: "Timely Project Funding", level: "strategic_lever" },
                ],
              },
              {
                label: "Improve HR Processes",
                level: "strategic_objective",
                children: [
                  { label: "Payroll Processing", level: "strategic_lever" },
                  { label: "Leave Processing", level: "strategic_lever" },
                  { label: "Recruitment Processing", level: "strategic_lever" },
                ],
              },
              {
                label: "Improve Legal Processes",
                level: "strategic_objective",
                children: [
                  {
                    label: "Project Contracts Review",
                    level: "strategic_lever",
                  },
                  { label: "Month-End Reporting", level: "strategic_lever" },
                ],
              },
              {
                label: "Improve ICT Processes",
                level: "strategic_objective",
                children: [
                  {
                    label: "Business Apps Availability",
                    level: "strategic_lever",
                  },
                  {
                    label: "Business Apps Responsivenss",
                    level: "strategic_lever",
                  },
                  {
                    label: "Secure Network & Information",
                    level: "strategic_lever",
                  },
                ],
              },
            ],
          },
          {
            label: "Regulatory & Social Processes",
            level: "key_focus_area",
            children: [
              {
                label: "Improve Regulatory Processes",
                level: "strategic_objective",
                children: [
                  { label: "Regulatory Reporting", level: "strategic_lever" },
                  { label: "Compliance Reporting", level: "strategic_lever" },
                  { label: "Tariff Submissions", level: "strategic_lever" },
                ],
              },
              {
                label: "Improve Social Processes",
                level: "strategic_objective",
                children: [
                  {
                    label: "Renewable Energy/Carbon Emissions Reporting",
                    level: "strategic_lever",
                  },
                ],
              },
            ],
          },
          {
            label: "Customer Management Processes",
            level: "key_focus_area",
            children: [
              {
                label: "Improve Customer Management",
                level: "strategic_objective",
                children: [
                  { label: "Contact Responsiveness", level: "strategic_lever" },
                  { label: "Proactive Notifications", level: "strategic_lever" },
                  { label: "Customer Outreach", level: "strategic_lever" },
                  {
                    label: "Energy Efficiency Awareness & Programs",
                    level: "strategic_lever",
                  },
                ],
              },
            ],
          },
          {
            label: "Operations Processes",
            level: "key_focus_area",
            children: [
              {
                label: "Improve Operations Management",
                level: "strategic_objective",
                children: [
                  { label: "Production Efficiency", level: "strategic_lever" },
                  { label: "Production Availability", level: "strategic_lever" },
                  {
                    label: "Generator Maintenance Schedule Adherence",
                    level: "strategic_lever",
                  },
                  {
                    label: "Vegetation Maintenance Schedule Adherence",
                    level: "strategic_lever",
                  },
                  {
                    label: "Meter Readings & Inspections",
                    level: "strategic_lever",
                  },
                  { label: "Planning Processess", level: "strategic_lever" },
                  { label: "Project Processes", level: "strategic_lever" },
                  { label: "New Connection Time", level: "strategic_lever" },
                  { label: "Outage Restoration Time", level: "strategic_lever" },
                  { label: "Worker & Public Safety", level: "strategic_lever" },
                ],
              },
            ],
          },
          {
            label: "Innovation Processes",
            level: "key_focus_area",
            children: [
              {
                label: "Improve Innovation Processes",
                level: "strategic_objective",
                children: [
                  { label: "Do things Differently", level: "strategic_lever" },
                  { label: "Do New things", level: "strategic_lever" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    label: "Learning & Growth",
    level: "perspective",
    mandatory: true,
    children: [
      {
        label: "Targetted Improvement Intervention",
        level: "overall_objective",
        mandatory: true,
        children: [
          {
            label: "Human Capital",
            level: "key_focus_area",
            children: [
              {
                label: "Maintain & Improve capabilities",
                level: "strategic_objective",
                children: [
                  { label: "In-House Training", level: "strategic_lever" },
                  {
                    label: "Apprenticeship pipelines",
                    level: "strategic_lever",
                  },
                  {
                    label: "Formal Training & Academic Partnerships",
                    level: "strategic_lever",
                  },
                  { label: "Secondments", level: "strategic_lever" },
                  {
                    label: "Retirement & Staff-Onboarding",
                    level: "strategic_lever",
                  },
                ],
              },
            ],
          },
          {
            label: "Information Capital",
            level: "key_focus_area",
            children: [
              {
                label:
                  "Secure & Timely Access to Decision-Making Information",
                level: "strategic_objective",
                children: [
                  { label: "Data Acquisition", level: "strategic_lever" },
                  { label: "ICT Infrastructure", level: "strategic_lever" },
                  { label: "Networking & Mobility", level: "strategic_lever" },
                  { label: "Business Applications", level: "strategic_lever" },
                  { label: "Cyber-Security", level: "strategic_lever" },
                  { label: "Analytics & Reporting", level: "strategic_lever" },
                ],
              },
            ],
          },
          {
            label: "Organisational Capital",
            level: "key_focus_area",
            children: [
              {
                label: "Effective Business Culture",
                level: "strategic_objective",
                children: [
                  {
                    label: "Organisational Culture",
                    level: "strategic_lever",
                  },
                ],
              },
              {
                label: "Effective Leadership",
                level: "strategic_objective",
                children: [
                  {
                    label: "Leadership Cultural Alignment",
                    level: "strategic_lever",
                  },
                ],
              },
              {
                label: "Cohesive Teamwork",
                level: "strategic_objective",
                children: [
                  {
                    label: "Synchronised Teamwork",
                    level: "strategic_lever",
                  },
                ],
              },
              {
                label: "Aligned with Org. Vision, Mission and Values",
                level: "strategic_objective",
                children: [
                  { label: "Values Assessment", level: "strategic_lever" },
                  { label: "Safety-first culture", level: "strategic_lever" },
                  { label: "Diversity and Inclusion", level: "strategic_lever" },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

async function insertNodes(
  nodes: SeedNode[],
  parentId: string | null,
): Promise<number> {
  let count = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const [inserted] = await db
      .insert(bscTemplateNodes)
      .values({
        parent_id: parentId,
        level: node.level,
        label: node.label,
        is_mandatory: node.mandatory ?? false,
        ord: i,
      })
      .returning({ id: bscTemplateNodes.id });
    count += 1;
    if (node.children?.length) {
      count += await insertNodes(node.children, inserted.id);
    }
  }
  return count;
}

async function main() {
  const existing = await db
    .select({ id: bscTemplateNodes.id })
    .from(bscTemplateNodes)
    .limit(1);

  if (existing.length > 0) {
    console.log("BSC template already seeded, skipping.");
    return;
  }

  console.log("Seeding BSC master template...");
  const total = await insertNodes(TEMPLATE, null);
  console.log(`Seeded ${total} BSC template nodes.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("BSC template seed failed:", err);
    process.exit(1);
  });
