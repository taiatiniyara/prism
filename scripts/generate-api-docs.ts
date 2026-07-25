import * as fs from "node:fs";
import * as path from "node:path";

// ─── scanner ────────────────────────────────────────────────────────────────

interface RouteInfo {
  path: string;
  file: string;
  methods: {
    method: string;
    authType: "session" | "apiKey" | "migrationKey" | "cronKey" | "none";
    queryParams: { name: string; required: boolean }[];
    pathParams: string[];
    description: string;
    responseStatuses: number[];
    isStreaming: boolean;
    requestBodyDescription: string | null;
    tag: string;
  }[];
}

function* walk(dir: string): Generator<string> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function findRouteFiles(apiDir: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(apiDir)) return [];
  const files: string[] = [];
  for (const f of walk(apiDir)) {
    if (path.basename(f) === "route.ts" || path.basename(f) === "route.tsx") {
      files.push(f);
    }
  }
  return files;
}

function routePathFromFile(file: string, apiDir: string): string {
  const rel = path.relative(apiDir, file);
  const parts = rel.split(path.sep);
  parts.pop(); // remove route.ts
  const segments = parts.map((p) => {
    if (p.startsWith("[") && p.endsWith("]")) {
      const inner = p.slice(1, -1);
      // [...all] is a catch-all
      if (inner.startsWith("...")) return `{${inner.slice(3)}+}`;
      return `{${inner}}`;
    }
    return p;
  });
  return "/api/" + segments.join("/");
}

function extractPathParams(routePath: string): string[] {
  const params: string[] = [];
  for (const segment of routePath.split("/")) {
    const m = segment.match(/^\{([^+}]+)\+?/);
    if (m) params.push(m[1]);
  }
  return params;
}

function extractMethods(source: string): string[] {
  const methods: string[] = [];
  const re = /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    methods.push(m[1]);
  }
  return methods;
}

function detectAuthType(source: string): { authType: RouteInfo["methods"][0]["authType"]; requiresRole: string | null } {
  // Session auth via getCurrentUser
  if (source.includes("getCurrentUser") || source.includes("requireUser()")) {
    return { authType: "session", requiresRole: null };
  }

  // API key auth
  if (source.includes("authorizeApiKey") || source.includes("withApiKeyAuth")) {
    return { authType: "apiKey", requiresRole: null };
  }

  // Migration key
  if (source.includes("assertMigrationKey") || source.includes("x-migration-key")) {
    return { authType: "migrationKey", requiresRole: null };
  }

  // Cron secret
  if (source.includes("CRON_SECRET") || source.includes("cron_secret")) {
    return { authType: "cronKey", requiresRole: null };
  }

  // Auth handler (Better Auth all route)
  if (source.includes("toNextJsHandler") || source.includes("auth.handler")) {
    return { authType: "session", requiresRole: null };
  }

  return { authType: "none", requiresRole: null };
}

function extractQueryParams(source: string): { name: string; required: boolean }[] {
  const params: { name: string; required: boolean }[] = [];
  const seen = new Set<string>();

  // searchParams.get("key")
  const getRe = /searchParams\.get\(['"]([^'"]+)['"]\)/g;
  let m: RegExpExecArray | null;
  while ((m = getRe.exec(source)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      // Check usage: if there's a null check after, it's optional
      const afterMatch = source.slice(m.index);
      const isRequired = !afterMatch.match(
        // eslint-disable-next-line security/detect-non-literal-regexp
        new RegExp(`searchParams\\.get\\(['"]${m[1]}['"]\\)\\s*\\|\\|`),
      ) &&
      !afterMatch.match(
        // eslint-disable-next-line security/detect-non-literal-regexp
        new RegExp(`['"]${m[1]}['"]\\s*\\|\\|`),
      );
      params.push({ name: m[1], required: isRequired });
    }
  }

  // parseLimit(raw), parseIntParam(raw), parseBoolParam(raw)
  const customParseRe = /(?:parseLimit|parseIntParam|parseBoolParam|parseOffset)\(([^)]+)\)/g;
  while ((m = customParseRe.exec(source)) !== null) {
    // Extract variable name from argument
    const argMatch = m[1].match(/['"]([^'"]+)['"]/) || m[1].match(/(\w+)/);
    if (argMatch && !seen.has(argMatch[1])) {
      seen.add(argMatch[1]);
      params.push({ name: argMatch[1], required: false });
    }
  }

  return params;
}

function extractResponseStatuses(source: string): number[] {
  const statuses = new Set<number>();
  const re = /\{\s*status:\s*(\d+)\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    statuses.add(Number(m[1]));
  }
  // Default 200 for routes without explicit status
  if (statuses.size === 0) statuses.add(200);
  return [...statuses].sort();
}

