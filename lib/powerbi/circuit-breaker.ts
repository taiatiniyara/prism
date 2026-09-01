import { logger } from "@/lib/logging/logger";

const pbiCallTimestamps: number[] = [];
const PBI_MAX_CALLS_PER_MINUTE = 60;
const PBI_WINDOW_MS = 60_000;

let pbiAuthFailedAt: number | null = null;
const PBI_AUTH_COOLDOWN_MS = 300_000;

function isPbiCircuitOpen(): boolean {
  if (pbiAuthFailedAt === null) return false;
  if (Date.now() - pbiAuthFailedAt > PBI_AUTH_COOLDOWN_MS) {
    pbiAuthFailedAt = null;
    return false;
  }
  return true;
}

function openPbiCircuit(): void {
  pbiAuthFailedAt = Date.now();
  logger.error("[powerbi] Circuit breaker opened — Power BI auth failed. All DAX queries blocked for 5 min.");
}

export function isPbiHealthy(): boolean {
  return !isPbiCircuitOpen();
}

export function resetPbiCircuit(): void {
  pbiAuthFailedAt = null;
  logger.info("[powerbi] Circuit breaker manually reset.");
}

export function checkPbiRateLimit(): void {
  const now = Date.now();
  while (pbiCallTimestamps.length > 0 && now - pbiCallTimestamps[0] > PBI_WINDOW_MS) {
    pbiCallTimestamps.shift();
  }
  if (pbiCallTimestamps.length >= PBI_MAX_CALLS_PER_MINUTE) {
    throw new Error(`Power BI API rate limit exceeded (${PBI_MAX_CALLS_PER_MINUTE} calls/min). Please wait and try again.`);
  }
  pbiCallTimestamps.push(now);
}

export { isPbiCircuitOpen, openPbiCircuit };
