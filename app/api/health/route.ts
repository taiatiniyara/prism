import { db } from "@/db/connection";
import { sql } from "drizzle-orm";
import { testPowerBiConnection, isPbiHealthy } from "@/lib/powerbi";
import { getCircuitState } from "@/lib/ai/service";
import { AI_MODELS } from "@/lib/ai/types";
import { logger } from "@/lib/logging/logger";
import { getCurrentUser } from "@/lib/user.service";

interface CheckResult {
  ok: boolean;
  message: string;
}

interface DbCheck extends CheckResult {
  ms: number;
}

interface PowerBiCheck extends CheckResult {
  datasets_accessible: boolean;
  circuit_open: boolean;
}

interface ModelCheck extends CheckResult {
  circuit_open: boolean;
  remaining_seconds: number;
}

interface SmtpCheck extends CheckResult {
  configured: boolean;
}

interface WbCheck extends CheckResult {
  ms: number;
}

interface HealthResponse {
  status: "ok" | "degraded" | "down";
  uptime_seconds: number;
  checks: {
    db: DbCheck;
    powerbi: PowerBiCheck;
    ai_models: {
      sonnet: ModelCheck;
      haiku: ModelCheck;
    };
    smtp: SmtpCheck;
    worldbank: WbCheck;
  };
}

async function checkDb(): Promise<DbCheck> {
  const start = Date.now();
  try {
    const result = await db.execute(sql`SELECT 1`);
    const ms = Date.now() - start;
    const ok = Array.isArray(result) ? result.length > 0 : (result.rows?.length ?? 0) > 0;
    return {
      ok,
      ms,
      message: ok ? "" : "No result from DB ping",
    };
  } catch (error) {
    const ms = Date.now() - start;
    const message = error instanceof Error ? error.message : "DB connection failed";
    logger.error("[health] DB check failed", { error: message });
    return { ok: false, ms, message };
  }
}

function checkCircuit(modelName: string): ModelCheck {
  const circuit = getCircuitState(modelName);
  return {
    ok: !circuit.open,
    circuit_open: circuit.open,
    remaining_seconds: circuit.remaining,
    message: circuit.open
      ? `Circuit breaker open. ${circuit.remaining}s remaining.`
      : "",
  };
}

async function checkSmtp(): Promise<SmtpCheck> {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host || !port || !user || !pass) {
    return {
      ok: false,
      configured: false,
      message: "SMTP not fully configured. Missing HOST, PORT, USER, or PASS.",
    };
  }

  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.default.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
    });
    const verified = await transport.verify();
    try { transport.close(); } catch { /* cleanup best-effort */ }
    return {
      ok: verified === true,
      configured: true,
      message: verified === true ? "" : "SMTP verify returned unexpected response",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMTP connection failed";
    return { ok: false, configured: true, message };
  }
}

async function checkWorldBank(): Promise<WbCheck> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      "https://api.worldbank.org/v2/country?format=json&per_page=1",
      { signal: controller.signal },
    );
    clearTimeout(timeout);
    const ms = Date.now() - start;
    if (res.ok) {
      return { ok: true, ms, message: "" };
    }
    return { ok: false, ms, message: `World Bank API returned HTTP ${res.status}` };
  } catch (error) {
    const ms = Date.now() - start;
    const message = error instanceof Error ? error.message : "World Bank API unreachable";
    logger.warn("[health] World Bank check failed", { error: message });
    return { ok: false, ms, message };
  }
}

export async function GET(_request: Request): Promise<Response> {
  const [dbResult, smtpResult, wbResult] = await Promise.allSettled([
    checkDb(),
    checkSmtp(),
    checkWorldBank(),
  ]);

  const circuitOpen = !isPbiHealthy();
  let powerbi: PowerBiCheck;
  if (circuitOpen) {
    powerbi = {
      ok: false,
      datasets_accessible: false,
      circuit_open: true,
      message: "Power BI circuit breaker is open — auth failures detected. Cooldown in effect.",
    };
  } else {
    try {
      const result = await testPowerBiConnection();
      powerbi = { ...result, circuit_open: false };
    } catch (err) {
      powerbi = {
        ok: false,
        datasets_accessible: false,
        circuit_open: false,
        message: err instanceof Error ? err.message : "Power BI connection test failed",
      };
    }
  }

  const sonnetCheck = checkCircuit(AI_MODELS.primary);
  const haikuCheck = checkCircuit(AI_MODELS.fallback);

  const resolveCheck = <T>(result: PromiseSettledResult<T>, fallback: T): T => {
    if (result.status === "fulfilled") return result.value;
    return fallback;
  };

  const db = resolveCheck(dbResult, {
    ok: false,
    ms: 0,
    message: dbResult.status === "rejected" ? String(dbResult.reason) : "Unknown error",
  });

  const smtp = resolveCheck(smtpResult, {
    ok: false,
    configured: false,
    message: smtpResult.status === "rejected" ? String(smtpResult.reason) : "Unknown error",
  } as SmtpCheck);

  const worldbank = resolveCheck(wbResult, {
    ok: false,
    ms: 0,
    message: wbResult.status === "rejected" ? String(wbResult.reason) : "Unknown error",
  } as WbCheck);

  let status: HealthResponse["status"];
  if (!db.ok) {
    status = "down";
  } else if (!powerbi.ok || !sonnetCheck.ok || !haikuCheck.ok || !smtp.ok || !worldbank.ok) {
    status = "degraded";
  } else {
    status = "ok";
  }

  const body: HealthResponse = {
    status,
    uptime_seconds: Math.floor(process.uptime()),
    checks: {
      db,
      powerbi,
      ai_models: {
        sonnet: sonnetCheck,
        haiku: haikuCheck,
      },
      smtp,
      worldbank,
    },
  };

  // Liveness (status + uptime) is public so external monitors keep working,
  // but the per-component diagnostics (DB latency, SMTP/PowerBI/Azure
  // connectivity, AI circuit state, raw error strings) are internal detail —
  // expose them only to authenticated DEV/BMO to avoid information disclosure.
  const currentUser = await getCurrentUser().catch(() => null);
  const isAdmin = currentUser?.role === "DEV" || currentUser?.role === "BMO";
  if (!isAdmin) {
    return Response.json({
      status: body.status,
      uptime_seconds: body.uptime_seconds,
    });
  }

  return Response.json(body);
}