function inferDescription(routePath: string, method: string, _methods: string[]): string {
  const segments = routePath.split("/").filter(Boolean);

  // Route-specific descriptions
  const pathMap: Record<string, Record<string, string>> = {
    "/api/health": { GET: "Health check endpoint — returns system status, DB connectivity, Power BI circuit breaker state, AI model status, SMTP, and World Bank API reachability" },
    "/api/auth/[...all]": { "*": "Authentication handler for Better Auth — manages sessions, email/password login, magic links, and token refresh" },
    "/api/ai/chat": { POST: "AI chat — sends messages to Anthropic Claude with streaming SSE response, rate limiting, guardrails, and tool execution" },
    "/api/ai/chat/response": { POST: "AI chat response — generates AI response for a single message (non-streaming), with tool execution support" },
    "/api/ai/sessions": { GET: "List AI chat sessions for the current user", POST: "Create a new AI chat session" },
    "/api/ai/usage": { GET: "Get AI usage statistics for the current user (token counts, cost, rate limit status)" },
    "/api/ai/export": { POST: "Export AI chat session data (conversations, tool calls, metrics)" },
    "/api/ai/feedback": { POST: "Submit feedback for an AI chat turn (helpful/unhelpful, rating, comments)" },
    "/api/deployment/info": { GET: "Get deployment information (version, build timestamp, environment)" },
    "/api/backup/status": { GET: "Get database backup status and history" },
    "/api/security/overview": { GET: "Get security overview (auth status, encryption, rate limits, recent alerts)" },
    "/api/costs/overview": { GET: "Get AI cost overview (daily/monthly spend, budget usage, per-user breakdown)" },
    "/api/data-pipeline/stats": { GET: "Get data pipeline statistics (queue depth, processing rates, error counts)" },
    "/api/kpi/calculation-status": { GET: "Get KPI calculation worker status (pending, processing, completed, failed)" },
    "/api/context/organisation": { GET: "Get current user's organisation context and details" },
    "/api/webhooks/email/replies": { POST: "Receive and process incoming email reply webhooks" },
    "/api/cron/email-schedules": { POST: "Cron endpoint for processing scheduled email sends (API-key gated)" },
    "/api/getAzureAccessToken": { POST: "Get Azure AD access token for Power BI embedding (RS256 JWT for service principal)" },
    "/api/pbiRls": { GET: "Power BI Row-Level Security token generation" },
    "/api/submissions": { GET: "Get data entry submission records and statuses" },
    "/api/alerts": { GET: "Get system alerts and notifications" },
    "/api/dev/config": { GET: "Get development configuration flags and feature toggles" },
    "/api/ui-style": { GET: "Get dynamic UI theme/style configuration CSS" },
  };

  const exact = pathMap[routePath]?.[method] || pathMap[routePath]?.["*"];
  if (exact) return exact;

  // Pattern-based descriptions
  if (routePath.startsWith("/api/data-entry/balanced-scorecard/new-bsc/")) {
    const bscPart = routePath.replace("/api/data-entry/balanced-scorecard/new-bsc/", "");
    const bscMap: Record<string, Record<string, string>> = {
      "scorecard": { GET: "Get balanced scorecard data with perspectives, objectives, KPIs, and initiatives", PUT: "Save/update scorecard perspective overlay configuration" },
      "template": { GET: "List all BSC template nodes", POST: "Create a new BSC template node" },
      "theme": { GET: "Get BSC theme styling configuration", PUT: "Save/update BSC theme styling" },
      "kpi-options": { GET: "Get available KPI options for BSC scorecard assignment" },
      "report-types": { GET: "Get available report types for BSC configuration" },
      "targets": { GET: "Get KPI target values for BSC", PUT: "Save/update BSC KPI target values" },
      "target-plans": { GET: "Get BSC target plan trajectories", PUT: "Save/update BSC target plan trajectories" },
      "trajectory": { GET: "Get BSC KPI trajectory data over time", PUT: "Set BSC KPI trajectory" },
      "strategy-map": { GET: "Get BSC strategy map structure (nodes and edges)", PUT: "Save/update BSC strategy map layout" },
    };
    if (bscMap[bscPart]?.[method]) return bscMap[bscPart][method];
    if (routePath.includes("template") && routePath.includes("{id}")) {
      if (routePath.includes("links")) return method === "GET" ? "Get template node links/relationships" : "Update template node links";
      return method === "GET" ? "Get template node details" : method === "PUT" ? "Update template node" : "Delete template node";
    }
    if (routePath.includes("strategy-map/links")) return method === "GET" ? "Get strategy map links" : method === "POST" ? "Create strategy map link" : "Delete strategy map link";
    if (routePath.includes("strategy-map/nodes")) return method === "PUT" ? "Update strategy map node position" : "Get strategy map node";
    return `${method} ${bscPart}`;
  }

  if (routePath.startsWith("/api/data-entry/review-kpi/")) {
    const reviewPart = routePath.replace("/api/data-entry/review-kpi/", "");
    if (reviewPart === "") return { GET: "Get KPI review queue and filter context", POST: "Submit review decision for a KPI input" }[method] || `${method} review-kpi`;
    if (reviewPart === "events") return { GET: "Get KPI review events (SSE stream of real-time updates)" }[method] || `${method} review-kpi events`;
    if (reviewPart.startsWith("inputs/")) {
      if (reviewPart.includes("comments")) return { GET: "Get comment thread for a review KPI input", POST: "Add comment to a review KPI input" }[method] || `${method} review-kpi input comments`;
      return { GET: "Get review KPI input details", PATCH: "Update review KPI input value" }[method] || `${method} review-kpi input`;
    }
  }

  if (routePath.startsWith("/api/data-entry/custom-kpi/")) {
    const ckpiPart = routePath.replace("/api/data-entry/custom-kpi/", "");
    if (ckpiPart === "requests") return { GET: "List custom KPI requests", POST: "Create a custom KPI request" }[method] || `${method} custom-kpi requests`;
    if (ckpiPart === "email-retries") return { POST: "Retry failed custom KPI email notifications" }[method] || `${method} custom-kpi emails`;
    if (ckpiPart.startsWith("requests/{requestId}/")) {
      if (ckpiPart.includes("promotion")) return { POST: "Promote custom KPI request to a standard KPI definition" }[method] || `${method} custom-kpi promotion`;
      if (ckpiPart.includes("decision")) return { POST: "Submit approval/rejection decision for a custom KPI request" }[method] || `${method} custom-kpi decision`;
    }
  }

  if (routePath.startsWith("/api/data-entry/")) {
    const dePart = routePath.replace("/api/data-entry/", "");
    const deMap: Record<string, Record<string, string>> = {
      "utility-context": { GET: "Get data entry utility context (scope, report periods, filters)", POST: "Save data entry utility context" },
      "governance": { GET: "Get governance data and validation rules", POST: "Save governance data" },
      "logs": { GET: "Get data entry processing logs and run history" },
      "aggregated-runs": { GET: "List aggregated data entry processing runs" },
      "kpi-worker/status": { GET: "Get KPI calculation worker queue status and statistics" },
    };
    if (deMap[dePart]?.[method]) return deMap[dePart][method];
    if (dePart.startsWith("aggregated-runs/{")) return { GET: "Get aggregated run details by ID" }[method] || `${method} aggregated run`;
    if (dePart.startsWith("review-kpi/")) return `${method} review-kpi ${dePart}`;
    if (dePart.startsWith("custom-kpi/")) return `${method} custom-kpi ${dePart}`;
    return `${method} data-entry ${dePart}`;
  }

  if (routePath.startsWith("/api/logs/")) {
    const logPart = routePath.replace("/api/logs/", "");
    const logMap: Record<string, Record<string, string>> = {
      "system": { GET: "Get system logs (filterable by level, source, date)", POST: "Write a system log entry" },
      "error": { POST: "Record client-side error in server logs" },
      "audit": { GET: "Get audit trail logs (user actions, data changes, auth events)" },
      "errors": { POST: "Record error to system error log" },
    };
    return logMap[logPart]?.[method] || `${method} log ${logPart}`;
  }

  if (routePath.startsWith("/api/settings/users/")) {
    const userPart = routePath.replace("/api/settings/users/", "");
    if (userPart === "pending") return { GET: "Get pending user registrations awaiting approval" }[method] || `${method} pending users`;
    if (userPart.startsWith("{userId}/status")) return { PUT: "Update user account status (activate, deactivate, approve, reject)" }[method] || `${method} user status`;
    if (userPart.startsWith("{userId}/clarifications")) return { POST: "Send clarification request to pending user registrant" }[method] || `${method} user clarifications`;
  }

  if (routePath.startsWith("/api/migration/")) {
    const migPart = routePath.replace("/api/migration/", "");
    const migMap: Record<string, Record<string, string>> = {
      "users": { GET: "Export users for migration to PRISM v2" },
      "input-definitions": { GET: "Export input definitions for migration" },
      "inputRelevance": { GET: "Export input relevance mappings for migration" },
      "dataEntryStatus": { GET: "Export data entry statuses for migration" },
      "prism1ToPrism2InputMapping": { GET: "Get PRISM v1 to v2 input definition mapping" },
      "prism-training": { GET: "Export data from prism-training for migration" },
    };
    if (migMap[migPart]?.[method]) return migMap[migPart][method];
    if (migPart.startsWith("prism-training/{")) return { GET: "Export specific table from prism-training for migration" }[method] || `${method} migration table`;
    return `${method} migration ${migPart}`;
  }

  // Legacy dim/fact routes (proxy to prism-training)
  if (routePath.startsWith("/api/dim") || routePath.startsWith("/api/fact")) {
    const dimFactPart = routePath.replace("/api/", "");
    const dimFactMap: Record<string, string> = {
      "dimUtilities": "Dimension: Utility companies and energy providers",
      "dimCountry": "Dimension: Countries and territories",
      "dimGenerators": "Dimension: Power generation units and plants",
      "dimEnergyProvider": "Dimension: Energy providers by type",
      "dimEnergySource": "Dimension: Energy source classifications",
      "dimEnergyType": "Dimension: Energy type categories",
      "dimCustomerClass": "Dimension: Customer classification types",
      "dimServiceAreas": "Dimension: Geographic service areas",
      "dimRegion": "Dimension: Geographic regions and subregions",
      "dimRoles": "Dimension: User roles and permissions",
      "dimReportType": "Dimension: Report type definitions",
      "dimUnits": "Dimension: Measurement units",
      "dimCurrency": "Dimension: Currencies",
      "dimAccounting": "Dimension: Accounting codes",
      "dimFuelRegulation": "Dimension: Fuel regulation types",
      "dimFuelAccess": "Dimension: Fuel access levels",
      "dimElectricityRegulations": "Dimension: Electricity regulation frameworks",
      "dimFeeder": "Dimension: Electrical feeder classifications",
      "dimGender": "Dimension: Gender categories for workforce data",
      "dimGovernance": "Dimension: Governance structures and types",
      "dimOwnership": "Dimension: Ownership types (public, private, mixed)",
      "dimQuality": "Dimension: Quality standards and metrics",
      "dimRegulation": "Dimension: Regulatory body types",
      "dimDivision": "Dimension: Organisational divisions",
      "factGeneration": "Fact: Electricity generation data (KWh, fuel consumption, capacity)",
      "factGeneratorData": "Fact: Generator operational data and performance metrics",
      "factCurrency": "Fact: Currency exchange rates over time",
      "factTariffStructure": "Fact: Electricity tariff structures and rates",
      "factDistribution": "Fact: Electricity distribution data (losses, reliability)",
      "factTransmission": "Fact: Electricity transmission data (grid, interconnections)",
      "factEmployee": "Fact: Workforce and employee data",
      "factGdpPerCapita": "Fact: GDP per capita economic indicators",
      "factPopulation": "Fact: Population data by country/region",
      "factInflationRate": "Fact: Inflation rate economic indicators",
      "factHouseholds": "Fact: Household count and electrification data",
      "factLandArea": "Fact: Geographic land area data",
      "factSafety": "Fact: Workplace safety incident data",
      "factElectricityAccess": "Fact: Electricity access rates (rural, urban, national)",
      "factFinancialAccounts": "Fact: Financial account data (revenue, costs, subsidies)",
      "factGovernance": "Fact: Governance assessment data",
      "factLeadership": "Fact: Leadership and management data",
      "factMetering": "Fact: Metering infrastructure data",
      "factPopulationDistribution": "Fact: Population distribution (urban/rural breakdowns)",
      "factUnemployment": "Fact: Unemployment rate data",
      "factUtilityContextData": "Fact: Utility context and metadata",
      "factUtilityCosts": "Fact: Utility cost and expense data",
      "factAirConnectivity": "Fact: Air transportation connectivity data",
      "factCountryContextData": "Fact: Country-level context and metadata",
      "factSaidiAndSaifi": "Fact: SAIDI/SAIFI reliability indices",
      "factIslands": "Fact: Island geography and connectivity data",
    };
    const desc = dimFactMap[dimFactPart];
    return desc ? `${desc} (API-key gated, proxy to prism-training)` : `${method} ${dimFactPart} (API-key gated)`;
  }

  // Generic fallback
  const lastSeg = segments[segments.length - 1] || "";
  const action = { GET: "Get", POST: "Create", PUT: "Update", DELETE: "Delete", PATCH: "Update" }[method] || method;
  const subject = lastSeg.replace(/[-_]/g, " ");
  return `${action} ${subject}`;
}

