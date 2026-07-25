import { db } from "@/db/connection";
import { sql } from "drizzle-orm";

interface QueryResult {
  name: string;
  ok: boolean;
  rows: number;
  error?: string;
}

async function test(name: string, fn: () => Promise<unknown>): Promise<QueryResult> {
  const start = Date.now();
  try {
    const result = await fn();
    const rows = Array.isArray(result) ? result.length : (result as { rows?: unknown[] })?.rows?.length ?? "?";
    return { name, ok: true, rows: rows as number };
  } catch (e) {
    const msg = e instanceof Error ? (e.message + (e.cause ? " | CAUSE: " + String(e.cause) : "")) : String(e);
    return { name, ok: false, rows: 0, error: msg };
  } finally {
    console.log(`  ${name}: ${Date.now() - start}ms`);
  }
}

async function main() {
  console.log("Testing all queries...\n");

  const results: QueryResult[] = [];

  // 1. Security - session
  results.push(await test("session (active)", async () => {
    return db.execute(sql`SELECT id FROM "session" WHERE expires_at > now() LIMIT 1`);
  }));

  // 2. Security - audit_logs
  results.push(await test("audit_logs (login failed)", async () => {
    return db.execute(sql`SELECT count(*)::int FROM audit_logs WHERE action = 'auth.login_failed' AND created_at >= now() - interval '24 hours'`);
  }));

  // 3. Security - user funnel
  results.push(await test("user (status funnel)", async () => {
    return db.execute(sql`SELECT count(CASE WHEN status = 'active' THEN 1 END)::int AS active FROM "user"`);
  }));

  // 4. Data pipeline - status counts
  results.push(await test("data_entries (status counts)", async () => {
    return db.execute(sql`SELECT status_id, count(*)::int FROM data_entries WHERE is_deleted = false GROUP BY status_id`);
  }));

  // 5. KPI calculation attempts
  results.push(await test("kpi_calculation_attempts", async () => {
    return db.execute(sql`SELECT status, count(*)::int FROM kpi_calculation_attempts GROUP BY status`);
  }));

  // 6. AI usage overview
  results.push(await test("ai_usage_metrics (overview)", async () => {
    return db.execute(sql`SELECT date, sum(request_count)::int FROM ai_usage_metrics WHERE date >= now() - interval '30 days' GROUP BY date ORDER BY date LIMIT 1`);
  }));

  // 7. AI per-user
  results.push(await test("ai_usage_metrics (per-user)", async () => {
    return db.execute(sql`SELECT u.email, sum(m.request_count)::int FROM ai_usage_metrics m INNER JOIN "user" u ON m.user_id = u.id WHERE m.date >= now() - interval '30 days' GROUP BY u.email LIMIT 1`);
  }));

  // 0. List all AI tables
  results.push(await test("list AI tables", async () => {
    const r = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'ai_%'`);
    console.log("  AI tables:", r.rows.map((row: Record<string, string>) => row.table_name).join(", "));
    return r;
  }));

  // 8. AI tool analytics - check table exists
  results.push(await test("ai_tool_call (analytics)", async () => {
    return db.execute(sql`SELECT * FROM "ai_tool_call" LIMIT 1`);
  }));

  // 9. Costs daily
  results.push(await test("costs (daily)", async () => {
    return db.execute(sql`SELECT sum(estimated_cost_cents)::int FROM ai_usage_metrics WHERE date >= now()::date`);
  }));

  // 10. Costs per-utility
  results.push(await test("costs (per-utility)", async () => {
    return db.execute(sql`SELECT o.name, sum(m.estimated_cost_cents)::int FROM ai_usage_metrics m INNER JOIN "user" u ON m.user_id = u.id INNER JOIN organisations o ON u.organisation_id = o.id WHERE m.date >= now() - interval '30 days' GROUP BY o.name LIMIT 1`);
  }));

  // 11. Backup
  results.push(await test("backup_logs", async () => {
    return db.execute(sql`SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 1`);
  }));

  // 12. Error logs
  results.push(await test("error_logs", async () => {
    return db.execute(sql`SELECT count(*)::int FROM error_logs WHERE resolved_at IS NULL`);
  }));

  console.log("\n--- Results ---");
  let fails = 0;
  for (const r of results) {
    const status = r.ok ? "OK" : "FAIL";
    console.log(`${status.padEnd(6)} ${r.name.padEnd(35)} rows=${r.rows}${r.error ? " " + r.error : ""}`);
    if (!r.ok) fails++;
  }
  console.log(`\n${results.length - fails}/${results.length} queries passed`);

  if (fails > 0) {
    process.exit(1);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
