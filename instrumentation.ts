import "server-only";

export const runtime = "nodejs";

const CRON_LOCK_ID = 8734621;

export async function register() {
  if (process.env.NODE_ENV === "development") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ default: cron }, { checkAndSendDueSchedules }, { db }] = await Promise.all([
    import(/* webpackIgnore: true */ "node-cron"),
    import(/* webpackIgnore: true */ "@/app/settings/email-schedules/service"),
    import(/* webpackIgnore: true */ "@/db/connection"),
  ]);

  const { sql } = await import("drizzle-orm");

  cron.schedule("*/5 * * * *", async () => {
    try {
      const lockResult = await db.execute<{ locked: boolean }>(
        sql`SELECT pg_try_advisory_lock(${CRON_LOCK_ID}) AS locked`,
      );
      if (!lockResult.rows[0]?.locked) return;

      try {
        const results = await checkAndSendDueSchedules();
        if (results.length > 0) {
          console.log(
            `[cron] email-schedules sent: ${results.map((r: { name: string }) => r.name).join(", ")}`,
          );
        }
      } finally {
        await db.execute(
          sql`SELECT pg_advisory_unlock(${CRON_LOCK_ID})`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[cron] email-schedules error: ${message}`);
    }
  });
}
