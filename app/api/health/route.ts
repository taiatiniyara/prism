import { db } from "@/db/connection";
import { sql } from "drizzle-orm";
import { testPowerBiConnection } from "@/lib/powerbi.service";
import { getCircuitState } from "@/lib/ai/service";
import { AI_MODELS } from "@/lib/ai/types";
import { logger } from "@/lib/logger";

interface CheckResult {
  ok: boolean;
  message: string;
}

interface DbCheck extends CheckResult {
  ms: number;
}

interface PowerBiCheck extends CheckResult {
  datasets_accessible: boolean;
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
    return { ok: false, ms, message };
  }
}

export async function GET(_request: Request): Promise<Response> {
  const [dbCheck, powerBiCheck, smtpCheck, wbCheck] = await Promise.allSettled([
    checkDb(),
    testPowerBiConnection(),
    checkSmtp(),
    checkWorldBank(),
  ]);

  const sonnetCheck = checkCircuit(AI_MODELS.primary);
  const haikuCheck = checkCircuit(AI_MODELS.fallback);

  const resolveCheck = <T>(result: PromiseSettledResult<T>, fallback: T): T => {
    if (result.status === "fulfilled") return result.value;
    return fallback;
  };

  const db = resolveCheck(dbCheck, {
    ok: false,
    ms: 0,
    message: dbCheck.status === "rejected" ? String(dbCheck.reason) : "Unknown error",
  });

  const powerbi = resolveCheck(powerBiCheck, {
    ok: false,
    datasets_accessible: false,
    message: powerBiCheck.status === "rejected" ? String(powerBiCheck.reason) : "Unknown error",
  } as PowerBiCheck);

  const smtp = resolveCheck(smtpCheck, {
    ok: false,
    configured: false,
    message: smtpCheck.status === "rejected" ? String(smtpCheck.reason) : "Unknown error",
  } as SmtpCheck);

  const worldbank = resolveCheck(wbCheck, {
    ok: false,
    ms: 0,
    message: wbCheck.status === "rejected" ? String(wbCheck.reason) : "Unknown error",
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

  return Response.json(body);
}
