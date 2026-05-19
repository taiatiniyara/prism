import cron from "node-cron";

const API_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3554";
const CRON_SCHEDULE = process.env.EMAIL_SCHEDULE_CRON ?? "*/5 * * * *";

console.log(`[email-schedule-cron] Starting with schedule: ${CRON_SCHEDULE}`);
console.log(`[email-schedule-cron] API URL: ${API_URL}`);

cron.schedule(CRON_SCHEDULE, async () => {
  try {
    console.log(`[email-schedule-cron] Triggering check...`);
    const res = await fetch(`${API_URL}/api/cron/email-schedules`);
    const data = await res.json();
    console.log(`[email-schedule-cron] Result:`, JSON.stringify(data));
  } catch (error) {
    console.error(`[email-schedule-cron] Error:`, error);
  }
}, {
  timezone: process.env.EMAIL_SCHEDULE_TIMEZONE ?? "UTC",
});

console.log("[email-schedule-cron] Cron job registered.");
