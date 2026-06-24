import path from "node:path";
import fs from "node:fs";

function isSecretKey(key: string): boolean {
  const upper = key.toUpperCase();
  return (
    upper.includes("SECRET") ||
    upper.includes("_KEY") ||
    upper.includes("PASS") ||
    upper.includes("TOKEN")
  );
}

function redactValue(value: string): string {
  if (value.length <= 8) return "XXXXXXXX";
  return value.slice(0, 4) + "..." + value.slice(-4);
}

interface ConfigVar {
  key: string;
  status: "set" | "unset";
  preview: string;
  exampleValue: string;
}

interface ConfigFlag {
  name: string;
  enabled: boolean;
}

interface ConfigResponse {
  vars: ConfigVar[];
  flags: ConfigFlag[];
  missingFromExample: string[];
}

const KNOWN_VARS = [
  "DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL",
  "API_KEY",
  "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS",
  "POWERBI_CLIENT_ID", "POWERBI_TENANT_ID", "POWERBI_CLIENT_SECRET",
  "POWERBI_EMBED_URL", "POWERBI_WORKSPACE_ID", "POWERBI_REPORT_ID",
  "POWERBI_DATASET_ID", "POWERBI_WORKSPACE_NAME", "POWERBI_REPORT_NAME",
  "POWERBI_DATASET_NAME", "POWERBI_EFFECTIVE_IDENTITY_UPN",
  "POWERBI_EFFECTIVE_IDENTITY_ROLES",
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_BETTER_AUTH_URL",
  "AI_RATE_LIMIT_PER_MINUTE", "AI_RATE_LIMIT_PER_15MIN",
  "AI_DEFAULT_DAILY_COST_LIMIT_CENTS",
  "PRISM_TRAINING_MIGRATION_URL", "PRISM_TRAINING_API_BASE_URL",
  "PRISM_TRAINING_API_KEY", "PRISM_TRAINING_MIGRATION_KEY",
  "LEGACY_PROXY_FETCH_TIMEOUT_MS",
  "EMAIL_INBOUND_WEBHOOK_SECRET", "EMAIL_INBOUND_REFERENCE_SECRET",
  "NODE_ENV", "LOG_LEVEL", "PG_POOL_MAX",
  "PIPELINE_STUCK_DAYS", "BACKUP_WARN_HOURS",
  "OVERVIEW_REFRESH_SECONDS", "LOG_BUFFER_SIZE",
];

function parseExampleFile(): Map<string, string> {
  const examplePath = path.join(process.cwd(), ".env.example");
  const exampleMap = new Map<string, string>();
  try {
    const content = fs.readFileSync(examplePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (key) exampleMap.set(key, value);
    }
  } catch {
    // .env.example not found — skip
  }
  return exampleMap;
}

export function getConfig(): ConfigResponse {
  const exampleMap = parseExampleFile();
  const vars: ConfigVar[] = [];
  const allSeen = new Set<string>();

  for (const key of KNOWN_VARS) {
    allSeen.add(key);
    const raw = process.env[key];
    const isset = raw !== undefined && raw !== "";
    const isSecret = isSecretKey(key);
    vars.push({
      key,
      status: isset ? "set" : "unset",
      preview: isset ? (isSecret ? redactValue(raw) : raw) : "—",
      exampleValue: exampleMap.get(key) || "—",
    });
  }

  // Add any vars from .env.example not in KNOWN_VARS
  const missingFromExample: string[] = [];
  for (const [exampleKey] of exampleMap) {
    if (!allSeen.has(exampleKey)) {
      missingFromExample.push(exampleKey);
    }
  }

  // Union: also pick up any actual env vars not in KNOWN_VARS
  for (const key of Object.keys(process.env)) {
    if (!allSeen.has(key)) {
      const raw = process.env[key];
      if (raw !== undefined && raw !== "") {
        allSeen.add(key);
        const isSecret = isSecretKey(key);
        vars.push({
          key,
          status: "set" as const,
          preview: isSecret ? redactValue(raw) : raw,
          exampleValue: "—",
        });
      }
    }
  }

  const hasPbi = ["POWERBI_CLIENT_ID", "POWERBI_CLIENT_SECRET", "POWERBI_TENANT_ID", "POWERBI_EMBED_URL"]
    .every((k) => (process.env[k] ?? "") !== "");
  const pbiWorkspace = (process.env.POWERBI_WORKSPACE_ID ?? process.env.POWERBI_WORKSPACE_NAME ?? "") !== "";
  const pbiDataset = (process.env.POWERBI_DATASET_ID ?? process.env.POWERBI_DATASET_NAME ?? "") !== "";

  const flags: ConfigFlag[] = [
    { name: "Power BI enabled", enabled: hasPbi && pbiWorkspace && pbiDataset },
    { name: "SMTP configured", enabled: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"]
      .every((k) => (process.env[k] ?? "") !== "") },
    { name: "AI available", enabled: (process.env.ANTHROPIC_API_KEY ?? "") !== "" },
    { name: "Legacy training proxy enabled", enabled: (process.env.PRISM_TRAINING_API_BASE_URL ?? "") !== "" },
  ];

  return { vars, flags, missingFromExample };
}