function inferTag(routePath: string): string {
  const seg = routePath.split("/").filter(Boolean);
  if (seg.length < 2) return "General";
  const domain = seg[1]; // after /api/
  const tagMap: Record<string, string> = {
    "auth": "Auth",
    "ai": "AI / Chatbot",
    "health": "Monitoring",
    "deployment": "Monitoring",
    "backup": "Monitoring",
    "security": "Monitoring",
    "costs": "Monitoring",
    "data-pipeline": "Monitoring",
    "logs": "Logging",
    "users": "Users",
    "settings": "Settings",
    "data-entry": "Data Entry",
    "migration": "Migration",
    "dimUtilities": "Dimensions",
    "dimCountry": "Dimensions",
    "dimGenerators": "Dimensions",
    "dimRegion": "Dimensions",
    "dimRoles": "Dimensions",
    "dim": "Dimensions",
    "factGeneration": "Facts",
    "factCurrency": "Facts",
    "factEmployee": "Facts",
    "fact": "Facts",
    "context": "Context",
    "webhooks": "Webhooks",
    "cron": "System",
    "getAzureAccessToken": "Power BI",
    "pbiRls": "Power BI",
    "submissions": "Data Entry",
    "alerts": "Monitoring",
    "dev": "Development",
    "ui-style": "UI",
    "kpi": "KPIs",
    "socket_io": "Real-time",
    "promptEmbed": "AI / Chatbot",
    "repairReportPeriods": "System",
  };
  if (tagMap[domain]) return tagMap[domain];
  if (domain.startsWith("dim")) return "Dimensions";
  if (domain.startsWith("fact")) return "Facts";
  if (domain.startsWith("mig")) return "Migration";
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

function isStreaming(source: string): boolean {
  return source.includes("text/event-stream") || source.includes("ReadableStream");
}

function extractRequestBodyDescription(source: string, method: string): string | null {
  if (method === "GET" || method === "DELETE") return null;
  // Try to find parse* function calls for BSC/custom-kpi patterns
  const parseCall = source.match(/parse\w+\(await\s+request\.json\(\)\)/);
  if (parseCall) {
    const fnName = parseCall[0].match(/parse(\w+)/)?.[0];
    if (fnName) return `JSON body — validated by ${fnName}()`;
  }
  // Generic body parse
  if (source.includes("request.json()")) return "JSON body";
  return null;
}

function normalizeAuthForMethod(
  authType: RouteInfo["methods"][0]["authType"],
  _requiresRole: string | null,
): { type: string; description: string } {
  switch (authType) {
    case "session":
      return { type: "session", description: "Requires valid Better Auth session (getCurrentUser)" };
    case "apiKey":
      return { type: "apiKey", description: "Requires API key in Authorization header" };
    case "migrationKey":
      return { type: "migrationKey", description: "Requires x-migration-key header" };
    case "cronKey":
      return { type: "cronKey", description: "Requires CRON_SECRET in Authorization header" };
    case "none":
      return { type: "none", description: "No authentication required" };
  }
}

function parseRouteFile(filePath: string, apiDir: string): RouteInfo | null {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const source = fs.readFileSync(filePath, "utf-8");
  const methods = extractMethods(source);
  if (methods.length === 0) return null;

  const routePath = routePathFromFile(filePath, apiDir);
  const pathParams = extractPathParams(routePath);
  const queryParams = extractQueryParams(source);
  const responseStatuses = extractResponseStatuses(source);
  const streaming = isStreaming(source);
  const tag = inferTag(routePath);

  // We don't need to resolve full imports for auth detection
  const { authType: _authType } = detectAuthType(source);

  return {
    path: routePath,
    file: filePath,
    methods: methods.map((method) => {
      const { authType } = detectAuthType(source);
      return {
        method,
        authType,
        queryParams: method === "GET" || method === "DELETE" ? queryParams : [],
        pathParams,
        description: inferDescription(routePath, method, methods),
        responseStatuses,
        isStreaming: method === "GET" ? streaming : false,
        requestBodyDescription: extractRequestBodyDescription(source, method),
        tag,
      };
    }),
  };
}

// ─── YAML generator (hand-rolled to avoid dependencies) ──────────────────────

function yamlStr(value: string): string {
  if (/[":{}[\]&*#?|><=!%@`,\[\]]/.test(value) || value.length === 0) {
    return JSON.stringify(value);
  }
  return value;
}

function generateOpenApiYaml(routes: RouteInfo[], projectName: string): string {
  const lines: string[] = [];
  const push = (l: string) => lines.push(l);

  push("openapi: 3.1.0");
  push(`info:`);
  push(`  title: ${projectName} API`);
  push(`  version: "1.0.0"`);
  push(`  description: |`);
  push(`    Auto-generated API reference for ${projectName}.`);
  push(`    Regenerate with: npm run generate-api-docs`);
  push(`servers:`);
  push(`  - url: http://localhost:3554`);
  push(`    description: Local development`);
  push(`  - url: https://prism.example.com`);
  push(`    description: Production`);

  // Security schemes
  push(`components:`);
  push(`  securitySchemes:`);
  push(`    sessionAuth:`);
  push(`      type: apiKey`);
  push(`      in: cookie`);
  push(`      name: session_token`);
  push(`      description: Better Auth session cookie`);
  push(`    apiKeyAuth:`);
  push(`      type: apiKey`);
  push(`      in: header`);
  push(`      name: Authorization`);
  push(`      description: API key for protected endpoints`);
  push(`    migrationKeyAuth:`);
  push(`      type: apiKey`);
  push(`      in: header`);
  push(`      name: x-migration-key`);
  push(`      description: Migration endpoint access key`);

  // Tag definitions
  const tags = new Set(routes.flatMap((r) => r.methods.map((m) => m.tag)));
  push(`  tags:`);
  for (const tag of [...tags].sort()) {
    push(`    - name: ${yamlStr(tag)}`);
  }
  push("");

  // Paths
  // Group by route path
  const byPath = new Map<string, RouteInfo[]>();
  for (const route of routes) {
    const existing = byPath.get(route.path) || [];
    existing.push(route);
    byPath.set(route.path, existing);
  }

  push(`paths:`);

  for (const [routePath, routeInfos] of byPath.entries()) {
    // OpenAPI path format: /api/data-entry/balanced-scorecard/new-bsc/template/{id}
    const openApiPath = routePath.replace(/\{([^}]+)\+?\}/g, "{$1}");

    push(`  ${openApiPath}:`);

    // Merge methods from all route.ts files at this path (shouldn't happen often)
    const allMethods = routeInfos.flatMap((r) => r.methods);

    for (const endpoint of allMethods) {
      const methodLower = endpoint.method.toLowerCase();
      push(`    ${methodLower}:`);
      push(`      tags:`);
      push(`        - ${yamlStr(endpoint.tag)}`);
      push(`      summary: ${yamlStr(endpoint.description)}`);
      if (endpoint.isStreaming) {
        push(`      description: >-`);
        push(`        ${endpoint.description}`);
        push(`        Response is a Server-Sent Events (SSE) stream.`);
      }

      // Parameters
      const hasParams = endpoint.pathParams.length > 0 || endpoint.queryParams.length > 0;
      if (hasParams) {
        push(`      parameters:`);
        for (const pp of endpoint.pathParams) {
          push(`        - name: ${yamlStr(pp)}`);
          push(`          in: path`);
          push(`          required: true`);
          push(`          schema:`);
          push(`            type: string`);
        }
        for (const qp of endpoint.queryParams) {
          push(`        - name: ${yamlStr(qp.name)}`);
          push(`          in: query`);
          push(`          required: ${qp.required}`);
          push(`          schema:`);
          push(`            type: string`);
        }
      }

      // Security
      let securityScheme = "";
      const auth = normalizeAuthForMethod(endpoint.authType, null);
      if (endpoint.authType === "session") {
        securityScheme = "sessionAuth";
      } else if (endpoint.authType === "apiKey") {
        securityScheme = "apiKeyAuth";
      } else if (endpoint.authType === "migrationKey" || endpoint.authType === "cronKey") {
        securityScheme = "migrationKeyAuth";
      }
      if (securityScheme) {
        push(`      security:`);
        push(`        - ${securityScheme}: []`);
      }
      push(`      x-auth: ${yamlStr(auth.description)}`);

      // Request body
      if (endpoint.requestBodyDescription) {
        push(`      requestBody:`);
        push(`        description: ${yamlStr(endpoint.requestBodyDescription)}`);
        push(`        content:`);
        push(`          application/json:`);
        push(`            schema:`);
        push(`              type: object`);
      }

      // Responses
      push(`      responses:`);
      for (const status of endpoint.responseStatuses) {
        const statusDesc: Record<number, string> = {
          200: "Success",
          201: "Created",
          400: "Bad Request / Validation Error",
          401: "Unauthorized",
          403: "Forbidden",
          404: "Not Found",
          409: "Conflict",
          429: "Too Many Requests",
          500: "Internal Server Error",
          503: "Service Unavailable",
        };
        push(`        '${status}':`);
        push(`          description: ${yamlStr(statusDesc[status] || `HTTP ${status}`)}`);
      }

      // If auth is none and no explicit security, add empty to indicate public
      if (!securityScheme) {
        push(`      security: []`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

// ─── HTML page generator (self-contained, no CDN) ────────────────────────────

function htmlesc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function methodBadge(method: string): string {
  const colors: Record<string, string> = {
    GET: "#22c55e", POST: "#3b82f6", PUT: "#f59e0b", PATCH: "#8b5cf6", DELETE: "#ef4444",
  };
  const c = colors[method] || "#6b7280";
  return `<span class="method" style="background:${c}">${method}</span>`;
}

function generateHtml(routes: RouteInfo[], projectName: string): string {
  const allEndpoints = routes.flatMap((r) => r.methods);

  // Group by tag
  const byTag = new Map<string, { tag: string; endpoints: { method: string; path: string; desc: string; auth: string; params: string[]; body: string | null; statuses: number[] }[] }>();
  for (const route of routes) {
    for (const ep of route.methods) {
      let group = byTag.get(ep.tag);
      if (!group) {
        group = { tag: ep.tag, endpoints: [] };
        byTag.set(ep.tag, group);
      }
      const paramLines: string[] = [];
      for (const pp of ep.pathParams) paramLines.push(`<code>{${pp}}</code> (path, required)`);
      for (const qp of ep.queryParams) paramLines.push(`<code>${htmlesc(qp.name)}</code> (query${qp.required ? ", required" : ""})`);

      let authDesc = "";
      switch (ep.authType) {
        case "session": authDesc = "Session (Better Auth)"; break;
        case "apiKey": authDesc = "API Key (Authorization header)"; break;
        case "migrationKey": authDesc = "Migration Key (x-migration-key)"; break;
        case "cronKey": authDesc = "Cron Secret (Authorization header)"; break;
        case "none": authDesc = "None (public)"; break;
        default: authDesc = ep.authType;
      }

      group.endpoints.push({
        method: ep.method,
        path: route.path,
        desc: ep.description,
        auth: authDesc,
        params: paramLines,
        body: ep.requestBodyDescription,
        statuses: ep.responseStatuses,
      });
    }
  }

  // Sort tags
  const sortedTags = [...byTag.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const methodCounts: Record<string, number> = {};
  for (const ep of allEndpoints) methodCounts[ep.method] = (methodCounts[ep.method] || 0) + 1;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${htmlesc(projectName)} API Reference</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 0; padding: 0; line-height: 1.5; }
  .container { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  .subtitle { color: #6b7280; font-size: 14px; margin: 0 0 24px; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
  .stat { background: #f3f4f6; border-radius: 6px; padding: 4px 10px; font-size: 13px; }
  @media (prefers-color-scheme: dark) { .stat { background: #1f2937; } }
  .filter { margin-bottom: 20px; }
  .filter input { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
  @media (prefers-color-scheme: dark) { .filter input { background: #111827; border-color: #374151; color: #e5e7eb; } }
  .tag-group { margin-bottom: 32px; }
  .tag-title { font-size: 18px; font-weight: 600; margin: 0 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; }
  @media (prefers-color-scheme: dark) { .tag-title { border-color: #374151; } }
  .endpoint { border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
  @media (prefers-color-scheme: dark) { .endpoint { border-color: #374151; } }
  .ep-header { display: flex; align-items: baseline; gap: 10px; padding: 10px 14px; cursor: pointer; user-select: none; }
  .ep-header:hover { background: #f9fafb; }
  @media (prefers-color-scheme: dark) { .ep-header:hover { background: #1f2937; } }
  .ep-path { font-family: monospace; font-size: 14px; word-break: break-all; }
  .ep-arrow { font-size: 10px; color: #9ca3af; transition: transform .2s; margin-left: auto; flex-shrink: 0; }
  .ep-header.open .ep-arrow { transform: rotate(90deg); }
  .method { display: inline-block; font-size: 11px; font-weight: 700; color: #fff; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; white-space: nowrap; flex-shrink: 0; min-width: 48px; text-align: center; }
  .ep-body { display: none; padding: 0 14px 14px; }
  .ep-header.open + .ep-body { display: block; }
  .ep-meta { display: flex; gap: 24px; flex-wrap: wrap; font-size: 13px; margin-bottom: 8px; }
  .ep-meta strong { color: #6b7280; font-weight: 500; }
  .ep-params { margin: 8px 0; }
  .ep-params li { font-size: 13px; margin: 2px 0; }
  .ep-params code { background: #f3f4f6; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
  @media (prefers-color-scheme: dark) { .ep-params code { background: #1f2937; } }
  .status-list { display: flex; gap: 8px; flex-wrap: wrap; }
  .status-code { font-size: 12px; padding: 1px 8px; border-radius: 4px; font-weight: 500; }
  .status-2xx { background: #dcfce7; color: #166534; }
  .status-4xx { background: #fef3c7; color: #92400e; }
  .status-5xx { background: #fee2e2; color: #991b1b; }
  @media (prefers-color-scheme: dark) {
    .status-2xx { background: #14532d; color: #bbf7d0; }
    .status-4xx { background: #78350f; color: #fde68a; }
    .status-5xx { background: #7f1d1d; color: #fecaca; }
  }
  .no-matches { text-align: center; color: #9ca3af; padding: 48px 0; font-size: 15px; }
  .regenerate { font-size: 12px; color: #9ca3af; margin-top: 32px; text-align: center; }
</style>
</head>
<body>
<div class="container">
<h1>${htmlesc(projectName)} API Reference</h1>
<p class="subtitle">Auto-generated from ${routes.length} route files &middot; ${allEndpoints.length} endpoints &middot; ${sortedTags.length} tag groups</p>
<div class="stats">
${Object.entries(methodCounts).sort().map(([m, c]) => `<span class="stat"><strong>${m}</strong> ${c}</span>`).join("\n")}
</div>
<div class="filter"><input type="text" id="filter" placeholder="Filter endpoints..." oninput="filterEndpoints(this.value)"></div>
${sortedTags.map(([tag, group]) => `
<div class="tag-group" data-tag="${htmlesc(tag)}">
<h2 class="tag-title">${htmlesc(tag)}</h2>
${group.endpoints.map((ep) => `
<div class="endpoint">
  <div class="ep-header" onclick="this.classList.toggle('open')">
    ${methodBadge(ep.method)}
    <span class="ep-path">${htmlesc(ep.path)}</span>
    <span class="ep-arrow">&#9654;</span>
  </div>
  <div class="ep-body">
    <p style="margin:0 0 8px">${htmlesc(ep.desc)}</p>
    <div class="ep-meta">
      <span><strong>Auth:</strong> ${htmlesc(ep.auth)}</span>
    </div>
    ${ep.params.length > 0 ? `<div class="ep-params"><strong>Parameters:</strong><ul>${ep.params.map((p) => `<li>${p}</li>`).join("")}</ul></div>` : ""}
    ${ep.body ? `<div class="ep-meta"><span><strong>Body:</strong> ${htmlesc(ep.body)}</span></div>` : ""}
    <div style="margin-top:8px">
      <strong>Responses:</strong>
      <div class="status-list" style="margin-top:4px">
        ${ep.statuses.map((s) => {
          const sc = s < 300 ? "status-2xx" : s < 500 ? "status-4xx" : "status-5xx";
          const labels: Record<number, string> = {200:"OK",201:"Created",400:"Bad Request",401:"Unauthorized",403:"Forbidden",404:"Not Found",409:"Conflict",429:"Rate Limited",500:"Error",503:"Unavailable"};
          return `<span class="status-code ${sc}">${s} ${labels[s] || ""}</span>`;
        }).join("\n")}
      </div>
    </div>
  </div>
</div>`).join("\n")}
</div>`).join("\n")}
<p class="regenerate">Generated by <code>npm run generate-api-docs</code></p>
</div>
<script>
function filterEndpoints(q) {
  const lower = q.toLowerCase();
  document.querySelectorAll('.endpoint').forEach(el => {
    const text = el.textContent?.toLowerCase() || "";
    el.style.display = text.includes(lower) ? "" : "none";
  });
  document.querySelectorAll('.tag-group').forEach(el => {
    const visible = el.querySelectorAll('.endpoint[style*="display:"]').length;
    const total = el.querySelectorAll('.endpoint').length;
    el.style.display = visible === total ? "none" : "";
  });
}
</script>
</body>
</html>`;
}

// ─── main ────────────────────────────────────────────────────────────────────

function main() {
  const projectRoot = process.argv[2] || process.cwd();
  const apiDir = path.join(projectRoot, "app", "api");
  const outputDir = path.join(projectRoot, "public", "docs", "api");
  const projectName = path.basename(projectRoot);

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(apiDir)) {
    console.error(`No app/api/ directory found at: ${apiDir}`);
    process.exit(1);
  }

  console.log(`Scanning routes in ${apiDir}...`);
  const files = findRouteFiles(apiDir);
  console.log(`Found ${files.length} route files`);

  const routes: RouteInfo[] = [];
  for (const file of files) {
    const info = parseRouteFile(file, apiDir);
    if (info) routes.push(info);
  }

  console.log(`Parsed ${routes.length} routes with ${routes.flatMap((r) => r.methods).length} endpoints`);

  // Warn about duplicate paths
  const pathCounts = new Map<string, number>();
  for (const r of routes) {
    pathCounts.set(r.path, (pathCounts.get(r.path) || 0) + 1);
  }
  for (const [p, c] of pathCounts) {
    if (c > 1) console.warn(`  Warning: ${p} has ${c} route.ts files`);
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.mkdirSync(outputDir, { recursive: true });
  const yaml = generateOpenApiYaml(routes, projectName);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(path.join(outputDir, "openapi.yaml"), yaml, "utf-8");

  const html = generateHtml(routes, projectName);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(path.join(outputDir, "index.html"), html, "utf-8");

  console.log(`Written: ${path.join(outputDir, "openapi.yaml")}`);
  console.log(`Written: ${path.join(outputDir, "index.html")}`);

  // Stats
  const methodCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  for (const r of routes) {
    for (const m of r.methods) {
      methodCounts[m.method] = (methodCounts[m.method] || 0) + 1;
      tagCounts[m.tag] = (tagCounts[m.tag] || 0) + 1;
    }
  }
  console.log("\nEndpoints by method:");
  for (const [m, c] of Object.entries(methodCounts).sort()) console.log(`  ${m}: ${c}`);
  console.log("\nEndpoints by tag:");
  for (const [t, c] of Object.entries(tagCounts).sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${c}`);
}

main();
