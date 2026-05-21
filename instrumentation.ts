export const runtime = "nodejs";

export async function register() {
  if (process.env.NODE_ENV === "development") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ default: cron }, { checkAndSendDueSchedules }] = await Promise.all([
    import(/* webpackIgnore: true */ "node-cron"),
    import("@/app/settings/email-schedules/service"),
  ]);

  cron.schedule("*/5 * * * *", async () => {
    try {
      const results = await checkAndSendDueSchedules();
      if (results.length > 0) {
        console.log(
          `[cron] email-schedules sent: ${results.map((r: { name: string }) => r.name).join(", ")}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[cron] email-schedules error: ${message}`);
    }
  });
}
