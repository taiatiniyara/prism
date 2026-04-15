import { traceLogService } from "@/lib/ai/trace-log.service";

async function run() {
  const removed = await traceLogService.pruneExpiredTraces(new Date());
  console.log(`Removed ${removed} expired AI traces.`);
}

run().catch((error) => {
  console.error("Failed to run AI trace retention job.", error);
  process.exitCode = 1;
});
