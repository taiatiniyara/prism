import { db } from "@/db/connection";
import { sql } from "drizzle-orm";
import {
  resolvePeriodId,
  resolveRecentPeriodIds,
  getAccessibleReportPeriods,
} from "@/lib/ai/data-service/common";
import type { CurrentUser } from "@/lib/user.service";

const mk = (role: string, org_id: number | null): CurrentUser => ({
  name: "t", role, email: "t@t", id: "t", role_id: null, org_id,
  is_utility_context_scoped: false, status: "active" as never, reject_reason: null,
});

async function main() {
  // Find one FY and one Monthly period belonging to a real utility (not org 18/PPA)
  const probe = await db.execute(sql`
    SELECT rp.id, rp.utility_id, mli.name AS type
    FROM report_periods rp JOIN managed_list_items mli ON mli.id = rp.report_type_id
    WHERE rp.utility_id <> 18
    ORDER BY mli.name, rp.report_date DESC
  `);
  const rows = (probe.rows ?? probe) as { id: number; utility_id: number; type: string }[];
  const fy = rows.find((r) => r.type === "Financial Year");
  const mo = rows.find((r) => r.type === "Monthly");
  console.log("probe:", { fy, mo, totalPeriods: rows.length });
  if (!fy || !mo) { console.log("need both types to test"); process.exit(1); }

  const bmo = mk("BMO", 18);
  const utilOwner = mk("MGR", mo.utility_id);
  const utilOther = mk("MGR", mo.utility_id === fy.utility_id ? mo.utility_id + 1 : fy.utility_id);

  // 1. BMO explicit access
  console.log("BMO -> explicit FY period:", await resolvePeriodId(bmo, { report_period_id: fy.id }), "(expect", fy.id, ")");
  console.log("BMO -> explicit MONTHLY period:", await resolvePeriodId(bmo, { report_period_id: mo.id }), "(expect null)");

  // 2. Owner keeps own monthly
  console.log("Owner -> own MONTHLY period:", await resolvePeriodId(utilOwner, { report_period_id: mo.id }), "(expect", mo.id, ")");

  // 3. Foreign utility user denied other utility's period
  const foreignTest = await resolvePeriodId(utilOther, { report_period_id: mo.id });
  console.log("Other utility -> foreign MONTHLY period:", foreignTest, "(expect null)");

  // 4. BMO recent period list = FY only
  const recent = await resolveRecentPeriodIds(bmo, 10);
  const types = await db.execute(sql`
    SELECT DISTINCT mli.name FROM report_periods rp
    JOIN managed_list_items mli ON mli.id = rp.report_type_id
    WHERE rp.id IN (${sql.join(recent.map((r) => sql`${r}`), sql`, `)})
  `);
  console.log("BMO recent periods types:", JSON.stringify((types.rows ?? types)), "(expect only Financial Year)");

  // 5. BMO DTO list filter
  const dtos = await getAccessibleReportPeriods(bmo, { forceAllUtilities: true });
  const badDtos = dtos.filter((d) => d.Report_Type !== "Financial Year" && d.Utility_id !== 18);
  console.log("BMO DTO list:", dtos.length, "periods, non-FY foreign leaks:", badDtos.length, "(expect 0)");

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
