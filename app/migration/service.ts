"use server";

import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { db } from "@/db/connection";
import { logger } from "@/lib/logging/logger";

function stringSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const s2 = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  const m = s1.length;
  const n = s2.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] =
        s1[i - 1] === s2[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }

  const maxLen = Math.max(m, n);
  return 1 - dp[n] / maxLen;
}
import { Role, roles, type UserStatus, user } from "@/db/schema/auth-schema";
import { countries, Country, SubRegion, subRegions } from "@/db/schema/country";
import {
  DataEntryComment,
  dataEntries,
  dataEntryLogs,
  DataEntryStatusId,
  MeasureDefinition,
  inputDlDefMappings,
  measureDefinitions,
  inputRelevance,
  tariffRelevance,
  transmissionRelevance,
} from "@/db/schema/dataEntry";
import {
  KpiDefinition,
  kpi,
  kpiCalculationAttempts,
  kpiDefinitions,
} from "@/db/schema/kpi";
import {
  energyResourceTypeRelevance,
  ManagedList,
  ManagedListItem,
  managedListItems,
  managedLists,
} from "@/db/schema/managedLists";
import { ReportPeriod, reportPeriods } from "@/db/schema/reportPeriods";
import {
  EnergyResource,
  EnergyResourcePeriodEntry,
  units,
  Organisation,
  organisations,
  ServiceArea,
  serviceAreas,
} from "@/db/schema/utility";
import { formatReportPeriodDisplay } from "@/lib/formatters";
import { getCurrentUser } from "@/lib/user.service";
import { generateRandomNumber } from "@/lib/utils";
import {
  aliasedTable,
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { migrationLogs } from "@/db/schema/migration-log";
import { getDimensionDefaults } from "@/lib/data-entry/dimension-defaults";

export type MigrationStepResult = {
  ok: boolean;
  inserted: number;
  updated: number;
  total: number;
};

const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
} as const;
// const DATA_ENTRY_PAGE_LIMIT = Number(
//   process.env.MIGRATION_DATA_ENTRY_PAGE_LIMIT ?? "2000",
// );
const MIGRATION_FETCH_TIMEOUT_MS = Number(
  process.env.MIGRATION_FETCH_TIMEOUT_MS ?? "12000",
);
const MIGRATION_HEAVY_FETCH_TIMEOUT_MS = Number(
  process.env.MIGRATION_HEAVY_FETCH_TIMEOUT_MS ?? "120000",
);
const migrationApiKey = (
  process.env.PRISM_TRAINING_MIGRATION_KEY ?? process.env.MIGRATION_API_KEY
)?.trim();

const normalizeMigrationBaseUrl = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const toMigrationBaseUrl = (value: string): string => {
  const normalized = normalizeMigrationBaseUrl(value);

  if (normalized.toLowerCase().endsWith("/api/migration")) {
    return normalized;
  }
  if (normalized.toLowerCase().endsWith("/api/mig")) {
    const result = `${normalized.slice(0, -4)}/migration`;
    return result;
  }
  if (normalized.toLowerCase().endsWith("/api")) {
    const result = `${normalized}/migration`;
    return result;
  }
  const result = `${normalized}/api/migration`;
  return result;
};

const toLegacyMigBaseUrl = (value: string): string => {
  const normalized = normalizeMigrationBaseUrl(value);

  if (normalized.toLowerCase().endsWith("/api/mig")) {
    return normalized;
  }
  if (normalized.toLowerCase().endsWith("/api/migration")) {
    const result = `${normalized.slice(0, -10)}/mig`;
    return result;
  }
  if (normalized.toLowerCase().endsWith("/api")) {
    const result = `${normalized}/mig`;
    return result;
  }
  const result = `${normalized}/api/mig`;
  return result;
};

const configuredTrainingBaseUrls = [
  process.env.PRISM_TRAINING_MIGRATION_URL,
  process.env.PRISM_TRAINING_API_BASE_URL,
].filter((url): url is string => Boolean(url && url.trim().length > 0));

const defaultLocalMigrationBaseUrls = [
  "http://localhost:36197/api/migration",
  "http://localhost:3001/api/migration",
  "http://localhost:3000/api/migration",
];

const defaultLocalLegacyMigBaseUrls = [
  "http://localhost:36197/api/mig",
  "http://localhost:3001/api/mig",
  "http://localhost:3000/api/mig",
];

const migrationBaseUrls = Array.from(
  new Set(
    [
      ...configuredTrainingBaseUrls,
      // Keep localhost fallbacks even in production. If public edge headers are
      // malformed, direct local calls can still succeed on co-hosted deploys.
      ...defaultLocalMigrationBaseUrls,
    ]
      .filter((url): url is string => Boolean(url && url.trim().length > 0))
      .map(toMigrationBaseUrl),
  ),
);

const legacyMigBaseUrls = Array.from(
  new Set(
    [
      ...configuredTrainingBaseUrls,
      ...migrationBaseUrls,
      ...defaultLocalLegacyMigBaseUrls,
    ]
      .filter((url): url is string => Boolean(url && url.trim().length > 0))
      .map(toLegacyMigBaseUrl),
  ),
);

const logMigrationError = (error: unknown) => {
  logger.error("[migration] operation failed", {
    error: error instanceof Error ? error.message : String(error),
  });
};

const isProtocolHeaderError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  const cause = (error as Error & { cause?: unknown }).cause;
  const causeMessage =
    cause && typeof cause === "object" && "message" in cause
      ? String((cause as { message?: unknown }).message ?? "").toLowerCase()
      : "";
  const code =
    cause && typeof cause === "object" && "code" in cause
      ? String((cause as { code?: unknown }).code ?? "").toUpperCase()
      : "";

  return (
    message.includes("response does not match the http/1.1 protocol") ||
    message.includes("invalid header value char") ||
    causeMessage.includes("response does not match the http/1.1 protocol") ||
    causeMessage.includes("invalid header value char") ||
    code === "HPE_INVALID_HEADER_TOKEN"
  );
};

const shouldTryInsecureParser = (
  requestUrl: string,
  error: unknown,
): boolean => {
  if (isProtocolHeaderError(error)) return true;

  try {
    const url = new URL(requestUrl);
    const path = url.pathname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (path.startsWith("/api/migration/") || path.startsWith("/api/mig/"))
    );
  } catch {
    return false;
  }
};

const toNodeHeaders = (headers: HeadersInit): Record<string, string> => {
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, value]));
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)]),
  );
};

const resolveTimeoutMs = (requestUrl: string): number => {
  const defaultTimeoutMs =
    Number.isFinite(MIGRATION_FETCH_TIMEOUT_MS) &&
    MIGRATION_FETCH_TIMEOUT_MS > 0
      ? MIGRATION_FETCH_TIMEOUT_MS
      : 12000;
  const heavyTimeoutMs =
    Number.isFinite(MIGRATION_HEAVY_FETCH_TIMEOUT_MS) &&
    MIGRATION_HEAVY_FETCH_TIMEOUT_MS > 0
      ? MIGRATION_HEAVY_FETCH_TIMEOUT_MS
      : 120000;

  const lowerUrl = requestUrl.toLowerCase();
  if (
    lowerUrl.includes("/dataentry") ||
    lowerUrl.includes("/generationrelevance") ||
    lowerUrl.includes("/tariffrelevance")
  ) {
    return heavyTimeoutMs;
  }

  return defaultTimeoutMs;
};

// const resolveDataEntryPageLimit = (): number => {
//   if (!Number.isFinite(DATA_ENTRY_PAGE_LIMIT) || DATA_ENTRY_PAGE_LIMIT <= 0) {
//     return 500;
//   }

//   return Math.max(1, Math.min(2000, Math.trunc(DATA_ENTRY_PAGE_LIMIT)));
// };

const requestWithInsecureHttpParser = async (
  requestUrl: string,
  headers: HeadersInit,
  timeoutMs: number,
): Promise<Response> => {
  const url = new URL(requestUrl);
  const transport = url.protocol === "https:" ? https : http;

  return await new Promise<Response>((resolve, reject) => {
    const req = transport.request(
      requestUrl,
      {
        method: "GET",
        headers: toNodeHeaders(headers),
        // Upstream occasionally emits invalid header chars; this keeps migration
        // pulls alive until edge/header config is corrected.
        insecureHTTPParser: true,
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const responseHeaders = new Headers();

          for (const [key, value] of Object.entries(res.headers)) {
            if (value == null) continue;
            responseHeaders.set(
              key,
              Array.isArray(value) ? value.join(", ") : value,
            );
          }

          resolve(
            new Response(body, {
              status: res.statusCode ?? 502,
              headers: responseHeaders,
            }),
          );
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Migration request timeout after ${timeoutMs}ms`));
    });

    req.on("error", reject);
    req.end();
  });
};

const fetchJsonEndpoint = async (requestUrl: string, headers: HeadersInit) => {
  let response: Response;
  const timeoutMs = resolveTimeoutMs(requestUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(
      new Error(`Migration request timeout after ${timeoutMs}ms`),
    );
  }, timeoutMs);

  try {
    response = await fetch(requestUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (!shouldTryInsecureParser(requestUrl, error)) {
      throw error;
    }

    response = await requestWithInsecureHttpParser(
      requestUrl,
      headers,
      timeoutMs,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return {
      ok: false as const,
      message: `${requestUrl} -> HTTP ${response.status}`,
      response,
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) {
    return {
      ok: true as const,
      response,
    };
  }

  const preview = (await response.text())
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  return {
    ok: false as const,
    message: `${requestUrl} -> expected JSON but got ${contentType || "unknown content-type"}${preview ? ` (body starts: ${preview})` : ""}`,
    response,
  };
};

const describeFetchError = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const parts: string[] = [error.message];

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const code = (cause as { code?: unknown }).code;
    const errno = (cause as { errno?: unknown }).errno;
    const syscall = (cause as { syscall?: unknown }).syscall;
    const hostname = (cause as { hostname?: unknown }).hostname;
    const address = (cause as { address?: unknown }).address;
    const port = (cause as { port?: unknown }).port;
    const causeMessage = (cause as { message?: unknown }).message;

    if (code != null) parts.push(`code=${String(code)}`);
    if (errno != null) parts.push(`errno=${String(errno)}`);
    if (syscall != null) parts.push(`syscall=${String(syscall)}`);
    if (hostname != null) parts.push(`host=${String(hostname)}`);
    if (address != null) parts.push(`address=${String(address)}`);
    if (port != null) parts.push(`port=${String(port)}`);
    if (causeMessage && String(causeMessage) !== error.message) {
      parts.push(`cause=${String(causeMessage)}`);
    }
  }

  return parts.join("; ");
};

const assertDevMigrationAccess = async () => {
  const user = await getCurrentUser();
  if (user.role !== "DEV") {
    throw new Error("Unauthorized: DEV role required.");
  }
};

const isUniqueViolationError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const code = (error as Error & { code?: unknown }).code;
  if (code === "23505") return true;

  const message = error.message.toLowerCase();
  return message.includes("duplicate key") || message.includes("uniq_entry");
};

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toUserStatus = (value: unknown): UserStatus => {
  if (value === "active" || value === "pending" || value === "deactivated") {
    return value;
  }
  return "active";
};

const fetchMigrationEndpoint = async (path: string) => {
  const headers = {
    ...JSON_HEADERS,
    ...(migrationApiKey ? { "x-migration-key": migrationApiKey } : {}),
  };

  const migrationFailures: string[] = [];

  for (const baseUrl of migrationBaseUrls) {
    const requestUrl = `${baseUrl}${path}`;

    try {
      const result = await fetchJsonEndpoint(requestUrl, headers);
      if (result.ok) {
        return result.response;
      }
      migrationFailures.push(result.message);
    } catch (error: unknown) {
      const message = describeFetchError(error);
      migrationFailures.push(`${requestUrl} -> ${message}`);
    }
  }

  const legacyFallbackFailures: string[] = [];

  for (const baseUrl of legacyMigBaseUrls) {
    const requestUrl = `${baseUrl}${path}`;

    try {
      const result = await fetchJsonEndpoint(requestUrl, headers);
      if (result.ok) {
        return result.response;
      }
      legacyFallbackFailures.push(result.message);
    } catch (error: unknown) {
      const message = describeFetchError(error);
      legacyFallbackFailures.push(`${requestUrl} -> ${message}`);
    }
  }

  const allFailures = [
    ...migrationFailures,
    ...legacyFallbackFailures.map(
      (message) => `${message} [legacy /api/mig fallback]`,
    ),
  ];

  const maxFailures = 4;
  const shownFailures = allFailures.slice(0, maxFailures);
  const truncated =
    allFailures.length > maxFailures
      ? ` (and ${allFailures.length - maxFailures} more)`
      : "";

  const errorMsg = [
    `Unable to reach migration endpoint for ${path}.`,
    `Tried ${allFailures.length} URL(s)${truncated}: ${shownFailures.join(" | ")}`,
    "Set PRISM_TRAINING_MIGRATION_URL or PRISM_TRAINING_API_BASE_URL in prism/.env to the prism-training API host.",
  ].join(" ");
  throw new Error(errorMsg);
};

const fetchLegacyMigEndpoint = async (path: string) => {
  const headers = {
    ...JSON_HEADERS,
    ...(migrationApiKey ? { "x-migration-key": migrationApiKey } : {}),
  };

  const failures: string[] = [];

  for (const baseUrl of legacyMigBaseUrls) {
    const requestUrl = `${baseUrl}${path}`;

    try {
      const result = await fetchJsonEndpoint(requestUrl, headers);
      if (result.ok) {
        return result.response;
      }
      failures.push(result.message);
    } catch (error: unknown) {
      const message = describeFetchError(error);
      failures.push(`${requestUrl} -> ${message}`);
    }
  }

  throw new Error(
    [
      `Unable to reach legacy migration endpoint for ${path}.`,
      `Tried: ${failures.join(" | ")}`,
      "Set PRISM_TRAINING_MIGRATION_URL or PRISM_TRAINING_API_BASE_URL in prism/.env to the prism-training API host.",
    ].join(" "),
  );
};

type SourceUtilityContextRow = {
  utility_report_period_id?: number | null;
  report_period_id?: number | null;
  dl_def_id?: number | string | null;
  value?: string | null;
  dl_value?: string | null;
  comments?: string | null;
  updated_date?: string | Date | null;
  updated_at?: string | Date | null;
  not_available?: boolean;
  is_deleted?: boolean;
  provider_id?: number | null;
  technology_id?: number | null;
  customer_type_id?: number | null;
  payment_mode_id?: number | null;
};

type SourceCountryContextRow = {
  utility_report_period_id?: number | null;
  report_period_id?: number | null;
  dl_def_id?: number | string | null;
  value?: string | null;
  dl_value?: string | null;
  comments?: string | null;
  updated_date?: string | Date | null;
  updated_at?: string | Date | null;
  not_available?: boolean;
  is_deleted?: boolean;
  country_id?: number | null;
};

export async function retrieveUtilityContextData(options?: {
  reportPeriodId?: number;
}) {
  await assertDevMigrationAccess();
  let inserted = 0;
  const updated = 0;

  try {
    const call = await fetchLegacyMigEndpoint("/utilityContext");
    const list = (await call.json()) as SourceUtilityContextRow[];

    const mappingRows = await db
      .select({
        trainingDlDefId: inputDlDefMappings.training_dl_def_id,
        inputDefId: inputDlDefMappings.measure_def_id,
        updatedAt: inputDlDefMappings.updated_at,
      })
      .from(inputDlDefMappings);

    const inputByTrainingDlDefId = new Map<
      number,
      { inputDefId: number; updatedAt: Date | null }
    >();
    for (const mapping of mappingRows) {
      const existing = inputByTrainingDlDefId.get(mapping.trainingDlDefId);
      if (!existing) {
        inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
          inputDefId: mapping.inputDefId,
          updatedAt: mapping.updatedAt,
        });
        continue;
      }

      const existingTime = existing.updatedAt?.getTime() ?? 0;
      const currentTime = mapping.updatedAt?.getTime() ?? 0;
      if (currentTime >= existingTime) {
        inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
          inputDefId: mapping.inputDefId,
          updatedAt: mapping.updatedAt,
        });
      }
    }

    const [targetInputDefs, targetReportPeriods, targetManagedItems] =
      await Promise.all([
        db.select({ id: measureDefinitions.id }).from(measureDefinitions),
        db
          .select({ id: reportPeriods.id })
          .from(reportPeriods)
          .where(
            options?.reportPeriodId != null
              ? eq(reportPeriods.id, options.reportPeriodId)
              : undefined,
          ),
        db.select({ id: managedListItems.id }).from(managedListItems),
      ]);

    const targetInputDefIds = new Set(targetInputDefs.map((d) => d.id));
    const targetReportPeriodIds = new Set(targetReportPeriods.map((r) => r.id));
    const targetManagedListItemIds = new Set(
      targetManagedItems.map((m) => m.id),
    );

    for (const row of list) {
      const reportPeriodId = normalizeRequiredId(
        toNumberOrNull(row.utility_report_period_id ?? row.report_period_id),
      );

      if (
        reportPeriodId == null ||
        (options?.reportPeriodId != null &&
          reportPeriodId !== options.reportPeriodId)
      ) {
        continue;
      }

      if (!targetReportPeriodIds.has(reportPeriodId)) {
        continue;
      }

      const sourceTrainingDlDefId = toNumberOrNull(row.dl_def_id);
      if (sourceTrainingDlDefId == null) {
        continue;
      }

      const mapped = inputByTrainingDlDefId.get(sourceTrainingDlDefId);
      const inputDefId = mapped?.inputDefId ?? null;
      if (inputDefId == null || !targetInputDefIds.has(inputDefId)) {
        continue;
      }

      const energyProviderId = normalizeOptionalFkId(
        normalizeOptionalId(row.provider_id),
        targetManagedListItemIds,
      );
      const energySourceId = normalizeOptionalFkId(
        normalizeOptionalId(row.technology_id),
        targetManagedListItemIds,
      );
      const customerTypeId = normalizeOptionalFkId(
        normalizeOptionalId(row.customer_type_id),
        targetManagedListItemIds,
      );
      const paymentModeId = normalizeOptionalFkId(
        normalizeOptionalId(row.payment_mode_id),
        targetManagedListItemIds,
      );

      const updatedAt =
        row.updated_at || row.updated_date
          ? new Date((row.updated_at ?? row.updated_date) as string | Date)
          : new Date();

      const dims = await getDimensionDefaults();

      const payload = {
        report_period_id: reportPeriodId,
        measure_def_id: inputDefId,
        service_area_id: null,
        unit_id: null,
        provider_id: energyProviderId ?? dims.energyProvider,
        technology_id: energySourceId ?? dims.energySource,
        category_id: dims.energyType,
        asset_id: dims.energyResourceType,
        customer_type_id: customerTypeId ?? dims.customerType,
        payment_mode_id: paymentModeId ?? dims.paymentMode,
        consumption_band_id: dims.consumptionBand,
        division_id: dims.division,
        gender_id: dims.gender,
        utility_function_id: dims.utilityFunction,
        value: row.dl_value ?? row.value ?? null,
        comments: toStructuredComments(row.comments ?? null, updatedAt),
        update_medium_id: null,
        status_id:
          row.not_available === true
            ? DataEntryStatusId.Not_Available
            : DataEntryStatusId.Entered,
        is_relevant: true,
        is_deleted: row.is_deleted ?? false,
        updatedAt,
        updatedById: null,
      };

      const [existing] = await db
        .select({ id: dataEntries.id })
        .from(dataEntries)
        .where(
          and(
            eq(dataEntries.report_period_id, reportPeriodId),
            eq(dataEntries.measure_def_id, inputDefId),
            isNull(dataEntries.service_area_id),
            isNull(dataEntries.unit_id),
            eq(dataEntries.provider_id, energyProviderId ?? dims.energyProvider),
            eq(dataEntries.technology_id, energySourceId ?? dims.energySource),
            eq(dataEntries.customer_type_id, customerTypeId ?? dims.customerType),
            eq(dataEntries.payment_mode_id, paymentModeId ?? dims.paymentMode),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(dataEntries)
          .set(payload)
          .where(eq(dataEntries.id, existing.id));
      } else {
        await db.insert(dataEntries).values(payload);
        inserted += 1;
      }
    }

    await backfillUtilityContextDataEntriesFromPreviousPeriods({
      reportPeriodId: options?.reportPeriodId,
    });

    await backfillCountryContextDataEntriesFromPreviousPeriods({
      reportPeriodId: options?.reportPeriodId,
    });
  } catch (error: unknown) {
    logMigrationError(error);
    revalidatePath("/migration");
    return { ok: false, inserted, updated, total: inserted + updated };
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveCountryContextData(options?: {
  reportPeriodId?: number;
}) {
  await assertDevMigrationAccess();
  let inserted = 0;
  const updated = 0;

  try {
    const call = await fetchLegacyMigEndpoint("/countryContext");
    const list = (await call.json()) as SourceCountryContextRow[];

    const mappingRows = await db
      .select({
        trainingDlDefId: inputDlDefMappings.training_dl_def_id,
        inputDefId: inputDlDefMappings.measure_def_id,
        updatedAt: inputDlDefMappings.updated_at,
      })
      .from(inputDlDefMappings);

    const inputByTrainingDlDefId = new Map<
      number,
      { inputDefId: number; updatedAt: Date | null }
    >();
    for (const mapping of mappingRows) {
      const existing = inputByTrainingDlDefId.get(mapping.trainingDlDefId);
      if (!existing) {
        inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
          inputDefId: mapping.inputDefId,
          updatedAt: mapping.updatedAt,
        });
        continue;
      }

      const existingTime = existing.updatedAt?.getTime() ?? 0;
      const currentTime = mapping.updatedAt?.getTime() ?? 0;
      if (currentTime >= existingTime) {
        inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
          inputDefId: mapping.inputDefId,
          updatedAt: mapping.updatedAt,
        });
      }
    }

    const [targetInputDefs, targetReportPeriods] = await Promise.all([
      db.select({ id: measureDefinitions.id }).from(measureDefinitions),
      db
        .select({ id: reportPeriods.id })
        .from(reportPeriods)
        .where(
          options?.reportPeriodId != null
            ? eq(reportPeriods.id, options.reportPeriodId)
            : undefined,
        ),
    ]);

    const targetInputDefIds = new Set(targetInputDefs.map((d) => d.id));
    const targetReportPeriodIds = new Set(targetReportPeriods.map((r) => r.id));

    for (const row of list) {
      const reportPeriodId = normalizeRequiredId(
        toNumberOrNull(row.utility_report_period_id ?? row.report_period_id),
      );

      if (
        reportPeriodId == null ||
        (options?.reportPeriodId != null &&
          reportPeriodId !== options.reportPeriodId)
      ) {
        continue;
      }

      if (!targetReportPeriodIds.has(reportPeriodId)) {
        continue;
      }

      const sourceTrainingDlDefId = toNumberOrNull(row.dl_def_id);
      if (sourceTrainingDlDefId == null) {
        continue;
      }

      const mapped = inputByTrainingDlDefId.get(sourceTrainingDlDefId);
      const inputDefId = mapped?.inputDefId ?? null;
      if (inputDefId == null || !targetInputDefIds.has(inputDefId)) {
        continue;
      }

      const updatedAt =
        row.updated_at || row.updated_date
          ? new Date((row.updated_at ?? row.updated_date) as string | Date)
          : new Date();

      const dims2 = await getDimensionDefaults();

      const payload = {
        report_period_id: reportPeriodId,
        measure_def_id: inputDefId,
        service_area_id: null,
        unit_id: null,
        provider_id: dims2.energyProvider,
        technology_id: dims2.energySource,
        category_id: dims2.energyType,
        asset_id: dims2.energyResourceType,
        customer_type_id: dims2.customerType,
        payment_mode_id: dims2.paymentMode,
        consumption_band_id: dims2.consumptionBand,
        division_id: dims2.division,
        gender_id: dims2.gender,
        utility_function_id: dims2.utilityFunction,
        value: row.dl_value ?? row.value ?? null,
        comments: toStructuredComments(row.comments ?? null, updatedAt),
        update_medium_id: null,
        status_id:
          row.not_available === true
            ? DataEntryStatusId.Not_Available
            : DataEntryStatusId.Entered,
        is_relevant: true,
        is_deleted: row.is_deleted ?? false,
        updatedAt,
        updatedById: null,
      };

      const [existing] = await db
        .select({ id: dataEntries.id })
        .from(dataEntries)
        .where(
          and(
            eq(dataEntries.report_period_id, reportPeriodId),
            eq(dataEntries.measure_def_id, inputDefId),
            isNull(dataEntries.service_area_id),
            isNull(dataEntries.unit_id),
            eq(dataEntries.provider_id, dims2.energyProvider),
            eq(dataEntries.technology_id, dims2.energySource),
            eq(dataEntries.category_id, dims2.energyType),
            eq(dataEntries.asset_id, dims2.energyResourceType),
            eq(dataEntries.customer_type_id, dims2.customerType),
            eq(dataEntries.payment_mode_id, dims2.paymentMode),
            eq(dataEntries.consumption_band_id, dims2.consumptionBand),
            eq(dataEntries.division_id, dims2.division),
            eq(dataEntries.gender_id, dims2.gender),
            eq(dataEntries.utility_function_id, dims2.utilityFunction),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(dataEntries)
          .set(payload)
          .where(eq(dataEntries.id, existing.id));
      } else {
        await db.insert(dataEntries).values(payload);
        inserted += 1;
      }
    }

    await backfillCountryContextDataEntriesFromPreviousPeriods({
      reportPeriodId: options?.reportPeriodId,
    });
  } catch (error: unknown) {
    logMigrationError(error);
    revalidatePath("/migration");
    return { ok: false, inserted, updated, total: inserted + updated };
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveRoles() {
  await assertDevMigrationAccess();
  let inserted = 0;
  const updated = 0;
  try {
    const call = await fetchMigrationEndpoint("/roles");
    const list: Role[] = await call.json();

    const existingRoles = await db.select().from(roles);
    const existingById = new Map(existingRoles.map((r) => [r.id, r]));

    for (const sourceRole of list) {
      const existing = existingById.get(sourceRole.id);

      if (!existing) {
        await db.insert(roles).values(sourceRole);
        inserted += 1;
        continue;
      }

      if (
        existing.name !== sourceRole.name ||
        existing.description !== sourceRole.description
      ) {
        await db
          .update(roles)
          .set({
            name: sourceRole.name,
            description: sourceRole.description,
          })
          .where(eq(roles.id, sourceRole.id));
      }
    }
  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

type MigrationUserDto = {
  id: string;
  organisation_id: number | null;
  role_id: number | null;
  status: string;
  date_approved: string | Date | null;
  dataset_required: string | null;
  data_access_reason: string | null;
  name: string;
  email: string;
  email_verified: boolean;
};

export async function retrieveUsers() {
  await assertDevMigrationAccess();
  let inserted = 0;
  let updated = 0;

  try {
    const call = await fetchMigrationEndpoint("/users");
    const list: MigrationUserDto[] = await call.json();

    const [existingUsers, existingRoles, existingOrganisations] =
      await Promise.all([
        db.select({ id: user.id, email: user.email }).from(user),
        db.select({ id: roles.id }).from(roles),
        db.select({ id: organisations.id }).from(organisations),
      ]);

    const existingUserIdSet = new Set(existingUsers.map((u) => u.id));
    const existingUserIdByEmail = new Map(
      existingUsers.map((u) => [u.email.trim().toLowerCase(), u.id]),
    );
    const existingRoleIdSet = new Set(existingRoles.map((r) => r.id));
    const existingOrganisationIdSet = new Set(
      existingOrganisations.map((o) => o.id),
    );

    for (const sourceUser of list) {
      const normalizedEmail = (sourceUser.email || "").trim().toLowerCase();
      if (!normalizedEmail) {
        continue;
      }

      const validRoleId = existingRoleIdSet.has(sourceUser.role_id ?? -1)
        ? sourceUser.role_id
        : null;
      const validOrganisationId = existingOrganisationIdSet.has(
        sourceUser.organisation_id ?? -1,
      )
        ? sourceUser.organisation_id
        : null;

      const existingIdForEmail = existingUserIdByEmail.get(normalizedEmail);

      const updatePayload = {
        name: (sourceUser.name || "").trim() || normalizedEmail,
        role_id: validRoleId,
        organisation_id: validOrganisationId,
        status: toUserStatus(sourceUser.status),
        date_approved: sourceUser.date_approved
          ? new Date(sourceUser.date_approved)
          : null,
        dataset_required: sourceUser.dataset_required,
        data_access_reason: sourceUser.data_access_reason,
        emailVerified: Boolean(sourceUser.email_verified),
      };

      if (existingIdForEmail) {
        await db
          .update(user)
          .set(updatePayload)
          .where(eq(user.id, existingIdForEmail));
        updated += 1;
        continue;
      }

      const requestedId = String(sourceUser.id || "").trim();
      const insertId =
        requestedId.length > 0 && !existingUserIdSet.has(requestedId)
          ? requestedId
          : crypto.randomUUID();

      await db.insert(user).values({
        id: insertId,
        email: normalizedEmail,
        ...updatePayload,
      });

      existingUserIdSet.add(insertId);
      existingUserIdByEmail.set(normalizedEmail, insertId);
      inserted += 1;
    }
  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveUtilityData() {
  await assertDevMigrationAccess();
  let inserted = 0;
  const updated = 0;
  const call = await fetchMigrationEndpoint("/organisation");
  const list = await call.json();
  const serviceAreaList: ServiceArea[] = list.serviceAreas;
  const reportPeriodsList: ReportPeriod[] = list.reportPeriods;
  const orgList: Organisation[] = list.organisations;

  const existingOrgs = await db.select().from(organisations);
  const existingOrgIds = new Set(existingOrgs.map((o) => o.id));
  const nonExistingOrgs = orgList.filter((org) => !existingOrgIds.has(org.id));

  const existingSAs = await db.select().from(serviceAreas);
  const existingSAIds = new Set(existingSAs.map((sa) => sa.id));
  const nonExistingSAs = serviceAreaList.filter(
    (sa) => !existingSAIds.has(sa.id),
  );

  const existingRPs = await db.select().from(reportPeriods);
  const existingRPIds = new Set(existingRPs.map((rp) => rp.id));
  const nonExistingRPs = reportPeriodsList.filter(
    (rp) => !existingRPIds.has(rp.id),
  );

  const countriesList = await db.select({ id: countries.id }).from(countries);
  const countryIds = new Set(countriesList.map((c) => c.id));

  const managedListItemList = await db
    .select({ id: managedListItems.id })
    .from(managedListItems);
  const managedListItemIds = new Set(managedListItemList.map((m) => m.id));

  const roleList = await db.select({ id: roles.id }).from(roles);
  const roleIds = new Set(roleList.map((r) => r.id));

  const normalizedOrgs = nonExistingOrgs
    .filter((org) => countryIds.has(org.country_id))
    .map((org) => ({
      ...org,
      powequality_standard_id: managedListItemIds.has(
        org.powequality_standard_id ?? -1,
      )
        ? org.powequality_standard_id
        : null,
      electricity_regulation_id: managedListItemIds.has(
        org.electricity_regulation_id ?? -1,
      )
        ? org.electricity_regulation_id
        : null,
      accounting_standard_id: managedListItemIds.has(
        org.accounting_standard_id ?? -1,
      )
        ? org.accounting_standard_id
        : null,
      entity_type_id: managedListItemIds.has(org.entity_type_id ?? -1)
        ? org.entity_type_id
        : null,
      utility_type_id: managedListItemIds.has(org.utility_type_id ?? -1)
        ? org.utility_type_id
        : null,
      operating_basis_id: managedListItemIds.has(org.operating_basis_id ?? -1)
        ? org.operating_basis_id
        : null,
      ppa_membership_type_id: managedListItemIds.has(
        org.ppa_membership_type_id ?? -1,
      )
        ? org.ppa_membership_type_id
        : null,
      utility_size_id: managedListItemIds.has(org.utility_size_id ?? -1)
        ? org.utility_size_id
        : null,
      services_provided_id: managedListItemIds.has(
        org.services_provided_id ?? -1,
      )
        ? org.services_provided_id
        : null,
    }));

  const normalizedOrgIds = new Set(normalizedOrgs.map((org) => org.id));

  const normalizedServiceAreas = nonExistingSAs
    .filter((sa) => normalizedOrgIds.has(sa.utility_id))
    .map((sa) => ({
      ...sa,
      operations_only:
        "operations_only" in sa
          ? sa.operations_only
          : "opertions_only" in sa
            ? (sa as { opertions_only?: boolean }).opertions_only
            : false,
      is_virtual:
        "is_virtual" in sa
          ? sa.is_virtual
          : "is_vitual" in sa
            ? (sa as { is_vitual?: boolean }).is_vitual
            : false,
      agg_level_id:
        managedListItemIds.has(sa.agg_level_id) && sa.agg_level_id != null
          ? sa.agg_level_id
          : 1,
    }));

  const normalizedReportPeriods = nonExistingRPs
    .filter((rp) => normalizedOrgIds.has(rp.utility_id))
    .map((rp) => ({
      ...rp,
      report_date: new Date(rp.report_date),
      request_date: new Date(rp.request_date),
      status_id: managedListItemIds.has(rp.status_id ?? -1)
        ? rp.status_id
        : managedListItemIds.has(844)
          ? 844
          : null,
      who_id: roleIds.has(rp.who_id ?? -1) ? rp.who_id : null,
      updated_at: rp.updated_at ? new Date(rp.updated_at) : new Date(),
    }));

  try {
    if (normalizedOrgs.length > 0) {
      await db.insert(organisations).values(normalizedOrgs);
      inserted += normalizedOrgs.length;
    }
    if (normalizedServiceAreas.length > 0) {
      await db.insert(serviceAreas).values(normalizedServiceAreas);
      inserted += normalizedServiceAreas.length;
    }
    if (normalizedReportPeriods.length > 0) {
      await db.insert(reportPeriods).values(normalizedReportPeriods);
      inserted += normalizedReportPeriods.length;
    }

    const allReportPeriods = await db.select().from(reportPeriods);
    const reportPeriodsByUtility = new Map<number, typeof allReportPeriods>();
    allReportPeriods.forEach((rp) => {
      const list = reportPeriodsByUtility.get(rp.utility_id) || [];
      list.push(rp);
      reportPeriodsByUtility.set(rp.utility_id, list);
    });

    for (const newRp of normalizedReportPeriods) {
      const utilityPeriods = reportPeriodsByUtility.get(newRp.utility_id) || [];
      utilityPeriods.sort(
        (a, b) => a.report_date.getTime() - b.report_date.getTime(),
      );

      const newRpInList = utilityPeriods.find(
        (rp) =>
          rp.report_date.getTime() === newRp.report_date.getTime() &&
          rp.utility_id === newRp.utility_id,
      );
      if (!newRpInList) continue;

      const prevRp = utilityPeriods.find(
        (rp) =>
          rp.report_date.getTime() < newRpInList.report_date.getTime() &&
          rp.id !== newRpInList.id,
      );
      if (!prevRp) continue;

      const energyResourcesList = await db
        .select()
        .from(units)
        .where(eq(units.utility_id, newRp.utility_id));

      const resourcesToUpdate = energyResourcesList.filter((er) =>
        er.period_entries.some((pe) => pe.report_period_id === prevRp.id),
      );

      for (const resource of resourcesToUpdate) {
        const prevEntry = resource.period_entries.find(
          (pe) => pe.report_period_id === prevRp.id,
        );
        if (!prevEntry) continue;

        const hasNewEntry = resource.period_entries.some(
          (pe) => pe.report_period_id === newRpInList.id,
        );
        if (hasNewEntry) continue;

        const newPeriodEntries = [
          ...resource.period_entries,
          {
            report_period_id: newRpInList.id,
            capacity_mw: prevEntry.capacity_mw,
            is_active: prevEntry.is_active,
          },
        ];

        await db
          .update(units)
          .set({ period_entries: newPeriodEntries })
          .where(eq(units.id, resource.id));
      }
    }
  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveCountries() {
  await assertDevMigrationAccess();
  let inserted = 0;
  const updated = 0;
  const call = await fetchMigrationEndpoint("/country");
  const list = await call.json();
  const subRegionList: SubRegion[] = list.subregions;
  const existingSubRegions = await db.select().from(subRegions);
  const existingSubRegionIds = new Set(existingSubRegions.map((sr) => sr.id));
  const nonExistingSubRegions = subRegionList.filter(
    (sr) => !existingSubRegionIds.has(sr.id),
  );

  const countryList: Country[] = list.countries;
  const existingCountries = await db.select().from(countries);
  const existingCountryIds = new Set(existingCountries.map((c) => c.id));
  const nonExistingCountries = countryList.filter(
    (c) => !existingCountryIds.has(c.id),
  );

  try {
    if (nonExistingSubRegions.length > 0) {
      await db.insert(subRegions).values(nonExistingSubRegions);
      inserted += nonExistingSubRegions.length;
    }
    if (nonExistingCountries.length > 0) {
      await db.insert(countries).values(
        nonExistingCountries.map((e) => {
          return {
            ...e,
            updated_date: new Date(e.updated_date),
          };
        }),
      );
    }
  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveManagedLists() {
  await assertDevMigrationAccess();
  let inserted = 0;
  const updated = 0;
  const call = await fetchMigrationEndpoint("/managedList");
  const list = await call.json();
  const managedListItemsList: ManagedListItem[] = list.managedListItems;
  const managedListsList: ManagedList[] = list.managedLists;

  const existingManagedLists = await db.select().from(managedLists);
  const existingManagedListIds = new Set(existingManagedLists.map((l) => l.id));
  const nonExistingManagedLists = managedListsList.filter(
    (l) => !existingManagedListIds.has(l.id),
  );

  const existingManagedListItems = await db.select().from(managedListItems);
  const existingManagedListItemIds = new Set(
    existingManagedListItems.map((li) => li.id),
  );
  const nonExistingManagedListItems = managedListItemsList.filter(
    (li) => !existingManagedListItemIds.has(li.id),
  );

  try {
    if (nonExistingManagedLists.length > 0) {
      await db.insert(managedLists).values(nonExistingManagedLists);
      inserted += nonExistingManagedLists.length;
    }
    if (nonExistingManagedListItems.length > 0) {
      await db.insert(managedListItems).values(nonExistingManagedListItems);
      inserted += nonExistingManagedListItems.length;
    }
  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveMeasureDefinitions() {
  await assertDevMigrationAccess();
  const inserted = 0;
  const updated = 0;
  const call = await fetchMigrationEndpoint("/measureDefinitions");
  const list = await call.json();
  const inputDefinitionsList: MeasureDefinition[] = list.measureDefinitions;
  const existingMeasureDefinitions = await db.select().from(measureDefinitions);
  const existingMeasureDefinitionIds = new Set(
    existingMeasureDefinitions.map((id) => id.id),
  );
  const nonExistingMeasureDefinitions = inputDefinitionsList.filter(
    (def) => !existingMeasureDefinitionIds.has(def.id),
  );

  try {
    if (nonExistingMeasureDefinitions.length > 0) {
      await db.insert(measureDefinitions).values(
        nonExistingMeasureDefinitions.map((def) => ({
          ...def,
          provider_id: 20,
          technology_id: 41,
        })),
      );
    }
  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveInputDlDefMappings(): Promise<MigrationStepResult> {
  await assertDevMigrationAccess();
  let inserted = 0;
  const updated = 0;

  try {
    // Get all prism input definitions
    const prismDefs = await db
      .select({
        id: measureDefinitions.id,
        name: measureDefinitions.name,
        variableName: measureDefinitions.variable_name,
      })
      .from(measureDefinitions);

    const byVarName = new Map<string, number>();
    const byName = new Map<string, number>();
    for (const d of prismDefs) {
      const vn = (d.variableName ?? "").trim().toLowerCase();
      const nm = (d.name ?? "").trim().toLowerCase();
      if (vn && !byVarName.has(vn)) byVarName.set(vn, d.id);
      if (nm && !byName.has(nm)) byName.set(nm, d.id);
    }

    // Get existing mappings
    const existingMappings = await db
      .select({ trainingDlDefId: inputDlDefMappings.training_dl_def_id })
      .from(inputDlDefMappings);
    const existingTrainingIds = new Set(
      existingMappings.map((m) => m.trainingDlDefId),
    );

    const dlDefs: Array<{
      id: number;
      name: string;
      variableName: string | null;
    }> = [];

    // Try the dlDef endpoint — parse text to handle BigInt values
    try {
      const call = await fetchLegacyMigEndpoint("/dlDef");
      const text = await call.text();
      // Parse manually, converting BigInt-like values
      const rows = JSON.parse(text, (_, v) =>
        typeof v === "bigint" ? Number(v) : v,
      ) as Array<Array<unknown>>;

      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (!Array.isArray(row)) continue;
          const id = Number(row[0]);
          const name = String(row[1] ?? "");
          const varName = typeof row[2] === "string" ? String(row[2]) : null;
          if (!id || !name) continue;
          dlDefs.push({ id, name, variableName: varName });
        }
      }
    } catch {
      logger.warn(
        "[mapping] dlDef endpoint unavailable, trying dataEntry source IDs",
      );
    }

    // If dlDef didn't work, collect training IDs from the data entry migration endpoint
    if (dlDefs.length === 0) {
      let cursor: number | null = null;
      let hasMore = true;
      const seenIds = new Set<number>();

      while (hasMore) {
        const params = new URLSearchParams();
        params.set("limit", "2000");
        if (cursor != null) params.set("cursor", String(cursor));

        try {
          const call = await fetchMigrationEndpoint(
            `/dataEntry?${params.toString()}`,
          );
          const page = (await call.json()) as {
            dataEntry?: Array<{
              measure_def_id?: number;
              input_def_name?: string;
              input_def_variable_name?: string;
            }>;
          };
          const entries = page.dataEntry ?? [];
          for (const e of entries) {
            const id = e.measure_def_id;
            if (id == null || seenIds.has(id)) continue;
            seenIds.add(id);
            dlDefs.push({
              id,
              name: e.input_def_name ?? "",
              variableName: e.input_def_variable_name ?? null,
            });
          }
          cursor =
            (
              page as {
                pagination?: { nextCursor?: number; hasMore?: boolean };
              }
            ).pagination?.nextCursor ?? null;
          hasMore = cursor != null && entries.length > 0;
        } catch {
          hasMore = false;
        }
      }
    }

    // Match and insert mappings
    const SIMILARITY_THRESHOLD = 0.8;

    for (const dl of dlDefs) {
      if (existingTrainingIds.has(dl.id)) continue;

      const vn = (dl.variableName ?? "").trim().toLowerCase();
      const nm = dl.name.trim().toLowerCase();

      let prismId: number | null = null;
      let confidence = "low";
      const reasons: string[] = [];

      if (vn && byVarName.has(vn)) {
        prismId = byVarName.get(vn)!;
        confidence = "high";
        reasons.push("variable_name exact match");
      } else if (nm && byName.has(nm)) {
        prismId = byName.get(nm)!;
        confidence = "medium";
        reasons.push("name exact match");
      } else {
        // Fuzzy match by name
        let bestScore = 0;
        let bestId: number | null = null;
        for (const d of prismDefs) {
          const score = stringSimilarity(dl.name, d.name);
          if (score > bestScore && score >= SIMILARITY_THRESHOLD) {
            bestScore = score;
            bestId = d.id;
          }
        }
        if (bestId != null) {
          prismId = bestId;
          confidence = bestScore >= 0.95 ? "medium" : "low";
          reasons.push(`fuzzy name match (${(bestScore * 100).toFixed(0)}%)`);
        }
      }

      if (prismId == null) {
        continue;
      }

      existingTrainingIds.add(dl.id);

      await db.insert(inputDlDefMappings).values({
        measure_def_id: prismId,
        training_dl_def_id: dl.id,
        training_dl_legacy_id: String(dl.id),
        training_source_id: null,
        training_dl_name: dl.name,
        training_variable_name: dl.variableName,
        score: Math.round(
          confidence === "high" ? 100 : confidence === "medium" ? 70 : 50,
        ),
        confidence,
        reasons,
        is_auto: true,
        is_approved: true,
        approved_at: new Date(),
      });
      inserted++;
    }
  } catch (error: unknown) {
    logMigrationError(error);
    return { ok: false, inserted, updated, total: inserted + updated };
  }

  revalidatePath("/migration");
  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveReportPeriods() {
  await assertDevMigrationAccess();
  const inserted = 0;
  const updated = 0;
  const call = await fetchMigrationEndpoint("/reportPeriods");
  const list = await call.json();
  const reportPeriodsList: ReportPeriod[] = list;
  const existingReportPeriods = await db.select().from(reportPeriods);
  const existingIds = new Set(existingReportPeriods.map((rp) => rp.id));
  const nonExistingReportPeriods = reportPeriodsList.filter(
    (rp) => !existingIds.has(rp.id),
  );

  try {
    if (nonExistingReportPeriods.length > 0) {
      await db.insert(reportPeriods).values(
        nonExistingReportPeriods.map((rp) => {
          return {
            ...rp,
            report_date: new Date(rp.report_date),
            request_date: new Date(rp.request_date),
            updated_at: rp.updated_at ? new Date(rp.updated_at) : new Date(),
            status_id: 844,
          };
        }),
      );
    }

    const allReportPeriods = await db.select().from(reportPeriods);
    const reportPeriodsByUtility = new Map<number, typeof allReportPeriods>();
    allReportPeriods.forEach((rp) => {
      const list = reportPeriodsByUtility.get(rp.utility_id) || [];
      list.push(rp);
      reportPeriodsByUtility.set(rp.utility_id, list);
    });

    for (const newRp of nonExistingReportPeriods) {
      const utilityPeriods = reportPeriodsByUtility.get(newRp.utility_id) || [];
      utilityPeriods.sort(
        (a, b) => a.report_date.getTime() - b.report_date.getTime(),
      );

      const newRpInList = utilityPeriods.find((rp) => rp.id === newRp.id);
      if (!newRpInList) continue;

      const prevRp = utilityPeriods.find(
        (rp) =>
          rp.report_date.getTime() < newRpInList.report_date.getTime() &&
          rp.id !== newRp.id,
      );
      if (!prevRp) continue;

      const energyResourcesList = await db
        .select()
        .from(units)
        .where(eq(units.utility_id, newRp.utility_id));

      const resourcesToUpdate = energyResourcesList.filter((er) =>
        er.period_entries.some((pe) => pe.report_period_id === prevRp.id),
      );

      for (const resource of resourcesToUpdate) {
        const prevEntry = resource.period_entries.find(
          (pe) => pe.report_period_id === prevRp.id,
        );
        if (!prevEntry) continue;

        const hasNewEntry = resource.period_entries.some(
          (pe) => pe.report_period_id === newRp.id,
        );
        if (hasNewEntry) continue;

        const newPeriodEntries = [
          ...resource.period_entries,
          {
            report_period_id: newRp.id,
            capacity_mw: prevEntry.capacity_mw,
            is_active: prevEntry.is_active,
          },
        ];

        await db
          .update(units)
          .set({ period_entries: newPeriodEntries })
          .where(eq(units.id, resource.id));
      }
    }
  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveEnergyResources() {
  await assertDevMigrationAccess();
  let inserted = 0;
  const updated = 0;
  let skippedInvalidForeignKeys = 0;
  const call = await fetchMigrationEndpoint("/generators");
  const list = await call.json();
  type SourceEnergyResource = Omit<EnergyResource, "period_entries"> & {
    period_entries?: EnergyResourcePeriodEntry[] | null;
    report_period_id?: number | null;
    capacity_mw?: number | string | null;
    is_active?: boolean | null;
  };

  const energyResourcesList: SourceEnergyResource[] = list;
  const groupedEnergyResources = new Map<number, EnergyResource>();

  for (const resource of energyResourcesList) {
    const normalizedPeriodEntries: EnergyResourcePeriodEntry[] = Array.isArray(
      resource.period_entries,
    )
      ? resource.period_entries
          .map((entry) => {
            const reportPeriodId =
              typeof entry?.report_period_id === "number"
                ? Math.trunc(entry.report_period_id)
                : null;

            if (reportPeriodId == null) return null;

            return {
              report_period_id: reportPeriodId,
              capacity_mw: toNumberOrNull(entry.capacity_mw),
              is_active: entry.is_active ?? true,
            };
          })
          .filter((entry): entry is EnergyResourcePeriodEntry => entry != null)
      : [];

    const reportPeriodId =
      resource.report_period_id == null
        ? null
        : Math.trunc(resource.report_period_id);

    if (normalizedPeriodEntries.length === 0 && reportPeriodId != null) {
      normalizedPeriodEntries.push({
        report_period_id: reportPeriodId,
        capacity_mw: toNumberOrNull(resource.capacity_mw),
        is_active: resource.is_active ?? true,
      });
    }

    const existing = groupedEnergyResources.get(resource.id);
    if (!existing) {
      const baseResource = { ...resource };
      delete baseResource.report_period_id;
      delete baseResource.capacity_mw;
      delete baseResource.is_active;

      groupedEnergyResources.set(resource.id, {
        ...baseResource,
        period_entries: normalizedPeriodEntries,
      } as EnergyResource);
      continue;
    }

    for (const currentPeriodEntry of normalizedPeriodEntries) {
      const existingEntryIndex = existing.period_entries.findIndex(
        (entry) =>
          entry.report_period_id === currentPeriodEntry.report_period_id,
      );

      if (existingEntryIndex === -1) {
        existing.period_entries = [
          ...existing.period_entries,
          currentPeriodEntry,
        ];
      } else {
        const existingEntry = existing.period_entries[existingEntryIndex];
        existing.period_entries[existingEntryIndex] = {
          report_period_id: existingEntry.report_period_id,
          capacity_mw:
            existingEntry.capacity_mw != null
              ? existingEntry.capacity_mw
              : currentPeriodEntry.capacity_mw,
          is_active: existingEntry.is_active || currentPeriodEntry.is_active,
        };
      }
    }
  }

  const dedupedEnergyResources = Array.from(groupedEnergyResources.values());

  const reportPeriodRows = await db
    .select({ id: reportPeriods.id, utilityId: reportPeriods.utility_id })
    .from(reportPeriods);

  const utilityReportPeriodIds = new Map<number, number[]>();
  for (const rp of reportPeriodRows) {
    const existing = utilityReportPeriodIds.get(rp.utilityId) ?? [];
    existing.push(rp.id);
    utilityReportPeriodIds.set(rp.utilityId, existing);
  }

  for (const resource of dedupedEnergyResources) {
    const utilityPeriodIds =
      utilityReportPeriodIds.get(resource.utility_id) ?? [];
    const existingPeriodIds = new Set(
      resource.period_entries.map((entry) => entry.report_period_id),
    );

    for (const reportPeriodId of utilityPeriodIds) {
      if (existingPeriodIds.has(reportPeriodId)) continue;

      resource.period_entries.push({
        report_period_id: reportPeriodId,
        capacity_mw: null,
        is_active: false,
      });
    }

    resource.period_entries.sort(
      (a, b) => a.report_period_id - b.report_period_id,
    );
  }

  const existingEnergyResources = await db.select().from(units);
  const existingIds = new Set(existingEnergyResources.map((er) => er.id));
  const nonExistingEnergyResources = dedupedEnergyResources.filter(
    (er) => !existingIds.has(er.id),
  );

  const [serviceAreaRows, utilityRows, managedItemRows] = await Promise.all([
    db.select({ id: serviceAreas.id }).from(serviceAreas),
    db.select({ id: organisations.id }).from(organisations),
    db.select({ id: managedListItems.id }).from(managedListItems),
  ]);

  const validServiceAreaIds = new Set(serviceAreaRows.map((row) => row.id));
  const validUtilityIds = new Set(utilityRows.map((row) => row.id));
  const validManagedItemIds = new Set(managedItemRows.map((row) => row.id));

  const validatedEnergyResources: Array<typeof units.$inferInsert> =
    [];

  for (const er of nonExistingEnergyResources) {
    const serviceAreaId = normalizeRequiredId(er.service_area_id);
    const utilityId = normalizeRequiredId(er.utility_id);
    const energyProviderId = normalizeRequiredId(er.provider_id);
    const energySourceId = normalizeRequiredId(er.technology_id);
    const aggLevelId = normalizeRequiredId(er.agg_level_id);

    const hasInvalidForeignKey =
      serviceAreaId == null ||
      !validServiceAreaIds.has(serviceAreaId) ||
      utilityId == null ||
      !validUtilityIds.has(utilityId) ||
      energyProviderId == null ||
      !validManagedItemIds.has(energyProviderId) ||
      energySourceId == null ||
      !validManagedItemIds.has(energySourceId) ||
      aggLevelId == null ||
      !validManagedItemIds.has(aggLevelId);

    if (hasInvalidForeignKey) {
      skippedInvalidForeignKeys += 1;
      continue;
    }

    validatedEnergyResources.push({
      ...er,
      service_area_id: serviceAreaId,
      utility_id: utilityId,
      provider_id: energyProviderId,
      technology_id: energySourceId,
      agg_level_id: aggLevelId,
      updated_at: er.updated_at ? new Date(er.updated_at) : new Date(),
      updated_by_id: null,
    });
  }

  try {
    if (validatedEnergyResources.length > 0) {
      await db.insert(units).values(validatedEnergyResources);
      inserted += validatedEnergyResources.length;
    }

    if (skippedInvalidForeignKeys > 0) {
      logger.warn(
        `[migration] retrieveEnergyResources skipped ${skippedInvalidForeignKeys} rows with invalid foreign keys`,
      );
    }
  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function backfillEnergyResourcePeriods() {
  await assertDevMigrationAccess();
  const inserted = 0;
  const updated = 0;

  try {
    const reportPeriodRows = await db
      .select({ id: reportPeriods.id, utilityId: reportPeriods.utility_id })
      .from(reportPeriods);

    const utilityReportPeriodIds = new Map<number, number[]>();
    for (const rp of reportPeriodRows) {
      const existing = utilityReportPeriodIds.get(rp.utilityId) ?? [];
      existing.push(rp.id);
      utilityReportPeriodIds.set(rp.utilityId, existing);
    }

    const resources = await db
      .select({
        id: units.id,
        utilityId: units.utility_id,
        periodEntries: units.period_entries,
      })
      .from(units);

    for (const resource of resources) {
      const utilityPeriodIds =
        utilityReportPeriodIds.get(resource.utilityId) ?? [];
      const existingEntries = Array.isArray(resource.periodEntries)
        ? [...resource.periodEntries]
        : [];

      const fallbackCapacity =
        existingEntries
          .slice()
          .sort((a, b) => b.report_period_id - a.report_period_id)
          .find((entry) => entry.capacity_mw != null)?.capacity_mw ?? null;

      const entriesByReportPeriod = new Map<
        number,
        EnergyResourcePeriodEntry
      >();
      for (const entry of existingEntries) {
        const previous = entriesByReportPeriod.get(entry.report_period_id);
        if (!previous) {
          entriesByReportPeriod.set(entry.report_period_id, { ...entry });
          continue;
        }

        entriesByReportPeriod.set(entry.report_period_id, {
          report_period_id: entry.report_period_id,
          capacity_mw:
            previous.capacity_mw != null
              ? previous.capacity_mw
              : entry.capacity_mw,
          is_active: previous.is_active || entry.is_active,
        });
      }

      const existingPeriodIds = new Set(
        existingEntries.map((entry) => entry.report_period_id),
      );

      for (const reportPeriodId of utilityPeriodIds) {
        if (existingPeriodIds.has(reportPeriodId)) continue;

        entriesByReportPeriod.set(reportPeriodId, {
          report_period_id: reportPeriodId,
          capacity_mw: fallbackCapacity,
          is_active: true,
        });
      }

      const nextEntries = Array.from(entriesByReportPeriod.values())
        .map((entry) => {
          const nextCapacity =
            entry.capacity_mw != null ? entry.capacity_mw : fallbackCapacity;

          return {
            report_period_id: entry.report_period_id,
            capacity_mw: nextCapacity,
            is_active: true,
          };
        })
        .sort((a, b) => a.report_period_id - b.report_period_id);

      const previousEntries = (
        Array.isArray(resource.periodEntries) ? resource.periodEntries : []
      )
        .map((entry) => ({
          report_period_id: entry.report_period_id,
          capacity_mw: entry.capacity_mw,
          is_active: entry.is_active,
        }))
        .sort((a, b) => a.report_period_id - b.report_period_id);

      if (JSON.stringify(previousEntries) !== JSON.stringify(nextEntries)) {
        await db
          .update(units)
          .set({ period_entries: nextEntries })
          .where(eq(units.id, resource.id));
      }
    }
  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveKpiDefinitions() {
  await assertDevMigrationAccess();
  const inserted = 0;
  const updated = 0;
  const call = await fetchMigrationEndpoint("/kpi");
  const list = await call.json();
  const kpiDefinitionsList: KpiDefinition[] = list;
  const existingKpiDefinitions = await db.select().from(kpiDefinitions);
  const existingIds = new Set(existingKpiDefinitions.map((kd) => kd.id));
  const nonExistingKpiDefinitions = kpiDefinitionsList.filter(
    (kd) => !existingIds.has(kd.id),
  );

  if (nonExistingKpiDefinitions.length > 0) {
    await db.insert(kpiDefinitions).values(
      nonExistingKpiDefinitions.map((kd) => {
        kd.id = generateRandomNumber(3);
        return kd;
      }),
    );
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

type SourceDataEntryRow = {
  source_id: number;
  report_period_id: number;
  unit_id: number | null;
  service_area_id: number | null;
  measure_def_id: number;
  input_def_legacy_id?: string | null;
  input_def_name?: string | null;
  input_def_variable_name?: string | null;
  value: string | null;
  comments: string | null;
  update_medium_id: number | null;
  status_legacy_id: number | null;
  not_available: boolean;
  is_relevant: boolean | null;
  is_deleted: boolean;
  provider_id: number | null;
  technology_id: number | null;
  customer_type_id: number | null;
  payment_mode_id: number | null;
  updated_at: string | Date | null;
  updated_by_legacy_id: number | null;
};

type SourceDataEntryPage = {
  dataEntry: SourceDataEntryRow[];
  pagination: {
    nextCursor: number | null;
    hasMore: boolean;
    returned: number;
  };
};

export type DataEntryComparisonFilters = {
  utilityId?: number;
  reportPeriodId?: number;
  categoryId?: number;
  subcategoryId?: number;
  maxRows?: number;
};

export type DataEntryComparisonRow = {
  status: "migrated" | "missing-in-prism" | "extra-in-prism";
  reportPeriodId: number;
  reportPeriodLabel: string;
  inputDefId: number;
  inputDefName: string;
  categoryId: number | null;
  categoryName: string;
  subcategoryId: number | null;
  subcategoryName: string;
  serviceAreaId: number | null;
  serviceAreaName: string;
  energyResourceId: number | null;
  energyResourceName: string;
  energyProviderId: number | null;
  energyProviderName: string;
  energySourceId: number | null;
  energySourceName: string;
};

export type DataEntryComparisonSummary = {
  sourceCount: number;
  prismCount: number;
  migratedCount: number;
  missingInPrismCount: number;
  extraInPrismCount: number;
  sourceTruncated: boolean;
  prismTruncated: boolean;
  comparedRows: number;
};

export type DataEntryComparisonResult = {
  summary: DataEntryComparisonSummary;
  rows: DataEntryComparisonRow[];
};

export type DataEntryComparisonFilterOptions = {
  utilities: Array<{ id: number; name: string }>;
  reportPeriods: Array<{ id: number; utilityId: number; label: string }>;
  categories: Array<{ id: number; name: string }>;
  subcategories: Array<{ id: number; name: string }>;
};

export type DataEntryBreakdownRow = {
  utilityId: number;
  utilityName: string;
  categoryId: number;
  categoryName: string;
  subcategoryId: number;
  subcategoryName: string;
  v1Count: number;
  v2Count: number;
  expectedCount: number;
  reportPeriodId: number | null;
  reportPeriodLabel: string;
};

export type DataEntryBreakdownFilterOptions = {
  utilities: Array<{ id: number; name: string }>;
  reportPeriods: Array<{ id: number; utilityId: number; label: string }>;
  reportTypes: Array<{ id: number; name: string }>;
  years: number[];
  categories: Array<{ id: number; name: string }>;
  subcategories: Array<{ id: number; name: string }>;
  subcategoryIdsByCategoryId: Record<number, number[]>;
};

export type DataEntryBreakdownResult = {
  rows: DataEntryBreakdownRow[];
  inputSummary: {
    totalInputs: number;
    operational: number;
    tariffStructure: number;
    generation: number;
    other: number;
    saCount: number;
    genCount: number;
    saPairs: number;
    genPairs: number;
    reportPeriodCount: number;
    utilities: Array<{
      name: string;
      reportPeriods: number;
      sas: number;
      gens: number;
    }>;
  } | null;
};

const normalizeSourceDataEntryPage = (
  payload: unknown,
): SourceDataEntryPage => {
  if (Array.isArray(payload)) {
    return {
      dataEntry: payload as SourceDataEntryRow[],
      pagination: {
        nextCursor: null,
        hasMore: false,
        returned: payload.length,
      },
    };
  }

  if (payload && typeof payload === "object") {
    const data = (payload as { dataEntry?: unknown }).dataEntry;
    const pagination = (payload as { pagination?: unknown }).pagination;

    const dataEntry = Array.isArray(data) ? (data as SourceDataEntryRow[]) : [];
    const parsedPagination =
      pagination && typeof pagination === "object"
        ? (pagination as {
            nextCursor?: number | null;
            hasMore?: boolean;
            returned?: number;
          })
        : undefined;

    return {
      dataEntry,
      pagination: {
        nextCursor:
          typeof parsedPagination?.nextCursor === "number" ||
          parsedPagination?.nextCursor === null
            ? parsedPagination.nextCursor
            : null,
        hasMore: parsedPagination?.hasMore === true,
        returned:
          typeof parsedPagination?.returned === "number"
            ? parsedPagination.returned
            : dataEntry.length,
      },
    };
  }

  return {
    dataEntry: [],
    pagination: {
      nextCursor: null,
      hasMore: false,
      returned: 0,
    },
  };
};

const PG_INT32_MIN = -2147483648;
const PG_INT32_MAX = 2147483647;

const isPgInt32 = (value: number): boolean =>
  Number.isInteger(value) && value >= PG_INT32_MIN && value <= PG_INT32_MAX;

const normalizeKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return key.length > 0 ? key : null;
};

const normalizeRequiredId = (
  value: number | null | undefined,
): number | null => {
  if (value == null) return null;
  const parsed = Math.trunc(value);
  return isPgInt32(parsed) ? parsed : null;
};

const normalizeOptionalId = (
  value: number | null | undefined,
): number | null => {
  if (value == null) return null;
  const parsed = Math.trunc(value);
  if (parsed <= 0) return null;
  return isPgInt32(parsed) ? parsed : null;
};

const normalizeOptionalFkId = (
  value: number | null,
  validIds: Set<number>,
): number | null => {
  if (value == null) return null;
  return validIds.has(value) ? value : null;
};

const mapStatus = (row: SourceDataEntryRow): DataEntryStatusId => {
  if (row.not_available) return DataEntryStatusId.Not_Available;

  if (row.status_legacy_id != null) {
    switch (row.status_legacy_id) {
      case 5:
        return DataEntryStatusId.Reviewed;
      case 6:
        return DataEntryStatusId.Approved;
      case 7:
        return DataEntryStatusId.Entered;
    }
  }

  if ((row.value ?? "").trim().length > 0) return DataEntryStatusId.Entered;
  return DataEntryStatusId.Pending;
};

const toStructuredComments = (
  rawComment: string | null,
  at: Date,
): DataEntryComment[] | null => {
  const text = rawComment?.trim() ?? "";
  if (!text) return null;

  return [
    {
      comment: text,
      commenterId: "migration",
      commenterName: "Migration",
      commenterRole: "system",
      date: at,
    },
  ];
};

type UtilityContextBackfillResult = {
  inserted: number;
  skippedNoPreviousPeriodData: number;
  targetPeriodsConsidered: number;
};

const isUtilityContextInput = (
  input: { categoryId: number | null; subcategoryId: number | null },
  managedListNameById: Map<number, string>,
): boolean => {
  const categoryName = normalizeKey(
    input.categoryId != null ? managedListNameById.get(input.categoryId) : null,
  );
  const subcategoryName = normalizeKey(
    input.subcategoryId != null
      ? managedListNameById.get(input.subcategoryId)
      : null,
  );

  return (
    (categoryName != null && categoryName.includes("utility context")) ||
    (subcategoryName != null && subcategoryName.includes("utility context"))
  );
};

const isCountryContextInput = (
  input: { categoryId: number | null; subcategoryId: number | null },
  managedListNameById: Map<number, string>,
): boolean => {
  const categoryName = normalizeKey(
    input.categoryId != null ? managedListNameById.get(input.categoryId) : null,
  );
  const subcategoryName = normalizeKey(
    input.subcategoryId != null
      ? managedListNameById.get(input.subcategoryId)
      : null,
  );

  return (
    (categoryName != null && categoryName.includes("country context")) ||
    (subcategoryName != null && subcategoryName.includes("country context"))
  );
};

const buildDataEntryKeyForTargetPeriod = (
  reportPeriodId: number,
  entry: {
    measure_def_id: number;
    service_area_id: number | null;
    unit_id: number | null;
    provider_id: number | null;
    technology_id: number | null;
    customer_type_id: number | null;
    payment_mode_id: number | null;
  },
): string => {
  return [
    reportPeriodId,
    entry.measure_def_id,
    nullableKeyPart(entry.service_area_id),
    nullableKeyPart(entry.unit_id),
    nullableKeyPart(entry.provider_id),
    nullableKeyPart(entry.technology_id),
    nullableKeyPart(entry.customer_type_id),
    nullableKeyPart(entry.payment_mode_id),
  ].join("|");
};

async function backfillUtilityContextDataEntriesFromPreviousPeriods(options?: {
  reportPeriodId?: number;
}): Promise<UtilityContextBackfillResult> {
  const managedItems = await db
    .select({ id: managedListItems.id, name: managedListItems.name })
    .from(managedListItems);
  const managedListNameById = new Map(managedItems.map((m) => [m.id, m.name]));

  const inputRows = await db
    .select({
      id: measureDefinitions.id,
      categoryId: measureDefinitions.measures_group_id,
      subcategoryId: measureDefinitions.measures_subgroup_id,
    })
    .from(measureDefinitions);

  const utilityContextInputIds = inputRows
    .filter((input) => isUtilityContextInput(input, managedListNameById))
    .map((input) => input.id);

  if (utilityContextInputIds.length === 0) {
    return {
      inserted: 0,
      skippedNoPreviousPeriodData: 0,
      targetPeriodsConsidered: 0,
    };
  }

  const periodRows = await db
    .select({
      id: reportPeriods.id,
      utilityId: reportPeriods.utility_id,
      reportDate: reportPeriods.report_date,
    })
    .from(reportPeriods);

  const periodById = new Map(periodRows.map((p) => [p.id, p]));
  const targetPeriods =
    options?.reportPeriodId != null
      ? periodById.has(options.reportPeriodId)
        ? [periodById.get(options.reportPeriodId)!]
        : []
      : periodRows;

  if (targetPeriods.length === 0) {
    return {
      inserted: 0,
      skippedNoPreviousPeriodData: 0,
      targetPeriodsConsidered: 0,
    };
  }

  const entries = await db
    .select({
      report_period_id: dataEntries.report_period_id,
      measure_def_id: dataEntries.measure_def_id,
      service_area_id: dataEntries.service_area_id,
      unit_id: dataEntries.unit_id,
      provider_id: dataEntries.provider_id,
      technology_id: dataEntries.technology_id,
      category_id: dataEntries.category_id,
      asset_id: dataEntries.asset_id,
      customer_type_id: dataEntries.customer_type_id,
      payment_mode_id: dataEntries.payment_mode_id,
      consumption_band_id: dataEntries.consumption_band_id,
      division_id: dataEntries.division_id,
      gender_id: dataEntries.gender_id,
      utility_function_id: dataEntries.utility_function_id,
      value: dataEntries.value,
      comments: dataEntries.comments,
      update_medium_id: dataEntries.update_medium_id,
      status_id: dataEntries.status_id,
      is_relevant: dataEntries.is_relevant,
      is_deleted: dataEntries.is_deleted,
    })
    .from(dataEntries)
    .where(inArray(dataEntries.measure_def_id, utilityContextInputIds));

  const entriesByPeriodId = new Map<number, typeof entries>();
  for (const entry of entries) {
    const existing = entriesByPeriodId.get(entry.report_period_id) ?? [];
    existing.push(entry);
    entriesByPeriodId.set(entry.report_period_id, existing);
  }

  const periodsByUtility = new Map<number, typeof periodRows>();
  for (const period of periodRows) {
    const existing = periodsByUtility.get(period.utilityId) ?? [];
    existing.push(period);
    periodsByUtility.set(period.utilityId, existing);
  }
  for (const periods of periodsByUtility.values()) {
    periods.sort((a, b) => {
      const dateDiff = a.reportDate.getTime() - b.reportDate.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.id - b.id;
    });
  }

  const rowsToInsert: Array<typeof dataEntries.$inferInsert> = [];
  const pendingInsertKeySet = new Set<string>();
  let skippedNoPreviousPeriodData = 0;

  for (const targetPeriod of targetPeriods) {
    const targetEntries = entriesByPeriodId.get(targetPeriod.id) ?? [];
    const existingTargetKeySet = new Set(
      targetEntries.map((entry) =>
        buildDataEntryKeyForTargetPeriod(targetPeriod.id, entry),
      ),
    );

    const utilityPeriods = periodsByUtility.get(targetPeriod.utilityId) ?? [];
    const previousPeriods = utilityPeriods.filter(
      (period) =>
        period.reportDate.getTime() < targetPeriod.reportDate.getTime() ||
        (period.reportDate.getTime() === targetPeriod.reportDate.getTime() &&
          period.id < targetPeriod.id),
    );

    let sourceEntriesForCopy: typeof entries = [];
    for (let i = previousPeriods.length - 1; i >= 0; i -= 1) {
      const source = entriesByPeriodId.get(previousPeriods[i].id) ?? [];
      const activeSource = source.filter((entry) => entry.is_deleted === false);
      if (activeSource.length > 0) {
        sourceEntriesForCopy = activeSource;
        break;
      }
    }

    if (sourceEntriesForCopy.length === 0) {
      skippedNoPreviousPeriodData += 1;
      continue;
    }

    for (const sourceEntry of sourceEntriesForCopy) {
      const key = buildDataEntryKeyForTargetPeriod(
        targetPeriod.id,
        sourceEntry,
      );
      if (existingTargetKeySet.has(key) || pendingInsertKeySet.has(key)) {
        continue;
      }

      pendingInsertKeySet.add(key);
      rowsToInsert.push({
        report_period_id: targetPeriod.id,
        measure_def_id: sourceEntry.measure_def_id,
        service_area_id: sourceEntry.service_area_id,
        unit_id: sourceEntry.unit_id,
        provider_id: sourceEntry.provider_id,
        technology_id: sourceEntry.technology_id,
        category_id: sourceEntry.category_id,
        asset_id: sourceEntry.asset_id,
        customer_type_id: sourceEntry.customer_type_id,
        payment_mode_id: sourceEntry.payment_mode_id,
        consumption_band_id: sourceEntry.consumption_band_id,
        division_id: sourceEntry.division_id,
        gender_id: sourceEntry.gender_id,
        utility_function_id: sourceEntry.utility_function_id,
        value: sourceEntry.value,
        comments: sourceEntry.comments,
        update_medium_id: sourceEntry.update_medium_id,
        status_id: sourceEntry.status_id,
        is_relevant: sourceEntry.is_relevant,
        is_deleted: false,
        updatedAt: new Date(),
        updatedById: null,
      });
    }
  }

  if (rowsToInsert.length > 0) {
    await db.insert(dataEntries).values(rowsToInsert);
  }

  return {
    inserted: rowsToInsert.length,
    skippedNoPreviousPeriodData,
    targetPeriodsConsidered: targetPeriods.length,
  };
}

async function backfillCountryContextDataEntriesFromPreviousPeriods(options?: {
  reportPeriodId?: number;
}): Promise<UtilityContextBackfillResult> {
  const managedItems = await db
    .select({ id: managedListItems.id, name: managedListItems.name })
    .from(managedListItems);
  const managedListNameById = new Map(managedItems.map((m) => [m.id, m.name]));

  const inputRows = await db
    .select({
      id: measureDefinitions.id,
      categoryId: measureDefinitions.measures_group_id,
      subcategoryId: measureDefinitions.measures_subgroup_id,
    })
    .from(measureDefinitions);

  const countryContextInputIds = inputRows
    .filter((input) => isCountryContextInput(input, managedListNameById))
    .map((input) => input.id);

  if (countryContextInputIds.length === 0) {
    return {
      inserted: 0,
      skippedNoPreviousPeriodData: 0,
      targetPeriodsConsidered: 0,
    };
  }

  const periodRows = await db
    .select({
      id: reportPeriods.id,
      utilityId: reportPeriods.utility_id,
      reportDate: reportPeriods.report_date,
    })
    .from(reportPeriods);

  const periodById = new Map(periodRows.map((p) => [p.id, p]));
  const targetPeriods =
    options?.reportPeriodId != null
      ? periodById.has(options.reportPeriodId)
        ? [periodById.get(options.reportPeriodId)!]
        : []
      : periodRows;

  if (targetPeriods.length === 0) {
    return {
      inserted: 0,
      skippedNoPreviousPeriodData: 0,
      targetPeriodsConsidered: 0,
    };
  }

  const entries = await db
    .select({
      report_period_id: dataEntries.report_period_id,
      measure_def_id: dataEntries.measure_def_id,
      service_area_id: dataEntries.service_area_id,
      unit_id: dataEntries.unit_id,
      provider_id: dataEntries.provider_id,
      technology_id: dataEntries.technology_id,
      category_id: dataEntries.category_id,
      asset_id: dataEntries.asset_id,
      customer_type_id: dataEntries.customer_type_id,
      payment_mode_id: dataEntries.payment_mode_id,
      consumption_band_id: dataEntries.consumption_band_id,
      division_id: dataEntries.division_id,
      gender_id: dataEntries.gender_id,
      utility_function_id: dataEntries.utility_function_id,
      value: dataEntries.value,
      comments: dataEntries.comments,
      update_medium_id: dataEntries.update_medium_id,
      status_id: dataEntries.status_id,
      is_relevant: dataEntries.is_relevant,
      is_deleted: dataEntries.is_deleted,
    })
    .from(dataEntries)
    .where(inArray(dataEntries.measure_def_id, countryContextInputIds));

  const entriesByPeriodId = new Map<number, typeof entries>();
  for (const entry of entries) {
    const existing = entriesByPeriodId.get(entry.report_period_id) ?? [];
    existing.push(entry);
    entriesByPeriodId.set(entry.report_period_id, existing);
  }

  const periodsByUtility = new Map<number, typeof periodRows>();
  for (const period of periodRows) {
    const existing = periodsByUtility.get(period.utilityId) ?? [];
    existing.push(period);
    periodsByUtility.set(period.utilityId, existing);
  }
  for (const periods of periodsByUtility.values()) {
    periods.sort((a, b) => {
      const dateDiff = a.reportDate.getTime() - b.reportDate.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.id - b.id;
    });
  }

  const rowsToInsert: Array<typeof dataEntries.$inferInsert> = [];
  const pendingInsertKeySet = new Set<string>();
  let skippedNoPreviousPeriodData = 0;

  for (const targetPeriod of targetPeriods) {
    const targetEntries = entriesByPeriodId.get(targetPeriod.id) ?? [];
    const existingTargetKeySet = new Set(
      targetEntries.map((entry) =>
        buildDataEntryKeyForTargetPeriod(targetPeriod.id, entry),
      ),
    );

    const utilityPeriods = periodsByUtility.get(targetPeriod.utilityId) ?? [];
    const previousPeriods = utilityPeriods.filter(
      (period) =>
        period.reportDate.getTime() < targetPeriod.reportDate.getTime() ||
        (period.reportDate.getTime() === targetPeriod.reportDate.getTime() &&
          period.id < targetPeriod.id),
    );

    let sourceEntriesForCopy: typeof entries = [];
    for (let i = previousPeriods.length - 1; i >= 0; i -= 1) {
      const source = entriesByPeriodId.get(previousPeriods[i].id) ?? [];
      const activeSource = source.filter((entry) => entry.is_deleted === false);
      if (activeSource.length > 0) {
        sourceEntriesForCopy = activeSource;
        break;
      }
    }

    if (sourceEntriesForCopy.length === 0) {
      skippedNoPreviousPeriodData += 1;
      continue;
    }

    for (const sourceEntry of sourceEntriesForCopy) {
      const key = buildDataEntryKeyForTargetPeriod(
        targetPeriod.id,
        sourceEntry,
      );
      if (existingTargetKeySet.has(key) || pendingInsertKeySet.has(key)) {
        continue;
      }

      pendingInsertKeySet.add(key);
      rowsToInsert.push({
        report_period_id: targetPeriod.id,
        measure_def_id: sourceEntry.measure_def_id,
        service_area_id: sourceEntry.service_area_id,
        unit_id: sourceEntry.unit_id,
        provider_id: sourceEntry.provider_id,
        technology_id: sourceEntry.technology_id,
        category_id: sourceEntry.category_id,
        asset_id: sourceEntry.asset_id,
        customer_type_id: sourceEntry.customer_type_id,
        payment_mode_id: sourceEntry.payment_mode_id,
        consumption_band_id: sourceEntry.consumption_band_id,
        division_id: sourceEntry.division_id,
        gender_id: sourceEntry.gender_id,
        utility_function_id: sourceEntry.utility_function_id,
        value: sourceEntry.value,
        comments: sourceEntry.comments,
        update_medium_id: sourceEntry.update_medium_id,
        status_id: sourceEntry.status_id,
        is_relevant: sourceEntry.is_relevant,
        is_deleted: false,
        updatedAt: new Date(),
        updatedById: null,
      });
    }
  }

  if (rowsToInsert.length > 0) {
    await db.insert(dataEntries).values(rowsToInsert);
  }

  return {
    inserted: rowsToInsert.length,
    skippedNoPreviousPeriodData,
    targetPeriodsConsidered: targetPeriods.length,
  };
}

export async function retrieveDataEntries(options?: {
  reportPeriodId?: number;
  batchSize?: number;
}) {
  await assertDevMigrationAccess();
  let inserted = 0;
  let updated = 0;
  let cursor: number | null = null;
  let hasMore = true;
  let utilityBackfillResult: UtilityContextBackfillResult = {
    inserted: 0,
    skippedNoPreviousPeriodData: 0,
    targetPeriodsConsidered: 0,
  };
  let countryBackfillResult: UtilityContextBackfillResult = {
    inserted: 0,
    skippedNoPreviousPeriodData: 0,
    targetPeriodsConsidered: 0,
  };

  const skippedSamples: Array<{
    sourceId: number | null;
    reason: string;
    reportPeriodId: number | null;
    inputDefId: number | null;
    sourceInputDefId: number | null;
  }> = [];

  const fuzzyMatchCache = new Map<string, number | null>();

  const recordSkippedSample = (
    row: SourceDataEntryRow,
    reason: string,
    reportPeriodId: number | null,
    inputDefId: number | null,
    sourceInputDefId: number | null,
  ) => {
    if (skippedSamples.length >= 100) return;
    skippedSamples.push({
      sourceId: row.source_id ?? null,
      reason,
      reportPeriodId,
      inputDefId,
      sourceInputDefId,
    });
  };

  const mappingRows = await db
    .select({
      trainingDlDefId: inputDlDefMappings.training_dl_def_id,
      inputDefId: inputDlDefMappings.measure_def_id,
      updatedAt: inputDlDefMappings.updated_at,
    })
    .from(inputDlDefMappings);

  const inputByTrainingDlDefId = new Map<
    number,
    { inputDefId: number; updatedAt: Date | null }
  >();
  for (const mapping of mappingRows) {
    const existing = inputByTrainingDlDefId.get(mapping.trainingDlDefId);
    if (!existing) {
      inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
        inputDefId: mapping.inputDefId,
        updatedAt: mapping.updatedAt,
      });
      continue;
    }

    const existingTime = existing.updatedAt?.getTime() ?? 0;
    const currentTime = mapping.updatedAt?.getTime() ?? 0;
    if (currentTime >= existingTime) {
      inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
        inputDefId: mapping.inputDefId,
        updatedAt: mapping.updatedAt,
      });
    }
  }

  const targetInputDefs = await db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      variableName: measureDefinitions.variable_name,
    })
    .from(measureDefinitions);

  const targetInputDefIds = new Set<number>(targetInputDefs.map((d) => d.id));
  const targetInputDefByName = new Map<string, number>();
  const targetInputDefByVariableName = new Map<string, number>();

  for (const inputDef of targetInputDefs) {
    const nameKey = normalizeKey(inputDef.name);
    if (nameKey && !targetInputDefByName.has(nameKey)) {
      targetInputDefByName.set(nameKey, inputDef.id);
    }

    const variableNameKey = normalizeKey(inputDef.variableName ?? null);
    if (variableNameKey && !targetInputDefByVariableName.has(variableNameKey)) {
      targetInputDefByVariableName.set(variableNameKey, inputDef.id);
    }
  }

  const targetReportPeriods = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods);
  const targetReportPeriodIds = new Set<number>(
    targetReportPeriods.map((r) => r.id),
  );

  const targetEnergyResources = await db
    .select({
      id: units.id,
      periodEntries: units.period_entries,
    })
    .from(units);
  const targetEnergyResourceIds = new Set<number>(
    targetEnergyResources.map((r) => r.id),
  );

  const targetServiceAreas = await db
    .select({ id: serviceAreas.id })
    .from(serviceAreas);
  const targetServiceAreaIds = new Set<number>(
    targetServiceAreas.map((r) => r.id),
  );

  const targetManagedListItems = await db
    .select({ id: managedListItems.id })
    .from(managedListItems);
  const targetManagedListItemIds = new Set<number>(
    targetManagedListItems.map((r) => r.id),
  );

  try {
    const loopStartedAt = Date.now();
    const LOOP_MAX_MS = 300_000;
    while (hasMore) {
      const params = new URLSearchParams();
      params.set("includeDeleted", "1");
      params.set("limit", "2000");

      if (cursor != null) params.set("cursor", String(cursor));
      if (options?.reportPeriodId != null) {
        params.set("reportPeriodId", String(options.reportPeriodId));
      }

      const call = await fetchMigrationEndpoint(
        `/dataEntry?${params.toString()}`,
      );
      if (!call.ok) {
        throw new Error(`Data entry migration API failed: ${call.status}`);
      }

      const page: SourceDataEntryPage = await call.json();

      if (page.dataEntry.length === 0) {
        cursor = page.pagination.nextCursor;
        hasMore = page.pagination.hasMore === true && cursor != null;
        continue;
      }

      // Phase 1: Normalize all rows, collecting keys for batch existence check
      type PreKey = {
        reportPeriodId: number;
        inputDefId: number;
        serviceAreaId: number | null;
        energyResourceId: number | null;
        energyProviderId: number | null;
        energySourceId: number | null;
        customerTypeId: number | null;
        paymentModeId: number | null;
      };
      const preKeys: PreKey[] = [];
      const preRows: Array<{
        row: SourceDataEntryRow;
        reportPeriodId: number;
        inputDefId: number;
        sourceTrainingDlDefId: number | null;
        serviceAreaId: number | null;
        energyResourceId: number | null;
        energyProviderId: number | null;
        energySourceId: number | null;
        customerTypeId: number | null;
        paymentModeId: number | null;
        updateMediumId: number | null;
      }> = [];

      for (const row of page.dataEntry) {
        const reportPeriodId = normalizeRequiredId(row.report_period_id);
        let inputDefId: number | null = null;

        const sourceTrainingDlDefId = toNumberOrNull(row.measure_def_id);
        if (sourceTrainingDlDefId != null) {
          const mapped = inputByTrainingDlDefId.get(sourceTrainingDlDefId);
          if (mapped) {
            inputDefId = mapped.inputDefId;
          }
        }

        if (inputDefId == null) {
          inputDefId = normalizeRequiredId(row.measure_def_id);
        }

        if (inputDefId != null && !targetInputDefIds.has(inputDefId)) {
          inputDefId = null;
        }

        if (inputDefId == null) {
          const byVariableName = normalizeKey(row.input_def_variable_name);
          const byName = normalizeKey(row.input_def_name);

          if (byVariableName != null) {
            const resolved = targetInputDefByVariableName.get(byVariableName);
            if (resolved != null) {
              inputDefId = resolved;
            }
          }

          if (inputDefId == null && byName != null) {
            const resolved = targetInputDefByName.get(byName);
            if (resolved != null) {
              inputDefId = resolved;
            }
          }

          if (inputDefId == null && row.input_def_name) {
            const rawName = row.input_def_name.trim().toLowerCase();
            const cached = fuzzyMatchCache.get(rawName);
            if (cached !== undefined) {
              inputDefId = cached;
            } else {
              let bestScore = 0;
              let bestId: number | null = null;
              for (const def of targetInputDefs) {
                const score = stringSimilarity(
                  rawName,
                  (def.name ?? "").trim().toLowerCase(),
                );
                if (score > bestScore && score >= 0.8) {
                  bestScore = score;
                  bestId = def.id;
                }
              }
              fuzzyMatchCache.set(rawName, bestId);
              inputDefId = bestId;
            }
          }
        }

        if (reportPeriodId == null || inputDefId == null) {
          if (inputDefId == null) {
            recordSkippedSample(
              row,
              "missing-input-definition-mapping",
              reportPeriodId,
              inputDefId,
              sourceTrainingDlDefId,
            );
          } else {
            recordSkippedSample(
              row,
              "invalid-or-missing-report-period-id",
              reportPeriodId,
              inputDefId,
              sourceTrainingDlDefId,
            );
          }
          continue;
        }

        if (!targetReportPeriodIds.has(reportPeriodId)) {
          recordSkippedSample(
            row,
            "report-period-not-found-in-target",
            reportPeriodId,
            inputDefId,
            sourceTrainingDlDefId,
          );
          continue;
        }

        const rawServiceAreaId = normalizeOptionalId(row.service_area_id);
        const rawEnergyResourceId = normalizeOptionalId(row.unit_id);
        const rawEnergyProviderId = normalizeOptionalId(row.provider_id);
        const rawEnergySourceId = normalizeOptionalId(row.technology_id);
        const rawCustomerTypeId = normalizeOptionalId(row.customer_type_id);
        const rawPaymentModeId = normalizeOptionalId(row.payment_mode_id);
        const rawUpdateMediumId = normalizeOptionalId(row.update_medium_id);

        const serviceAreaId = normalizeOptionalFkId(
          rawServiceAreaId,
          targetServiceAreaIds,
        );
        const energyResourceId = normalizeOptionalFkId(
          rawEnergyResourceId,
          targetEnergyResourceIds,
        );
        const energyProviderId = normalizeOptionalFkId(
          rawEnergyProviderId,
          targetManagedListItemIds,
        );
        const energySourceId = normalizeOptionalFkId(
          rawEnergySourceId,
          targetManagedListItemIds,
        );
        const customerTypeId = normalizeOptionalFkId(
          rawCustomerTypeId,
          targetManagedListItemIds,
        );
        const paymentModeId = normalizeOptionalFkId(
          rawPaymentModeId,
          targetManagedListItemIds,
        );

        preKeys.push({
          reportPeriodId,
          inputDefId,
          serviceAreaId,
          energyResourceId: energyResourceId,
          energyProviderId,
          energySourceId,
          customerTypeId,
          paymentModeId,
        });
        preRows.push({
          row,
          reportPeriodId,
          inputDefId,
          sourceTrainingDlDefId,
          serviceAreaId,
          energyResourceId: energyResourceId,
          energyProviderId,
          energySourceId,
          customerTypeId,
          paymentModeId,
          updateMediumId: normalizeOptionalFkId(
            rawUpdateMediumId,
            targetManagedListItemIds,
          ),
        });
      }

      // Phase 2: Batch SELECT existing rows
      const existingMap = new Map<string, string>();
      if (preKeys.length > 0) {
        const uniqueReportPeriodIds = [
          ...new Set(preKeys.map((k) => k.reportPeriodId)),
        ];
        const uniqueInputDefIds = [
          ...new Set(preKeys.map((k) => k.inputDefId)),
        ];

        const existingRows = await db
          .select({
            id: dataEntries.id,
            report_period_id: dataEntries.report_period_id,
            measure_def_id: dataEntries.measure_def_id,
            service_area_id: dataEntries.service_area_id,
            unit_id: dataEntries.unit_id,
            provider_id: dataEntries.provider_id,
            technology_id: dataEntries.technology_id,
            customer_type_id: dataEntries.customer_type_id,
            payment_mode_id: dataEntries.payment_mode_id,
          })
          .from(dataEntries)
          .where(
            and(
              inArray(dataEntries.report_period_id, uniqueReportPeriodIds),
              inArray(dataEntries.measure_def_id, uniqueInputDefIds),
            ),
          );

        for (const ex of existingRows) {
          const key = [
            ex.report_period_id,
            ex.measure_def_id,
            nullableKeyPart(ex.service_area_id),
            nullableKeyPart(ex.unit_id),
            nullableKeyPart(ex.provider_id),
            nullableKeyPart(ex.technology_id),
            nullableKeyPart(ex.customer_type_id),
            nullableKeyPart(ex.payment_mode_id),
          ].join("|");
          existingMap.set(key, ex.id);

          if (ex.unit_id != null) {
            const nullErKey = [
              ex.report_period_id,
              ex.measure_def_id,
              nullableKeyPart(ex.service_area_id),
              "null",
              nullableKeyPart(ex.provider_id),
              nullableKeyPart(ex.technology_id),
              nullableKeyPart(ex.customer_type_id),
              nullableKeyPart(ex.payment_mode_id),
            ].join("|");
            if (!existingMap.has(nullErKey)) {
              existingMap.set(nullErKey, ex.id);
            }
          }
        }
      }

      // Phase 3: Process each normalized row with pre-computed map
      for (const pr of preRows) {
        const { row, reportPeriodId, inputDefId } = pr;
        const energyResourceId = pr.energyResourceId;
        const serviceAreaId = pr.serviceAreaId;
        const energyProviderId = pr.energyProviderId;
        const energySourceId = pr.energySourceId;
        const customerTypeId = pr.customerTypeId;
        const paymentModeId = pr.paymentModeId;
        const updateMediumId = pr.updateMediumId;

        const updatedAt = row.updated_at
          ? new Date(row.updated_at)
          : new Date();
        const comments = toStructuredComments(row.comments, updatedAt);

        const dims3 = await getDimensionDefaults();

        const payload = {
          report_period_id: reportPeriodId,
          measure_def_id: inputDefId,
          service_area_id: serviceAreaId,
          unit_id: energyResourceId,
          provider_id: energyProviderId ?? dims3.energyProvider,
          technology_id: energySourceId ?? dims3.energySource,
          category_id: dims3.energyType,
          asset_id: dims3.energyResourceType,
          customer_type_id: customerTypeId ?? dims3.customerType,
          payment_mode_id: paymentModeId ?? dims3.paymentMode,
          consumption_band_id: dims3.consumptionBand,
          division_id: dims3.division,
          gender_id: dims3.gender,
          utility_function_id: dims3.utilityFunction,
          value: row.value,
          comments,
          update_medium_id: updateMediumId,
          status_id: mapStatus(row),
          is_relevant: row.is_relevant ?? true,
          is_deleted: row.is_deleted ?? false,
          updatedAt,
          updatedById: null,
        };

        const rowKey = [
          reportPeriodId,
          inputDefId,
          nullableKeyPart(serviceAreaId),
          nullableKeyPart(energyResourceId),
          nullableKeyPart(energyProviderId),
          nullableKeyPart(energySourceId),
          nullableKeyPart(customerTypeId),
          nullableKeyPart(paymentModeId),
        ].join("|");

        const existingId = existingMap.get(rowKey);
        if (existingId) {
          await db
            .update(dataEntries)
            .set(payload)
            .where(eq(dataEntries.id, existingId));
          updated += 1;
        } else {
          try {
            await db.insert(dataEntries).values(payload);
            inserted += 1;
          } catch (error: unknown) {
            if (!isUniqueViolationError(error)) {
              throw error;
            }

            const uniqueKeyConditions = [
              eq(dataEntries.report_period_id, reportPeriodId),
              eq(dataEntries.measure_def_id, inputDefId),
              serviceAreaId == null
                ? isNull(dataEntries.service_area_id)
                : eq(dataEntries.service_area_id, serviceAreaId),
              energyResourceId == null
                ? isNull(dataEntries.unit_id)
                : eq(dataEntries.unit_id, energyResourceId),
              energyProviderId == null
                ? isNull(dataEntries.provider_id)
                : eq(dataEntries.provider_id, energyProviderId),
              energySourceId == null
                ? isNull(dataEntries.technology_id)
                : eq(dataEntries.technology_id, energySourceId),
            ];

            const [existingByUniqueIndex] = await db
              .select({ id: dataEntries.id })
              .from(dataEntries)
              .where(and(...uniqueKeyConditions))
              .limit(1);

            if (!existingByUniqueIndex) {
              throw error;
            }

            await db
              .update(dataEntries)
              .set(payload)
              .where(eq(dataEntries.id, existingByUniqueIndex.id));
            updated += 1;
          }
        }
      }

      cursor = page.pagination.nextCursor;
      hasMore = page.pagination.hasMore === true && cursor != null;

      if (hasMore && Date.now() - loopStartedAt > LOOP_MAX_MS) {
        logger.warn(
          `[migration] retrieveDataEntries time budget exhausted after ${inserted + updated} ops ` +
            `(inserted=${inserted}, updated=${updated}), ` +
            `deferring remaining pages (next cursor: ${cursor}). Re-run to continue.`,
        );
        break;
      }
    }

    utilityBackfillResult =
      await backfillUtilityContextDataEntriesFromPreviousPeriods({
        reportPeriodId: options?.reportPeriodId,
      });

    countryBackfillResult =
      await backfillCountryContextDataEntriesFromPreviousPeriods({
        reportPeriodId: options?.reportPeriodId,
      });
  } catch (error: unknown) {
    logMigrationError(error);
    return {
      ok: false,
      inserted,
      updated,
      total: inserted + updated,
      utilityContextBackfill: utilityBackfillResult,
      countryContextBackfill: countryBackfillResult,
    };
  }

  revalidatePath("/migration");
  return {
    ok: true,
    inserted,
    updated,
    total: inserted + updated,
    utilityContextBackfill: utilityBackfillResult,
    countryContextBackfill: countryBackfillResult,
  };
}

type SourceTransmissionRelevanceRow = {
  source_id?: number;
  utility_id?: number | null;
  report_period_id?: number | null;
  service_area_id?: number | null;
  training_dl_def_id?: number | string | null;
  is_relevant?: boolean | null;
  is_deleted?: boolean | null;
  updated_at?: string | Date | null;
};

type SourceTransmissionRelevancePage = {
  transmissionRelevance: SourceTransmissionRelevanceRow[];
  pagination: {
    nextCursor: number | null;
    hasMore: boolean;
    returned: number;
  };
};

type SourceTariffRelevanceRow = {
  source_id?: number;
  utility_id?: number | null;
  report_period_id?: number | null;
  service_area_id?: number | null;
  training_dl_def_id?: number | string | null;
  payment_mode_id?: number | null;
  customer_type_id?: number | null;
  is_relevant?: boolean | null;
  is_deleted?: boolean | null;
  updated_at?: string | Date | null;
};

type SourceTariffRelevancePage = {
  tariffRelevance: SourceTariffRelevanceRow[];
  pagination: {
    nextCursor: number | null;
    hasMore: boolean;
    returned: number;
  };
};

type SourceInputRelevanceRow = {
  source_id?: number;
  utility_id?: number | null;
  report_period_id?: number | null;
  service_area_id?: number | null;
  training_dl_def_id?: number | string | null;
  is_relevant?: boolean | null;
  is_deleted?: boolean | null;
  updated_at?: string | Date | null;
};

type SourceInputRelevancePage = {
  inputRelevance: SourceInputRelevanceRow[];
  pagination: {
    nextCursor: number | null;
    hasMore: boolean;
    returned: number;
  };
};

type SourceGenerationRelevanceRow = {
  source_id?: number;
  utility_id?: number | null;
  report_period_id?: number | null;
  service_area_id?: number | null;
  training_dl_def_id?: number | string | null;
  provider_id?: number | null;
  category_id?: number | null;
  technology_id?: number | null;
  is_relevant?: boolean | null;
  is_deleted?: boolean | null;
  updated_at?: string | Date | null;
};

type SourceGenerationRelevancePage = {
  generationRelevance: SourceGenerationRelevanceRow[];
  pagination: {
    nextCursor: number | null;
    hasMore: boolean;
    returned: number;
  };
};

export async function retrieveTransmissionRelevance(options?: {
  reportPeriodId?: number;
  batchSize?: number;
}) {
  await assertDevMigrationAccess();
  let updated = 0;
  let cursor: number | null = null;
  let hasMore = true;

  const batchSize = Math.max(1, Math.min(2000, options?.batchSize ?? 500));

  const mappingRows = await db
    .select({
      trainingDlDefId: inputDlDefMappings.training_dl_def_id,
      inputDefId: inputDlDefMappings.measure_def_id,
      updatedAt: inputDlDefMappings.updated_at,
    })
    .from(inputDlDefMappings);

  const inputByTrainingDlDefId = new Map<
    number,
    { inputDefId: number; updatedAt: Date | null }
  >();

  for (const mapping of mappingRows) {
    const existing = inputByTrainingDlDefId.get(mapping.trainingDlDefId);
    if (!existing) {
      inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
        inputDefId: mapping.inputDefId,
        updatedAt: mapping.updatedAt,
      });
      continue;
    }

    const existingTime = existing.updatedAt?.getTime() ?? 0;
    const currentTime = mapping.updatedAt?.getTime() ?? 0;
    if (currentTime >= existingTime) {
      inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
        inputDefId: mapping.inputDefId,
        updatedAt: mapping.updatedAt,
      });
    }
  }

  const [targetReportPeriods, targetServiceAreas] = await Promise.all([
    db.select({ id: reportPeriods.id }).from(reportPeriods),
    db.select({ id: serviceAreas.id }).from(serviceAreas),
  ]);

  const targetReportPeriodIds = new Set(targetReportPeriods.map((r) => r.id));
  const targetServiceAreaIds = new Set(targetServiceAreas.map((r) => r.id));

  try {
    while (hasMore) {
      const params = new URLSearchParams();
      params.set("limit", String(batchSize));

      if (cursor != null) {
        params.set("cursor", String(cursor));
      }
      if (options?.reportPeriodId != null) {
        params.set("reportPeriodId", String(options.reportPeriodId));
      }

      const call = await fetchMigrationEndpoint(
        `/transmissionRelevance?${params.toString()}`,
      );

      if (!call.ok) {
        throw new Error(
          `Transmission relevance migration API failed: ${call.status}`,
        );
      }

      const page: SourceTransmissionRelevancePage = await call.json();

      for (const row of page.transmissionRelevance) {
        const reportPeriodId = toNumberOrNull(row.report_period_id);
        const serviceAreaId = toNumberOrNull(row.service_area_id);
        const sourceTrainingDlDefId = toNumberOrNull(row.training_dl_def_id);

        if (
          reportPeriodId == null ||
          serviceAreaId == null ||
          sourceTrainingDlDefId == null
        ) {
          continue;
        }

        if (
          !targetReportPeriodIds.has(reportPeriodId) ||
          !targetServiceAreaIds.has(serviceAreaId)
        ) {
          continue;
        }

        const mappedInput = inputByTrainingDlDefId.get(sourceTrainingDlDefId);
        const inputDefId = mappedInput?.inputDefId ?? null;

        if (inputDefId == null) {
          continue;
        }

        const [existing] = await db
          .select({ id: transmissionRelevance.id })
          .from(transmissionRelevance)
          .where(
            and(
              eq(transmissionRelevance.report_period_id, reportPeriodId),
              eq(transmissionRelevance.service_area_id, serviceAreaId),
              eq(transmissionRelevance.measure_def_id, inputDefId),
            ),
          )
          .orderBy(desc(transmissionRelevance.updatedAt))
          .limit(1);

        const updatedAt = row.updated_at
          ? new Date(row.updated_at)
          : new Date();

        if (existing) {
          await db
            .update(transmissionRelevance)
            .set({
              is_relevant: row.is_relevant ?? true,
              is_deleted: row.is_deleted ?? false,
              updatedAt,
              updatedById: null,
            })
            .where(eq(transmissionRelevance.id, existing.id));
          updated += 1;
          continue;
        }

        await db.insert(transmissionRelevance).values({
          report_period_id: reportPeriodId,
          service_area_id: serviceAreaId,
          measure_def_id: inputDefId,
          is_relevant: row.is_relevant ?? true,
          is_deleted: row.is_deleted ?? false,
          updatedAt,
          updatedById: null,
        });
        updated += 1;
      }

      cursor = page.pagination.nextCursor;
      hasMore = page.pagination.hasMore === true && cursor != null;
    }
  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");
  revalidatePath("/settings/relevance");
  revalidatePath("/data-entry");

  return { ok: true, inserted: 0, updated, total: updated };
}

export async function retrieveTariffRelevance(options?: {
  reportPeriodId?: number;
  batchSize?: number;
}) {
  await assertDevMigrationAccess();

  let updated = 0;
  let cursor: number | null = null;
  let hasMore = true;

  const batchSize = Math.max(1, Math.min(2000, options?.batchSize ?? 500));

  const mappingRows = await db
    .select({
      trainingDlDefId: inputDlDefMappings.training_dl_def_id,
      inputDefId: inputDlDefMappings.measure_def_id,
      updatedAt: inputDlDefMappings.updated_at,
    })
    .from(inputDlDefMappings);

  const inputByTrainingDlDefId = new Map<
    number,
    { inputDefId: number; updatedAt: Date | null }
  >();

  for (const mapping of mappingRows) {
    const existing = inputByTrainingDlDefId.get(mapping.trainingDlDefId);
    if (!existing) {
      inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
        inputDefId: mapping.inputDefId,
        updatedAt: mapping.updatedAt,
      });
      continue;
    }

    const existingTime = existing.updatedAt?.getTime() ?? 0;
    const currentTime = mapping.updatedAt?.getTime() ?? 0;
    if (currentTime >= existingTime) {
      inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
        inputDefId: mapping.inputDefId,
        updatedAt: mapping.updatedAt,
      });
    }
  }

  const [targetReportPeriods, targetServiceAreas, targetManagedListItems] =
    await Promise.all([
      db.select({ id: reportPeriods.id }).from(reportPeriods),
      db.select({ id: serviceAreas.id }).from(serviceAreas),
      db.select({ id: managedListItems.id }).from(managedListItems),
    ]);

  const targetReportPeriodIds = new Set(targetReportPeriods.map((r) => r.id));
  const targetServiceAreaIds = new Set(targetServiceAreas.map((r) => r.id));
  const targetManagedListItemIds = new Set(
    targetManagedListItems.map((r) => r.id),
  );

  try {
    const loopStartedAt = Date.now();
    const LOOP_MAX_MS = 60_000;
    while (hasMore) {
      const params = new URLSearchParams();
      params.set("limit", String(batchSize));

      if (cursor != null) {
        params.set("cursor", String(cursor));
      }
      if (options?.reportPeriodId != null) {
        params.set("reportPeriodId", String(options.reportPeriodId));
      }

      const call = await fetchMigrationEndpoint(
        `/tariffRelevance?${params.toString()}`,
      );

      if (!call.ok) {
        throw new Error(
          `Tariff relevance migration API failed: ${call.status}`,
        );
      }

      const page: SourceTariffRelevancePage = await call.json();

      for (const row of page.tariffRelevance) {
        const reportPeriodId = toNumberOrNull(row.report_period_id);
        const serviceAreaId = toNumberOrNull(row.service_area_id);
        const sourceTrainingDlDefId = toNumberOrNull(row.training_dl_def_id);
        const paymentModeId = toNumberOrNull(row.payment_mode_id);
        const customerTypeId = toNumberOrNull(row.customer_type_id);

        if (
          reportPeriodId == null ||
          serviceAreaId == null ||
          sourceTrainingDlDefId == null ||
          paymentModeId == null ||
          customerTypeId == null
        ) {
          continue;
        }

        if (
          !targetReportPeriodIds.has(reportPeriodId) ||
          !targetServiceAreaIds.has(serviceAreaId) ||
          !targetManagedListItemIds.has(paymentModeId) ||
          !targetManagedListItemIds.has(customerTypeId)
        ) {
          continue;
        }

        const mappedInput = inputByTrainingDlDefId.get(sourceTrainingDlDefId);
        const inputDefId = mappedInput?.inputDefId ?? null;

        if (inputDefId == null) {
          continue;
        }

        const [existing] = await db
          .select({ id: tariffRelevance.id })
          .from(tariffRelevance)
          .where(
            and(
              eq(tariffRelevance.report_period_id, reportPeriodId),
              eq(tariffRelevance.service_area_id, serviceAreaId),
              eq(tariffRelevance.measure_def_id, inputDefId),
              eq(tariffRelevance.payment_mode_id, paymentModeId),
              eq(tariffRelevance.customer_type_id, customerTypeId),
            ),
          )
          .orderBy(desc(tariffRelevance.updatedAt))
          .limit(1);

        const updatedAt = row.updated_at
          ? new Date(row.updated_at)
          : new Date();

        if (existing) {
          await db
            .update(tariffRelevance)
            .set({
              is_relevant: row.is_relevant ?? true,
              is_deleted: row.is_deleted ?? false,
              updatedAt,
              updatedById: null,
            })
            .where(eq(tariffRelevance.id, existing.id));
          updated += 1;
          continue;
        }

        await db.insert(tariffRelevance).values({
          report_period_id: reportPeriodId,
          service_area_id: serviceAreaId,
          measure_def_id: inputDefId,
          payment_mode_id: paymentModeId,
          customer_type_id: customerTypeId,
          is_relevant: row.is_relevant ?? true,
          is_deleted: row.is_deleted ?? false,
          updatedAt,
          updatedById: null,
        });
        updated += 1;
      }

      cursor = page.pagination.nextCursor;
      hasMore = page.pagination.hasMore === true && cursor != null;

      if (hasMore && Date.now() - loopStartedAt > LOOP_MAX_MS) {
        logger.warn(
          `[migration] retrieveTariffRelevance time budget exhausted after ${updated} ops ` +
            `(updated=${updated}), ` +
            `deferring remaining pages (next cursor: ${cursor}). Re-run to continue.`,
        );
        break;
      }
    }
  } catch (error: unknown) {
    logger.error("[migration:tariffRelevance] ERROR", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
            }
          : error,
    });
    logMigrationError(error);
  }

  revalidatePath("/migration");
  revalidatePath("/settings/relevance");
  revalidatePath("/data-entry");

  return { ok: true, inserted: 0, updated, total: updated };
}

export async function retrieveInputRelevance(options?: {
  reportPeriodId?: number;
  batchSize?: number;
}) {
  await assertDevMigrationAccess();
  let updated = 0;
  let cursor: number | null = null;
  let hasMore = true;

  const batchSize = Math.max(1, Math.min(2000, options?.batchSize ?? 500));

  const mappingRows = await db
    .select({
      trainingDlDefId: inputDlDefMappings.training_dl_def_id,
      inputDefId: inputDlDefMappings.measure_def_id,
      updatedAt: inputDlDefMappings.updated_at,
    })
    .from(inputDlDefMappings);

  const inputByTrainingDlDefId = new Map<
    number,
    { inputDefId: number; updatedAt: Date | null }
  >();

  for (const mapping of mappingRows) {
    const existing = inputByTrainingDlDefId.get(mapping.trainingDlDefId);
    if (!existing) {
      inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
        inputDefId: mapping.inputDefId,
        updatedAt: mapping.updatedAt,
      });
      continue;
    }

    const existingTime = existing.updatedAt?.getTime() ?? 0;
    const currentTime = mapping.updatedAt?.getTime() ?? 0;
    if (currentTime >= existingTime) {
      inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
        inputDefId: mapping.inputDefId,
        updatedAt: mapping.updatedAt,
      });
    }
  }

  const [targetServiceAreas] = await Promise.all([
    db.select({ id: serviceAreas.id }).from(serviceAreas),
  ]);

  const targetServiceAreaIds = new Set(targetServiceAreas.map((r) => r.id));

  try {
    while (hasMore) {
      const params = new URLSearchParams();
      params.set("limit", String(batchSize));

      if (cursor != null) {
        params.set("cursor", String(cursor));
      }
      if (options?.reportPeriodId != null) {
        params.set("reportPeriodId", String(options.reportPeriodId));
      }

      const call = await fetchMigrationEndpoint(
        `/inputRelevance?${params.toString()}`,
      );

      if (!call.ok) {
        throw new Error(`Input relevance migration API failed: ${call.status}`);
      }

      const page: SourceInputRelevancePage = await call.json();

      for (const row of page.inputRelevance) {
        const serviceAreaId = toNumberOrNull(row.service_area_id);
        const sourceTrainingDlDefId = toNumberOrNull(row.training_dl_def_id);

        if (serviceAreaId == null || sourceTrainingDlDefId == null) {
          continue;
        }

        if (!targetServiceAreaIds.has(serviceAreaId)) {
          continue;
        }

        const mappedInput = inputByTrainingDlDefId.get(sourceTrainingDlDefId);
        const inputDefId = mappedInput?.inputDefId ?? null;

        if (inputDefId == null) {
          continue;
        }

        const [existing] = await db
          .select({ id: inputRelevance.id })
          .from(inputRelevance)
          .where(
            and(
              eq(inputRelevance.measure_def_id, inputDefId),
              eq(inputRelevance.dimension_id, serviceAreaId),
            ),
          )
          .limit(1);

        if (existing) {
          await db
            .update(inputRelevance)
            .set({
              is_relevant: row.is_relevant ?? true,
            })
            .where(eq(inputRelevance.id, existing.id));
          updated += 1;
          continue;
        }

        await db.insert(inputRelevance).values({
          measure_def_id: inputDefId,
          dimension_id: serviceAreaId,
          is_relevant: row.is_relevant ?? true,
        });
        updated += 1;
      }

      cursor = page.pagination.nextCursor;
      hasMore = page.pagination.hasMore === true && cursor != null;
    }
  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");
  revalidatePath("/settings/relevance");
  revalidatePath("/data-entry");

  return { ok: true, inserted: 0, updated, total: updated };
}

export async function retrieveGenerationRelevance(options?: {
  reportPeriodId?: number;
  batchSize?: number;
}) {
  await assertDevMigrationAccess();
  let updated = 0;
  let cursor: number | null = null;
  let hasMore = true;

  const batchSize = Math.max(1, Math.min(2000, options?.batchSize ?? 500));

  try {
    while (hasMore) {
      const params = new URLSearchParams();
      params.set("limit", String(batchSize));

      if (cursor != null) {
        params.set("cursor", String(cursor));
      }
      if (options?.reportPeriodId != null) {
        params.set("reportPeriodId", String(options.reportPeriodId));
      }

      const call = await fetchMigrationEndpoint(
        `/generationRelevance?${params.toString()}`,
      );

      if (!call.ok) {
        throw new Error(
          `Generation relevance migration API failed: ${call.status}`,
        );
      }

      const page: SourceGenerationRelevancePage = await call.json();

      for (const row of page.generationRelevance) {
        const energyResourceTypeId = toNumberOrNull(row.provider_id);
        const energyTypeId = toNumberOrNull(row.category_id);
        const energySourceId = toNumberOrNull(row.technology_id);

        if (
          energyResourceTypeId == null ||
          energyTypeId == null ||
          energySourceId == null
        ) {
          continue;
        }

        const [existing] = await db
          .select({ id: energyResourceTypeRelevance.id })
          .from(energyResourceTypeRelevance)
          .where(
            and(
              eq(
                energyResourceTypeRelevance.asset_id,
                energyResourceTypeId,
              ),
              eq(energyResourceTypeRelevance.category_id, energyTypeId),
              eq(energyResourceTypeRelevance.technology_id, energySourceId),
            ),
          )
          .limit(1);

        if (existing) {
          updated += 1;
          continue;
        }

        await db.insert(energyResourceTypeRelevance).values({
          asset_id: energyResourceTypeId,
          category_id: energyTypeId,
          technology_id: energySourceId,
        });
        updated += 1;
      }

      cursor = page.pagination.nextCursor;
      hasMore = page.pagination.hasMore === true && cursor != null;
    }
  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");
  revalidatePath("/settings/relevance");
  revalidatePath("/data-entry");

  return { ok: true, inserted: 0, updated, total: updated };
}

const toOptionalNumber = (
  value: number | string | undefined,
): number | undefined => {
  if (value == null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : undefined;
};

const nullableKeyPart = (value: number | null | undefined): string =>
  value == null ? "null" : String(value);

const buildDataEntryComparisonKey = (entry: {
  report_period_id: number;
  measure_def_id: number;
  service_area_id: number | null;
  unit_id: number | null;
  provider_id: number | null;
  technology_id: number | null;
  customer_type_id: number | null;
  payment_mode_id: number | null;
}): string => {
  return [
    entry.report_period_id,
    entry.measure_def_id,
    nullableKeyPart(entry.service_area_id),
    nullableKeyPart(entry.unit_id),
    nullableKeyPart(entry.provider_id),
    nullableKeyPart(entry.technology_id),
    nullableKeyPart(entry.customer_type_id),
    nullableKeyPart(entry.payment_mode_id),
  ].join("|");
};

const parseNullableId = (value: string): number | null => {
  if (value === "null") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
};

const parseDataEntryComparisonKey = (key: string) => {
  const [
    reportPeriod,
    inputDef,
    serviceArea,
    energyResource,
    energyProvider,
    energySource,
    customerType,
    paymentMode,
  ] = key.split("|");

  return {
    report_period_id: Number(reportPeriod),
    measure_def_id: Number(inputDef),
    service_area_id: parseNullableId(serviceArea),
    unit_id: parseNullableId(energyResource),
    provider_id: parseNullableId(energyProvider),
    technology_id: parseNullableId(energySource),
    customer_type_id: parseNullableId(customerType),
    payment_mode_id: parseNullableId(paymentMode),
  };
};

const buildReportPeriodLabel = (
  reportDate: Date,
  reportTypeName?: string | null,
): string => {
  return formatReportPeriodDisplay(reportDate, reportTypeName);
};

export async function getDataEntryComparisonFilterOptions(): Promise<DataEntryComparisonFilterOptions> {
  await assertDevMigrationAccess();
  const utilityList = await db
    .select({ id: organisations.id, name: organisations.name })
    .from(organisations);

  const reportPeriodList = await db
    .select({
      id: reportPeriods.id,
      utilityId: reportPeriods.utility_id,
      reportDate: reportPeriods.report_date,
      reportTypeName: managedListItems.name,
    })
    .from(reportPeriods)
    .leftJoin(
      managedListItems,
      eq(reportPeriods.report_type_id, managedListItems.id),
    );

  const inputDefList = await db
    .select({
      categoryId: measureDefinitions.measures_group_id,
      subcategoryId: measureDefinitions.measures_subgroup_id,
    })
    .from(measureDefinitions);

  const categoryIds = Array.from(
    new Set(
      inputDefList
        .map((d) => d.categoryId)
        .filter((id): id is number => id != null),
    ),
  );
  const subcategoryIds = Array.from(
    new Set(
      inputDefList
        .map((d) => d.subcategoryId)
        .filter((id): id is number => id != null),
    ),
  );

  const categoryItems =
    categoryIds.length === 0
      ? []
      : await db
          .select({ id: managedListItems.id, name: managedListItems.name })
          .from(managedListItems)
          .where(inArray(managedListItems.id, categoryIds));

  const subcategoryItems =
    subcategoryIds.length === 0
      ? []
      : await db
          .select({ id: managedListItems.id, name: managedListItems.name })
          .from(managedListItems)
          .where(inArray(managedListItems.id, subcategoryIds));

  return {
    utilities: utilityList
      .map((u) => ({ id: u.id, name: u.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    reportPeriods: reportPeriodList
      .map((rp) => ({
        id: rp.id,
        utilityId: rp.utilityId,
        label: buildReportPeriodLabel(rp.reportDate, rp.reportTypeName),
      }))
      .sort((a, b) => b.id - a.id),
    categories: categoryItems
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    subcategories: subcategoryItems
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function compareDataEntries(
  filters?: DataEntryComparisonFilters,
): Promise<DataEntryComparisonResult> {
  await assertDevMigrationAccess();
  const utilityId = toOptionalNumber(filters?.utilityId);
  const reportPeriodId = toOptionalNumber(filters?.reportPeriodId);
  const categoryId = toOptionalNumber(filters?.categoryId);
  const subcategoryId = toOptionalNumber(filters?.subcategoryId);
  const maxRows = toOptionalNumber(filters?.maxRows);

  const conditions: Array<ReturnType<typeof eq> | ReturnType<typeof inArray>> =
    [];

  let scopedReportPeriodIds: number[] | undefined;
  if (reportPeriodId != null) {
    scopedReportPeriodIds = [reportPeriodId];
  } else if (utilityId != null) {
    const reportPeriodsForUtility = await db
      .select({ id: reportPeriods.id })
      .from(reportPeriods)
      .where(eq(reportPeriods.utility_id, utilityId));
    scopedReportPeriodIds = reportPeriodsForUtility.map((rp) => rp.id);
  }

  if (scopedReportPeriodIds != null) {
    if (scopedReportPeriodIds.length === 0) {
      return {
        summary: {
          sourceCount: 0,
          prismCount: 0,
          migratedCount: 0,
          missingInPrismCount: 0,
          extraInPrismCount: 0,
          sourceTruncated: false,
          prismTruncated: false,
          comparedRows: 0,
        },
        rows: [],
      };
    }
    conditions.push(
      scopedReportPeriodIds.length === 1
        ? eq(dataEntries.report_period_id, scopedReportPeriodIds[0])
        : inArray(dataEntries.report_period_id, scopedReportPeriodIds),
    );
  }

  let scopedInputDefIds: number[] | undefined;
  if (categoryId != null || subcategoryId != null) {
    const inputDefConditions = [];
    if (categoryId != null) {
      inputDefConditions.push(eq(measureDefinitions.measures_group_id, categoryId));
    }
    if (subcategoryId != null) {
      inputDefConditions.push(
        eq(measureDefinitions.measures_subgroup_id, subcategoryId),
      );
    }

    const defs = await db
      .select({ id: measureDefinitions.id })
      .from(measureDefinitions)
      .where(
        inputDefConditions.length === 1
          ? inputDefConditions[0]
          : and(...inputDefConditions),
      );

    scopedInputDefIds = defs.map((d) => d.id);
    if (scopedInputDefIds.length === 0) {
      return {
        summary: {
          sourceCount: 0,
          prismCount: 0,
          migratedCount: 0,
          missingInPrismCount: 0,
          extraInPrismCount: 0,
          sourceTruncated: false,
          prismTruncated: false,
          comparedRows: 0,
        },
        rows: [],
      };
    }
    conditions.push(
      scopedInputDefIds.length === 1
        ? eq(dataEntries.measure_def_id, scopedInputDefIds[0])
        : inArray(dataEntries.measure_def_id, scopedInputDefIds),
    );
  }

  const targetRowsQuery = db
    .select({
      report_period_id: dataEntries.report_period_id,
      measure_def_id: dataEntries.measure_def_id,
      service_area_id: dataEntries.service_area_id,
      unit_id: dataEntries.unit_id,
      provider_id: dataEntries.provider_id,
      technology_id: dataEntries.technology_id,
      customer_type_id: dataEntries.customer_type_id,
      payment_mode_id: dataEntries.payment_mode_id,
    })
    .from(dataEntries)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const targetRows =
    maxRows != null
      ? await targetRowsQuery.limit(maxRows + 1)
      : await targetRowsQuery;

  const sourceRows: SourceDataEntryRow[] = [];
  let cursor: number | null = null;
  let hasMore = true;

  while (hasMore && (maxRows == null || sourceRows.length < maxRows + 1)) {
    const params = new URLSearchParams();
    params.set("limit", "500");
    params.set("includeDeleted", "1");
    if (cursor != null) params.set("cursor", String(cursor));
    if (utilityId != null) params.set("utilityId", String(utilityId));
    if (reportPeriodId != null) {
      params.set("reportPeriodId", String(reportPeriodId));
    }

    const call = await fetchMigrationEndpoint(
      `/dataEntry?${params.toString()}`,
    );
    if (!call.ok) {
      throw new Error(`Data entry comparison API failed: ${call.status}`);
    }

    const page = normalizeSourceDataEntryPage(await call.json());
    sourceRows.push(...page.dataEntry);
    cursor = page.pagination.nextCursor;
    hasMore = page.pagination.hasMore === true && cursor != null;
  }

  const sourceTruncated = maxRows != null && sourceRows.length > maxRows;
  const prismTruncated = maxRows != null && targetRows.length > maxRows;
  const boundedSourceRows =
    maxRows != null ? sourceRows.slice(0, maxRows) : sourceRows;
  const boundedTargetRows =
    maxRows != null ? targetRows.slice(0, maxRows) : targetRows;

  const comparisonInputDefs = await db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      variableName: measureDefinitions.variable_name,
    })
    .from(measureDefinitions);

  const comparisonInputDefIds = new Set(comparisonInputDefs.map((d) => d.id));
  const comparisonInputDefByName = new Map<string, number>();
  const comparisonInputDefByVariableName = new Map<string, number>();

  for (const inputDef of comparisonInputDefs) {
    const nameKey = normalizeKey(inputDef.name);
    if (nameKey && !comparisonInputDefByName.has(nameKey)) {
      comparisonInputDefByName.set(nameKey, inputDef.id);
    }

    const variableKey = normalizeKey(inputDef.variableName ?? null);
    if (variableKey && !comparisonInputDefByVariableName.has(variableKey)) {
      comparisonInputDefByVariableName.set(variableKey, inputDef.id);
    }
  }

  const mappingRows = await db
    .select({
      trainingDlDefId: inputDlDefMappings.training_dl_def_id,
      inputDefId: inputDlDefMappings.measure_def_id,
      updatedAt: inputDlDefMappings.updated_at,
    })
    .from(inputDlDefMappings);

  const inputByTrainingDlDefId = new Map<
    number,
    { inputDefId: number; updatedAt: Date | null }
  >();
  for (const mapping of mappingRows) {
    const existing = inputByTrainingDlDefId.get(mapping.trainingDlDefId);
    if (!existing) {
      inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
        inputDefId: mapping.inputDefId,
        updatedAt: mapping.updatedAt,
      });
      continue;
    }

    const existingTime = existing.updatedAt?.getTime() ?? 0;
    const currentTime = mapping.updatedAt?.getTime() ?? 0;
    if (currentTime >= existingTime) {
      inputByTrainingDlDefId.set(mapping.trainingDlDefId, {
        inputDefId: mapping.inputDefId,
        updatedAt: mapping.updatedAt,
      });
    }
  }

  const targetServiceAreaIds = new Set<number>(
    (await db.select({ id: serviceAreas.id }).from(serviceAreas)).map(
      (r) => r.id,
    ),
  );

  const targetEnergyResources = await db
    .select({
      id: units.id,
      periodEntries: units.period_entries,
    })
    .from(units);
  const targetEnergyResourceIds = new Set<number>(
    targetEnergyResources.map((r) => r.id),
  );

  const targetManagedListItemIds = new Set<number>(
    (await db.select({ id: managedListItems.id }).from(managedListItems)).map(
      (r) => r.id,
    ),
  );

  const sourceByKey = new Map<
    string,
    {
      report_period_id: number;
      measure_def_id: number;
      service_area_id: number | null;
      unit_id: number | null;
      provider_id: number | null;
      technology_id: number | null;
      customer_type_id: number | null;
      payment_mode_id: number | null;
    }
  >();

  for (const row of boundedSourceRows) {
    const normalizedReportPeriodId = normalizeRequiredId(row.report_period_id);
    let normalizedInputDefId: number | null = null;

    const sourceTrainingDlDefId = toNumberOrNull(row.measure_def_id);
    if (sourceTrainingDlDefId != null) {
      const mapped = inputByTrainingDlDefId.get(sourceTrainingDlDefId);
      if (mapped) {
        normalizedInputDefId = mapped.inputDefId;
      }
    }

    if (normalizedInputDefId == null) {
      normalizedInputDefId = normalizeRequiredId(row.measure_def_id);
    }

    if (
      normalizedInputDefId != null &&
      !comparisonInputDefIds.has(normalizedInputDefId)
    ) {
      normalizedInputDefId = null;
    }

    if (normalizedInputDefId == null) {
      const byVariableName = normalizeKey(row.input_def_variable_name);
      const byName = normalizeKey(row.input_def_name);

      if (byVariableName != null) {
        const resolved = comparisonInputDefByVariableName.get(byVariableName);
        if (resolved != null) {
          normalizedInputDefId = resolved;
        }
      }

      if (normalizedInputDefId == null && byName != null) {
        const resolved = comparisonInputDefByName.get(byName);
        if (resolved != null) {
          normalizedInputDefId = resolved;
        }
      }
    }

    if (normalizedReportPeriodId == null || normalizedInputDefId == null) {
      continue;
    }

    if (
      scopedInputDefIds != null &&
      !scopedInputDefIds.includes(normalizedInputDefId)
    ) {
      continue;
    }

    const rawServiceAreaId = normalizeOptionalId(row.service_area_id);
    const rawEnergyResourceId = normalizeOptionalId(row.unit_id);
    const rawEnergyProviderId = normalizeOptionalId(row.provider_id);
    const rawEnergySourceId = normalizeOptionalId(row.technology_id);
    const rawCustomerTypeId = normalizeOptionalId(row.customer_type_id);
    const rawPaymentModeId = normalizeOptionalId(row.payment_mode_id);

    const serviceAreaId = normalizeOptionalFkId(
      rawServiceAreaId,
      targetServiceAreaIds,
    );
    const energyResourceId = normalizeOptionalFkId(
      rawEnergyResourceId,
      targetEnergyResourceIds,
    );
    const energyProviderId = normalizeOptionalFkId(
      rawEnergyProviderId,
      targetManagedListItemIds,
    );
    const energySourceId = normalizeOptionalFkId(
      rawEnergySourceId,
      targetManagedListItemIds,
    );
    const customerTypeId = normalizeOptionalFkId(
      rawCustomerTypeId,
      targetManagedListItemIds,
    );
    const paymentModeId = normalizeOptionalFkId(
      rawPaymentModeId,
      targetManagedListItemIds,
    );

    const normalized = {
      report_period_id: normalizedReportPeriodId,
      measure_def_id: normalizedInputDefId,
      service_area_id: serviceAreaId,
      unit_id: energyResourceId,
      provider_id: energyProviderId,
      technology_id: energySourceId,
      customer_type_id: customerTypeId,
      payment_mode_id: paymentModeId,
    };
    const key = buildDataEntryComparisonKey(normalized);
    if (!sourceByKey.has(key)) {
      sourceByKey.set(key, normalized);
    }
  }

  const targetByKey = new Map<
    string,
    {
      report_period_id: number;
      measure_def_id: number;
      service_area_id: number | null;
      unit_id: number | null;
      provider_id: number | null;
      technology_id: number | null;
      customer_type_id: number | null;
      payment_mode_id: number | null;
    }
  >();

  for (const row of boundedTargetRows) {
    const key = buildDataEntryComparisonKey(row);
    if (!targetByKey.has(key)) {
      targetByKey.set(key, row);
    }
  }

  const unionKeys = new Set([...sourceByKey.keys(), ...targetByKey.keys()]);

  const reportPeriodIds = Array.from(
    new Set(
      Array.from(unionKeys)
        .map((key) => parseDataEntryComparisonKey(key).report_period_id)
        .filter((id) => isPgInt32(id)),
    ),
  );
  const inputDefIds = Array.from(
    new Set(
      Array.from(unionKeys)
        .map((key) => parseDataEntryComparisonKey(key).measure_def_id)
        .filter((id) => isPgInt32(id)),
    ),
  );
  const serviceAreaIds = Array.from(
    new Set(
      Array.from(unionKeys)
        .map((key) => parseDataEntryComparisonKey(key).service_area_id)
        .filter((id): id is number => id != null),
    ),
  );
  const energyResourceIds = Array.from(
    new Set(
      Array.from(unionKeys)
        .map((key) => parseDataEntryComparisonKey(key).unit_id)
        .filter((id): id is number => id != null),
    ),
  );
  const managedListIds = Array.from(
    new Set(
      Array.from(unionKeys)
        .flatMap((key) => {
          const parsed = parseDataEntryComparisonKey(key);
          return [
            parsed.provider_id,
            parsed.technology_id,
            parsed.customer_type_id,
            parsed.payment_mode_id,
          ];
        })
        .filter((id): id is number => id != null),
    ),
  );

  const reportPeriodList =
    reportPeriodIds.length === 0
      ? []
      : await db
          .select({
            id: reportPeriods.id,
            reportDate: reportPeriods.report_date,
            reportTypeName: managedListItems.name,
          })
          .from(reportPeriods)
          .leftJoin(
            managedListItems,
            eq(reportPeriods.report_type_id, managedListItems.id),
          )
          .where(inArray(reportPeriods.id, reportPeriodIds));

  const inputDefList =
    inputDefIds.length === 0
      ? []
      : await db
          .select({
            id: measureDefinitions.id,
            name: measureDefinitions.name,
            categoryId: measureDefinitions.measures_group_id,
            subcategoryId: measureDefinitions.measures_subgroup_id,
          })
          .from(measureDefinitions)
          .where(inArray(measureDefinitions.id, inputDefIds));

  const serviceAreaList =
    serviceAreaIds.length === 0
      ? []
      : await db
          .select({ id: serviceAreas.id, name: serviceAreas.name })
          .from(serviceAreas)
          .where(inArray(serviceAreas.id, serviceAreaIds));

  const energyResourceList =
    energyResourceIds.length === 0
      ? []
      : await db
          .select({ id: units.id, name: units.name })
          .from(units)
          .where(inArray(units.id, energyResourceIds));

  const managedListItemList =
    managedListIds.length === 0
      ? []
      : await db
          .select({ id: managedListItems.id, name: managedListItems.name })
          .from(managedListItems)
          .where(inArray(managedListItems.id, managedListIds));

  const categoryIds = Array.from(
    new Set(
      inputDefList
        .map((d) => d.categoryId)
        .filter((id): id is number => id != null),
    ),
  );
  const subcategoryIds = Array.from(
    new Set(
      inputDefList
        .map((d) => d.subcategoryId)
        .filter((id): id is number => id != null),
    ),
  );

  const dimensionNameList =
    categoryIds.length + subcategoryIds.length === 0
      ? []
      : await db
          .select({ id: managedListItems.id, name: managedListItems.name })
          .from(managedListItems)
          .where(
            inArray(managedListItems.id, [
              ...new Set([...categoryIds, ...subcategoryIds]),
            ]),
          );

  const reportPeriodLabelById = new Map(
    reportPeriodList.map((rp) => [
      rp.id,
      buildReportPeriodLabel(rp.reportDate, rp.reportTypeName),
    ]),
  );
  const inputDefById = new Map(inputDefList.map((d) => [d.id, d]));
  const serviceAreaNameById = new Map(
    serviceAreaList.map((d) => [d.id, d.name]),
  );
  const energyResourceNameById = new Map(
    energyResourceList.map((d) => [d.id, d.name]),
  );
  const managedListNameById = new Map(
    managedListItemList.map((d) => [d.id, d.name]),
  );
  const dimensionNameById = new Map(
    dimensionNameList.map((d) => [d.id, d.name]),
  );

  const rows: DataEntryComparisonRow[] = [];
  let migratedCount = 0;
  let missingInPrismCount = 0;
  let extraInPrismCount = 0;

  for (const key of unionKeys) {
    const inSource = sourceByKey.has(key);
    const inPrism = targetByKey.has(key);
    const parsed = parseDataEntryComparisonKey(key);
    const inputDef = inputDefById.get(parsed.measure_def_id);

    const status: DataEntryComparisonRow["status"] = inSource
      ? inPrism
        ? "migrated"
        : "missing-in-prism"
      : "extra-in-prism";

    if (status === "migrated") migratedCount += 1;
    if (status === "missing-in-prism") missingInPrismCount += 1;
    if (status === "extra-in-prism") extraInPrismCount += 1;

    rows.push({
      status,
      reportPeriodId: parsed.report_period_id,
      reportPeriodLabel:
        reportPeriodLabelById.get(parsed.report_period_id) ??
        String(parsed.report_period_id),
      inputDefId: parsed.measure_def_id,
      inputDefName: inputDef?.name ?? String(parsed.measure_def_id),
      categoryId: inputDef?.categoryId ?? null,
      categoryName:
        inputDef?.categoryId != null
          ? (dimensionNameById.get(inputDef.categoryId) ??
            String(inputDef.categoryId))
          : "-",
      subcategoryId: inputDef?.subcategoryId ?? null,
      subcategoryName:
        inputDef?.subcategoryId != null
          ? (dimensionNameById.get(inputDef.subcategoryId) ??
            String(inputDef.subcategoryId))
          : "-",
      serviceAreaId: parsed.service_area_id,
      serviceAreaName:
        parsed.service_area_id != null
          ? (serviceAreaNameById.get(parsed.service_area_id) ??
            String(parsed.service_area_id))
          : "-",
      energyResourceId: parsed.unit_id,
      energyResourceName:
        parsed.unit_id != null
          ? (energyResourceNameById.get(parsed.unit_id) ??
            String(parsed.unit_id))
          : "-",
      energyProviderId: parsed.provider_id,
      energyProviderName:
        parsed.provider_id != null
          ? (managedListNameById.get(parsed.provider_id) ??
            String(parsed.provider_id))
          : "-",
      energySourceId: parsed.technology_id,
      energySourceName:
        parsed.technology_id != null
          ? (managedListNameById.get(parsed.technology_id) ??
            String(parsed.technology_id))
          : "-",
    });
  }

  rows.sort((a, b) => {
    const statusOrder = {
      "missing-in-prism": 0,
      "extra-in-prism": 1,
      migrated: 2,
    };
    return (
      statusOrder[a.status] - statusOrder[b.status] ||
      b.reportPeriodId - a.reportPeriodId ||
      a.inputDefName.localeCompare(b.inputDefName)
    );
  });

  return {
    summary: {
      sourceCount: sourceByKey.size,
      prismCount: targetByKey.size,
      migratedCount,
      missingInPrismCount,
      extraInPrismCount,
      sourceTruncated,
      prismTruncated,
      comparedRows: rows.length,
    },
    rows,
  };
}

export async function logMigrationStep(
  label: string,
  success: boolean,
  durationMs: number,
  errorMessage: string | null,
): Promise<void> {
  await db.insert(migrationLogs).values({
    step_label: label,
    success,
    duration_ms: durationMs,
    error_message: errorMessage,
  });
}

export async function getMigrationHistory() {
  const rows = await db
    .select()
    .from(migrationLogs)
    .orderBy(desc(migrationLogs.id))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    run_at: r.run_at?.toISOString() ?? "",
    step_label: r.step_label,
    success: r.success,
    duration_ms: r.duration_ms,
    error_message: r.error_message,
  }));
}

export async function getDataEntryBreakdownFilterOptions(): Promise<DataEntryBreakdownFilterOptions> {
  await assertDevMigrationAccess();

  const [utilityList, inputDefList] = await Promise.all([
    db
      .select({ id: organisations.id, name: organisations.name })
      .from(organisations)
      .where(eq(organisations.is_utility, true)),
    db
      .select({
        categoryId: measureDefinitions.measures_group_id,
        subcategoryId: measureDefinitions.measures_subgroup_id,
      })
      .from(measureDefinitions),
  ]);

  const categoryIds = Array.from(
    new Set(
      inputDefList
        .map((d) => d.categoryId)
        .filter((id): id is number => id != null),
    ),
  );
  const subcategoryIds = Array.from(
    new Set(
      inputDefList
        .map((d) => d.subcategoryId)
        .filter((id): id is number => id != null),
    ),
  );

  const subcategoryIdsByCategoryId: Record<number, number[]> = {};
  for (const def of inputDefList) {
    if (def.categoryId == null || def.subcategoryId == null) continue;
    const existing = subcategoryIdsByCategoryId[def.categoryId] ?? [];
    if (!existing.includes(def.subcategoryId)) {
      existing.push(def.subcategoryId);
    }
    subcategoryIdsByCategoryId[def.categoryId] = existing;
  }

  const [categoryItems, subcategoryItems] = await Promise.all([
    categoryIds.length === 0
      ? Promise.resolve([] as Array<{ id: number; name: string }>)
      : db
          .select({ id: managedListItems.id, name: managedListItems.name })
          .from(managedListItems)
          .where(inArray(managedListItems.id, categoryIds)),
    subcategoryIds.length === 0
      ? Promise.resolve([] as Array<{ id: number; name: string }>)
      : db
          .select({ id: managedListItems.id, name: managedListItems.name })
          .from(managedListItems)
          .where(inArray(managedListItems.id, subcategoryIds)),
  ]);

  return {
    utilities: utilityList
      .map((u) => ({ id: u.id, name: u.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    reportPeriods: await fetchReportPeriodOptionsWithUtility(),
    reportTypes: await fetchReportTypeOptions(),
    years: await fetchYearOptions(),
    categories: categoryItems
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    subcategories: subcategoryItems
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    subcategoryIdsByCategoryId,
  };
}

async function fetchYearOptions(): Promise<number[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT EXTRACT(YEAR FROM report_date)::int AS year
    FROM report_periods
    ORDER BY year DESC
  `);
  return rows.rows.map((r) => Number(r.year));
}

type V1BreakdownRow = {
  utilityName: string;
  categoryName: string;
  subcategoryName: string;
  entryCount: number;
};

export type InputBreakdownRow = {
  inputName: string;
  categoryName: string;
  subcategoryName: string;
  v2Count: number;
};

export async function getInputBreakdown(
  utilityId: number,
  reportPeriodId: number | null,
  reportTypeId: number | null,
  year: number | null,
  categoryId: number,
  subcategoryId: number,
  utilityName?: string,
): Promise<{
  rows: InputBreakdownRow[];
  totalV2: number;
  utilityId: number | null;
}> {
  await assertDevMigrationAccess();

  const catAlias = aliasedTable(managedListItems, "cat");
  const subAlias = aliasedTable(managedListItems, "sub");

  // Resolve utility ID from name if ID is missing
  let resolvedUtilityId = utilityId > 0 ? utilityId : null;
  if (!resolvedUtilityId && utilityName) {
    const [org] = await db
      .select({ id: organisations.id })
      .from(organisations)
      .where(eq(organisations.name, utilityName))
      .limit(1);
    if (org) resolvedUtilityId = org.id;
  }

  const defConditions = [eq(measureDefinitions.is_active, true)];
  if (categoryId != null)
    defConditions.push(eq(measureDefinitions.measures_group_id, categoryId));
  if (subcategoryId != null)
    defConditions.push(eq(measureDefinitions.measures_subgroup_id, subcategoryId));

  const defs = await db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      categoryName: catAlias.name,
      subcategoryName: subAlias.name,
    })
    .from(measureDefinitions)
    .innerJoin(catAlias, eq(measureDefinitions.measures_group_id, catAlias.id))
    .innerJoin(subAlias, eq(measureDefinitions.measures_subgroup_id, subAlias.id))
    .where(and(...defConditions))
    .orderBy(measureDefinitions.name);

  const rpConditions: Array<ReturnType<typeof eq> | ReturnType<typeof sql>> =
    [];
  if (reportPeriodId != null)
    rpConditions.push(eq(reportPeriods.id, reportPeriodId));
  if (resolvedUtilityId != null)
    rpConditions.push(eq(reportPeriods.utility_id, resolvedUtilityId));
  if (reportTypeId != null)
    rpConditions.push(eq(reportPeriods.report_type_id, reportTypeId));
  if (year != null)
    rpConditions.push(
      sql`EXTRACT(YEAR FROM ${reportPeriods.report_date}) = ${year}`,
    );

  const rps = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods)
    .innerJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .where(
      and(
        eq(organisations.is_utility, true),
        ...(rpConditions.length > 0 ? rpConditions : [undefined]),
      ),
    );
  const rpIds = rps.map((r) => r.id);

  if (rpIds.length === 0)
    return { rows: [], totalV2: 0, utilityId: resolvedUtilityId };

  const v2Rows = await db
    .select({
      inputDefId: dataEntries.measure_def_id,
      cnt: count(dataEntries.id),
    })
    .from(dataEntries)
    .innerJoin(
      measureDefinitions,
      eq(dataEntries.measure_def_id, measureDefinitions.id),
    )
    .where(
      and(
        inArray(dataEntries.report_period_id, rpIds),
        eq(dataEntries.is_deleted, false),
        categoryId > 0
          ? eq(measureDefinitions.measures_group_id, categoryId)
          : undefined,
        subcategoryId > 0
          ? eq(measureDefinitions.measures_subgroup_id, subcategoryId)
          : undefined,
      ),
    )
    .groupBy(dataEntries.measure_def_id);

  const v2ByInput = new Map<number, number>();
  let totalV2 = 0;
  for (const r of v2Rows) {
    const c = Number(r.cnt);
    v2ByInput.set(r.inputDefId, c);
    totalV2 += c;
  }

  const rows: InputBreakdownRow[] = defs.map((def) => ({
    inputName: def.name,
    categoryName: def.categoryName ?? "",
    subcategoryName: def.subcategoryName ?? "",
    v2Count: v2ByInput.get(def.id) ?? 0,
  }));

  return { rows, totalV2, utilityId: resolvedUtilityId };
}

async function fetchV1Breakdown(): Promise<{ rows: V1BreakdownRow[] }> {
  try {
    const response = await fetchMigrationEndpoint("/breakdown");
    const data = await response.json();
    const rows = (data as { rows?: V1BreakdownRow[] })?.rows;
    if (!Array.isArray(rows)) return { rows: [] };
    return { rows };
  } catch {
    return { rows: [] };
  }
}

async function fetchReportTypeOptions(): Promise<
  Array<{ id: number; name: string }>
> {
  const rows = await db
    .selectDistinct({ id: reportPeriods.report_type_id })
    .from(reportPeriods);

  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const items = await db
    .select({ id: managedListItems.id, name: managedListItems.name })
    .from(managedListItems)
    .where(inArray(managedListItems.id, ids))
    .orderBy(managedListItems.name);

  return items.map((i) => ({ id: i.id, name: i.name }));
}

async function fetchReportPeriodOptionsWithUtility(): Promise<
  Array<{ id: number; utilityId: number; label: string }>
> {
  const rows = await db
    .select({
      id: reportPeriods.id,
      utilityId: reportPeriods.utility_id,
      reportDate: reportPeriods.report_date,
      typeName: managedListItems.name,
    })
    .from(reportPeriods)
    .leftJoin(
      managedListItems,
      eq(reportPeriods.report_type_id, managedListItems.id),
    )
    .orderBy(desc(reportPeriods.report_date));

  return rows.map((r) => ({
    id: r.id,
    utilityId: r.utilityId,
    label: formatReportPeriodDisplay(r.reportDate, r.typeName),
  }));
}

export async function getDataEntryBreakdown(
  utilityId: number | null,
  reportPeriodId: number | null,
  reportTypeId: number | null,
  year: number | null,
  categoryId: number | null,
  subcategoryId: number | null,
): Promise<DataEntryBreakdownResult> {
  await assertDevMigrationAccess();

  let resolvedReportPeriodLabel = "";
  if (reportPeriodId != null) {
    const rp = await db
      .select({
        reportDate: reportPeriods.report_date,
        typeName: managedListItems.name,
      })
      .from(reportPeriods)
      .leftJoin(
        managedListItems,
        eq(reportPeriods.report_type_id, managedListItems.id),
      )
      .where(eq(reportPeriods.id, reportPeriodId))
      .limit(1);
    if (rp[0]) {
      resolvedReportPeriodLabel = formatReportPeriodDisplay(
        rp[0].reportDate,
        rp[0].typeName,
      );
    }
  }

  // 1. Identify managed list item IDs for the special categories/subcategories
  //    by finding which ones are actually referenced from measure_definitions
  const catAlias = aliasedTable(managedListItems, "cat");
  const subAlias = aliasedTable(managedListItems, "sub");

  const catLookup = await db
    .selectDistinct({
      id: measureDefinitions.measures_group_id,
      name: catAlias.name,
    })
    .from(measureDefinitions)
    .innerJoin(catAlias, eq(measureDefinitions.measures_group_id, catAlias.id))
    .where(
      sql`LOWER(${catAlias.name}) IN ('operational', 'tariff structure', 'generation', 'country & utility context', 'hr & safety', 'governance', 'financial')`,
    );

  const subLookup = await db
    .selectDistinct({
      id: measureDefinitions.measures_subgroup_id,
      name: subAlias.name,
    })
    .from(measureDefinitions)
    .innerJoin(subAlias, eq(measureDefinitions.measures_subgroup_id, subAlias.id))
    .where(
      sql`LOWER(${subAlias.name}) IN ('operational', 'tariff structure', 'generation', 'country context', 'utility context')`,
    );

  let operationalCatId: number | null = null;
  let tariffStructureSubId: number | null = null;
  let generationSubId: number | null = null;
  let countryUtilCatId: number | null = null;
  let countryContextSubId: number | null = null;
  let utilityContextSubId: number | null = null;
  let hrSafetyCatId: number | null = null;
  let governanceCatId: number | null = null;
  let financialCatId: number | null = null;

  for (const item of catLookup) {
    const n = item.name.toLowerCase();
    if (n === "operational" && operationalCatId == null)
      operationalCatId = item.id;
    if (n === "country & utility context" && countryUtilCatId == null)
      countryUtilCatId = item.id;
    if (n === "hr & safety" && hrSafetyCatId == null) hrSafetyCatId = item.id;
    if (n === "governance" && governanceCatId == null)
      governanceCatId = item.id;
    if (n === "financial" && financialCatId == null) financialCatId = item.id;
  }
  for (const item of subLookup) {
    const n = item.name.toLowerCase();
    if (n === "tariff structure" && tariffStructureSubId == null)
      tariffStructureSubId = item.id;
    if (n === "generation" && generationSubId == null)
      generationSubId = item.id;
    if (n === "country context" && countryContextSubId == null)
      countryContextSubId = item.id;
    if (n === "utility context" && utilityContextSubId == null)
      utilityContextSubId = item.id;
  }

  // 2. Get all relevant input definitions
  const inputDefConditions = [eq(measureDefinitions.is_active, true)];
  if (categoryId != null)
    inputDefConditions.push(eq(measureDefinitions.measures_group_id, categoryId));
  if (subcategoryId != null)
    inputDefConditions.push(
      eq(measureDefinitions.measures_subgroup_id, subcategoryId),
    );

  const allInputDefs = await db
    .select({
      id: measureDefinitions.id,
      categoryId: measureDefinitions.measures_group_id,
      categoryName: catAlias.name,
      subcategoryId: measureDefinitions.measures_subgroup_id,
      subcategoryName: subAlias.name,
    })
    .from(measureDefinitions)
    .innerJoin(catAlias, eq(measureDefinitions.measures_group_id, catAlias.id))
    .innerJoin(subAlias, eq(measureDefinitions.measures_subgroup_id, subAlias.id))
    .where(and(...inputDefConditions));

  // 3. Get relevant report periods with utility info
  const rpConditions = [];
  if (reportPeriodId != null) {
    rpConditions.push(eq(reportPeriods.id, reportPeriodId));
  }
  if (utilityId != null) {
    rpConditions.push(eq(reportPeriods.utility_id, utilityId));
  }
  if (reportTypeId != null) {
    rpConditions.push(eq(reportPeriods.report_type_id, reportTypeId));
  }
  if (year != null) {
    rpConditions.push(
      sql`EXTRACT(YEAR FROM ${reportPeriods.report_date}) = ${year}`,
    );
  }

  const relevantPeriods = await db
    .select({
      id: reportPeriods.id,
      utilityId: reportPeriods.utility_id,
      utilityName: organisations.name,
    })
    .from(reportPeriods)
    .innerJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .where(
      and(
        eq(organisations.is_utility, true),
        ...(rpConditions.length > 0 ? rpConditions : [undefined]),
      ),
    );

  // Gather unique utility IDs
  const utilityIds = [...new Set(relevantPeriods.map((p) => p.utilityId))];
  const rpIds = relevantPeriods.map((p) => p.id);

  // 4. Count distinct (input, SA) and (input, gen) pairs per utility
  //    These represent the actual cardinality of data per reporting period
  const opTariffPairByUtility = new Map<number, number>();
  const hrSafetyPairByUtility = new Map<number, number>();
  const governancePairByUtility = new Map<number, number>();
  const financialPairByUtility = new Map<number, number>();
  const ctxPairByUtility = new Map<number, number>();
  const genPairByUtility = new Map<number, number>();

  if (utilityIds.length > 0 && rpIds.length > 0) {
    // Distinct (input, SA) pairs for Operational/Tariff
    const opTariffRows = await db
      .selectDistinct({
        utilityId: reportPeriods.utility_id,
        inputId: dataEntries.measure_def_id,
        saId: dataEntries.service_area_id,
      })
      .from(dataEntries)
      .innerJoin(
        reportPeriods,
        eq(dataEntries.report_period_id, reportPeriods.id),
      )
      .innerJoin(
        measureDefinitions,
        eq(dataEntries.measure_def_id, measureDefinitions.id),
      )
      .where(
        and(
          inArray(reportPeriods.utility_id, utilityIds),
          inArray(dataEntries.report_period_id, rpIds),
          eq(dataEntries.is_deleted, false),
          sql`${dataEntries.service_area_id} IS NOT NULL`,
          sql`(
            ${measureDefinitions.measures_group_id} = ${operationalCatId ?? -1}
            OR ${measureDefinitions.measures_subgroup_id} = ${tariffStructureSubId ?? -1}
            OR ${measureDefinitions.measures_group_id} = ${hrSafetyCatId ?? -1}
            OR ${measureDefinitions.measures_group_id} = ${governanceCatId ?? -1}
            OR ${measureDefinitions.measures_group_id} = ${financialCatId ?? -1}
          )`,
        ),
      );
    for (const r of opTariffRows) {
      opTariffPairByUtility.set(
        r.utilityId,
        (opTariffPairByUtility.get(r.utilityId) ?? 0) + 1,
      );
    }

    // Distinct (input, SA) pairs for HR & Safety
    if (hrSafetyCatId != null) {
      const rows = await db
        .selectDistinct({
          utilityId: reportPeriods.utility_id,
          inputId: dataEntries.measure_def_id,
          saId: dataEntries.service_area_id,
        })
        .from(dataEntries)
        .innerJoin(
          reportPeriods,
          eq(dataEntries.report_period_id, reportPeriods.id),
        )
        .innerJoin(
          measureDefinitions,
          eq(dataEntries.measure_def_id, measureDefinitions.id),
        )
        .where(
          and(
            inArray(reportPeriods.utility_id, utilityIds),
            inArray(dataEntries.report_period_id, rpIds),
            eq(dataEntries.is_deleted, false),
            sql`${dataEntries.service_area_id} IS NOT NULL`,
            sql`${measureDefinitions.measures_group_id} = ${hrSafetyCatId}`,
          ),
        );
      for (const r of rows)
        hrSafetyPairByUtility.set(
          r.utilityId,
          (hrSafetyPairByUtility.get(r.utilityId) ?? 0) + 1,
        );
    }
    if (governanceCatId != null) {
      const rows = await db
        .selectDistinct({
          utilityId: reportPeriods.utility_id,
          inputId: dataEntries.measure_def_id,
          saId: dataEntries.service_area_id,
        })
        .from(dataEntries)
        .innerJoin(
          reportPeriods,
          eq(dataEntries.report_period_id, reportPeriods.id),
        )
        .innerJoin(
          measureDefinitions,
          eq(dataEntries.measure_def_id, measureDefinitions.id),
        )
        .where(
          and(
            inArray(reportPeriods.utility_id, utilityIds),
            inArray(dataEntries.report_period_id, rpIds),
            eq(dataEntries.is_deleted, false),
            sql`${dataEntries.service_area_id} IS NOT NULL`,
            sql`${measureDefinitions.measures_group_id} = ${governanceCatId}`,
          ),
        );
      for (const r of rows)
        governancePairByUtility.set(
          r.utilityId,
          (governancePairByUtility.get(r.utilityId) ?? 0) + 1,
        );
    }
    if (financialCatId != null) {
      const rows = await db
        .selectDistinct({
          utilityId: reportPeriods.utility_id,
          inputId: dataEntries.measure_def_id,
          saId: dataEntries.service_area_id,
        })
        .from(dataEntries)
        .innerJoin(
          reportPeriods,
          eq(dataEntries.report_period_id, reportPeriods.id),
        )
        .innerJoin(
          measureDefinitions,
          eq(dataEntries.measure_def_id, measureDefinitions.id),
        )
        .where(
          and(
            inArray(reportPeriods.utility_id, utilityIds),
            inArray(dataEntries.report_period_id, rpIds),
            eq(dataEntries.is_deleted, false),
            sql`${dataEntries.service_area_id} IS NOT NULL`,
            sql`${measureDefinitions.measures_group_id} = ${financialCatId}`,
          ),
        );
      for (const r of rows)
        financialPairByUtility.set(
          r.utilityId,
          (financialPairByUtility.get(r.utilityId) ?? 0) + 1,
        );
    }

    // Distinct (input, SA) pairs for Country/Utility Context
    const ctxRows = await db
      .selectDistinct({
        utilityId: reportPeriods.utility_id,
        inputId: dataEntries.measure_def_id,
        saId: dataEntries.service_area_id,
      })
      .from(dataEntries)
      .innerJoin(
        reportPeriods,
        eq(dataEntries.report_period_id, reportPeriods.id),
      )
      .innerJoin(
        measureDefinitions,
        eq(dataEntries.measure_def_id, measureDefinitions.id),
      )
      .where(
        and(
          inArray(reportPeriods.utility_id, utilityIds),
          inArray(dataEntries.report_period_id, rpIds),
          eq(dataEntries.is_deleted, false),
          sql`${dataEntries.service_area_id} IS NOT NULL`,
          sql`(
            ${measureDefinitions.measures_group_id} = ${countryUtilCatId ?? -1}
            OR ${measureDefinitions.measures_subgroup_id} = ${countryContextSubId ?? -1}
            OR ${measureDefinitions.measures_subgroup_id} = ${utilityContextSubId ?? -1}
          )`,
        ),
      );
    for (const r of ctxRows) {
      ctxPairByUtility.set(
        r.utilityId,
        (ctxPairByUtility.get(r.utilityId) ?? 0) + 1,
      );
    }

    // Distinct (input, gen) pairs for Generation inputs
    const genPairRows = await db
      .selectDistinct({
        utilityId: reportPeriods.utility_id,
        inputId: dataEntries.measure_def_id,
        genId: dataEntries.unit_id,
      })
      .from(dataEntries)
      .innerJoin(
        reportPeriods,
        eq(dataEntries.report_period_id, reportPeriods.id),
      )
      .innerJoin(
        measureDefinitions,
        eq(dataEntries.measure_def_id, measureDefinitions.id),
      )
      .where(
        and(
          inArray(reportPeriods.utility_id, utilityIds),
          inArray(dataEntries.report_period_id, rpIds),
          eq(dataEntries.is_deleted, false),
          sql`${dataEntries.unit_id} IS NOT NULL`,
          sql`${measureDefinitions.measures_subgroup_id} = ${generationSubId ?? -1}`,
        ),
      );
    for (const r of genPairRows) {
      genPairByUtility.set(
        r.utilityId,
        (genPairByUtility.get(r.utilityId) ?? 0) + 1,
      );
    }
  }

  // Also count SAs/gens for display purposes
  const saCountByUtility = new Map<number, number>();
  const genCountByUtility = new Map<number, number>();
  if (utilityIds.length > 0 && rpIds.length > 0) {
    const saRows = await db
      .selectDistinct({
        utilityId: serviceAreas.utility_id,
        saId: serviceAreas.id,
      })
      .from(serviceAreas)
      .innerJoin(dataEntries, eq(serviceAreas.id, dataEntries.service_area_id))
      .where(
        and(
          eq(serviceAreas.is_virtual, false),
          inArray(serviceAreas.utility_id, utilityIds),
          inArray(dataEntries.report_period_id, rpIds),
          eq(dataEntries.is_deleted, false),
        ),
      );
    for (const r of saRows) {
      saCountByUtility.set(
        r.utilityId,
        (saCountByUtility.get(r.utilityId) ?? 0) + 1,
      );
    }
    const genRows = await db
      .selectDistinct({
        utilityId: units.utility_id,
        genId: units.id,
      })
      .from(units)
      .innerJoin(
        dataEntries,
        eq(units.id, dataEntries.unit_id),
      )
      .where(
        and(
          inArray(units.utility_id, utilityIds),
          inArray(dataEntries.report_period_id, rpIds),
          eq(dataEntries.is_deleted, false),
        ),
      );
    for (const r of genRows) {
      genCountByUtility.set(
        r.utilityId,
        (genCountByUtility.get(r.utilityId) ?? 0) + 1,
      );
    }
  }

  // 5. Pre-count inputs per type for averaging
  const opInputCount = allInputDefs.filter(
    (d) => operationalCatId != null && d.categoryId === operationalCatId,
  ).length;
  const tarInputCount = allInputDefs.filter(
    (d) =>
      tariffStructureSubId != null &&
      d.subcategoryId === tariffStructureSubId &&
      !(operationalCatId != null && d.categoryId === operationalCatId),
  ).length;
  const ctxInputCount = allInputDefs.filter(
    (d) =>
      (countryUtilCatId != null && d.categoryId === countryUtilCatId) ||
      (countryContextSubId != null &&
        d.subcategoryId === countryContextSubId) ||
      (utilityContextSubId != null && d.subcategoryId === utilityContextSubId),
  ).length;
  const genInputCount = allInputDefs.filter(
    (d) => generationSubId != null && d.subcategoryId === generationSubId,
  ).length;
  const hrSafetyInputCount = allInputDefs.filter(
    (d) => hrSafetyCatId != null && d.categoryId === hrSafetyCatId,
  ).length;
  const governanceInputCount = allInputDefs.filter(
    (d) => governanceCatId != null && d.categoryId === governanceCatId,
  ).length;
  const financialInputCount = allInputDefs.filter(
    (d) => financialCatId != null && d.categoryId === financialCatId,
  ).length;

  // 6. Compute expected counts: for each (period, inputDef), multiply by the appropriate factor
  const key = (r: {
    utilityName: string;
    categoryName: string;
    subcategoryName: string;
  }) => `${r.utilityName}||${r.categoryName}||${r.subcategoryName}`;

  const expectedMap = new Map<string, number>();
  const idLookup = new Map<
    string,
    { utilityId: number; categoryId: number; subcategoryId: number }
  >();

  for (const period of relevantPeriods) {
    const opTariffPairs = opTariffPairByUtility.get(period.utilityId) ?? 0;
    const hrPairs = hrSafetyPairByUtility.get(period.utilityId) ?? 0;
    const govPairs = governancePairByUtility.get(period.utilityId) ?? 0;
    const finPairs = financialPairByUtility.get(period.utilityId) ?? 0;
    const ctxPairs = ctxPairByUtility.get(period.utilityId) ?? 0;
    const genPairs = genPairByUtility.get(period.utilityId) ?? 0;
    const opTariffTotal = opInputCount + tarInputCount;
    const avgOpTariff = opTariffTotal > 0 ? opTariffPairs / opTariffTotal : 0;
    const avgHr = hrSafetyInputCount > 0 ? hrPairs / hrSafetyInputCount : 0;
    const avgGov =
      governanceInputCount > 0 ? govPairs / governanceInputCount : 0;
    const avgFin = financialInputCount > 0 ? finPairs / financialInputCount : 0;
    const avgCtx = ctxInputCount > 0 ? ctxPairs / ctxInputCount : 0;
    const avgGen = genInputCount > 0 ? genPairs / genInputCount : 0;

    for (const def of allInputDefs) {
      let multiplier = 1;
      const isOperational =
        operationalCatId != null && def.categoryId === operationalCatId;
      const isTariffStructure =
        tariffStructureSubId != null &&
        def.subcategoryId === tariffStructureSubId;
      const isHrSafety =
        hrSafetyCatId != null && def.categoryId === hrSafetyCatId;
      const isGovernance =
        governanceCatId != null && def.categoryId === governanceCatId;
      const isFinancial =
        financialCatId != null && def.categoryId === financialCatId;
      const isGeneration =
        generationSubId != null && def.subcategoryId === generationSubId;
      const isCountryUtil =
        (countryUtilCatId != null && def.categoryId === countryUtilCatId) ||
        (countryContextSubId != null &&
          def.subcategoryId === countryContextSubId) ||
        (utilityContextSubId != null &&
          def.subcategoryId === utilityContextSubId);

      if (isGeneration) {
        multiplier = avgGen;
      } else if (isCountryUtil && avgCtx > 0) {
        multiplier = avgCtx;
      } else if (isHrSafety) {
        multiplier = avgHr;
      } else if (isGovernance) {
        multiplier = avgGov;
      } else if (isFinancial) {
        multiplier = avgFin;
      } else if (isOperational || isTariffStructure) {
        multiplier = avgOpTariff;
      }

      const k = key({
        utilityName: period.utilityName,
        categoryName: def.categoryName ?? "",
        subcategoryName: def.subcategoryName ?? "",
      });
      expectedMap.set(k, (expectedMap.get(k) ?? 0) + multiplier);

      if (!idLookup.has(k)) {
        idLookup.set(k, {
          utilityId: period.utilityId,
          categoryId: def.categoryId,
          subcategoryId: def.subcategoryId,
        });
      }
    }
  }

  // 7. Query v2 actual counts from data_entries
  const deConditions = [eq(dataEntries.is_deleted, false)];
  if (rpIds.length > 0) {
    deConditions.push(inArray(dataEntries.report_period_id, rpIds));
  }
  if (categoryId != null)
    deConditions.push(eq(measureDefinitions.measures_group_id, categoryId));
  if (subcategoryId != null)
    deConditions.push(eq(measureDefinitions.measures_subgroup_id, subcategoryId));

  const v2Map = new Map<string, number>();
  if (rpIds.length > 0) {
    const v2Rows = await db
      .select({
        utilityName: organisations.name,
        categoryId: catAlias.id,
        categoryName: catAlias.name,
        subcategoryId: subAlias.id,
        subcategoryName: subAlias.name,
        entryCount: count(dataEntries.id),
      })
      .from(dataEntries)
      .innerJoin(
        reportPeriods,
        eq(dataEntries.report_period_id, reportPeriods.id),
      )
      .innerJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
      .innerJoin(
        measureDefinitions,
        eq(dataEntries.measure_def_id, measureDefinitions.id),
      )
      .innerJoin(catAlias, eq(measureDefinitions.measures_group_id, catAlias.id))
      .innerJoin(subAlias, eq(measureDefinitions.measures_subgroup_id, subAlias.id))
      .where(and(...deConditions))
      .groupBy(
        organisations.name,
        catAlias.id,
        catAlias.name,
        subAlias.id,
        subAlias.name,
      );

    for (const r of v2Rows) {
      v2Map.set(
        key({
          utilityName: r.utilityName,
          categoryName: r.categoryName,
          subcategoryName: r.subcategoryName,
        }),
        Number(r.entryCount),
      );
    }
  }

  // 8. Fetch v1 counts from prism-training
  const v1Map = new Map<string, number>();
  try {
    const v1Result = await fetchV1Breakdown();
    for (const r of v1Result.rows) {
      v1Map.set(
        key({
          utilityName: r.utilityName,
          categoryName: r.categoryName,
          subcategoryName: r.subcategoryName,
        }),
        (v1Map.get(key(r)) ?? 0) + r.entryCount,
      );
    }
  } catch {
    // v1 unavailable — v1 bars will show 0
  }

  // 9. Merge v1, v2, and expected
  const allKeys = new Set([
    ...expectedMap.keys(),
    ...v2Map.keys(),
    ...v1Map.keys(),
  ]);
  const merged: DataEntryBreakdownRow[] = [];

  for (const k of allKeys) {
    const [utilityName, categoryName, subcategoryName] = k.split("||");
    const ref = idLookup.get(k);
    merged.push({
      utilityId: ref?.utilityId ?? 0,
      utilityName,
      categoryId: ref?.categoryId ?? 0,
      categoryName,
      subcategoryId: ref?.subcategoryId ?? 0,
      subcategoryName,
      v1Count: v1Map.get(k) ?? 0,
      v2Count: v2Map.get(k) ?? 0,
      expectedCount: Math.round(expectedMap.get(k) ?? 0),
      reportPeriodId,
      reportPeriodLabel: resolvedReportPeriodLabel,
    });
  }

  merged.sort((a, b) => {
    const u = a.utilityName.localeCompare(b.utilityName);
    if (u !== 0) return u;
    const c = a.categoryName.localeCompare(b.categoryName);
    if (c !== 0) return c;
    return a.subcategoryName.localeCompare(b.subcategoryName);
  });

  // 9. Compute input summary for the frontend
  const utilityBreakdown: Array<{
    name: string;
    reportPeriods: number;
    sas: number;
    gens: number;
  }> = [];

  for (const period of relevantPeriods) {
    const existing = utilityBreakdown.find(
      (u) => u.name === period.utilityName,
    );
    if (existing) {
      existing.reportPeriods++;
    } else {
      utilityBreakdown.push({
        name: period.utilityName,
        reportPeriods: 1,
        sas: saCountByUtility.get(period.utilityId) ?? 0,
        gens: genCountByUtility.get(period.utilityId) ?? 0,
      });
    }
  }

  const inputSummary = {
    totalInputs: allInputDefs.length,
    operational: 0,
    tariffStructure: 0,
    generation: 0,
    other: 0,
    saCount: [...saCountByUtility.values()].reduce((a, b) => a + b, 0),
    genCount: [...genCountByUtility.values()].reduce((a, b) => a + b, 0),
    saPairs: [...opTariffPairByUtility.values()].reduce((a, b) => a + b, 0),
    genPairs: [...genPairByUtility.values()].reduce((a, b) => a + b, 0),
    reportPeriodCount: relevantPeriods.length,
    utilities: utilityBreakdown,
  };

  for (const def of allInputDefs) {
    if (generationSubId != null && def.subcategoryId === generationSubId) {
      inputSummary.generation++;
    } else if (
      (operationalCatId != null && def.categoryId === operationalCatId) ||
      (tariffStructureSubId != null &&
        def.subcategoryId === tariffStructureSubId)
    ) {
      if (
        tariffStructureSubId != null &&
        def.subcategoryId === tariffStructureSubId
      ) {
        inputSummary.tariffStructure++;
      } else {
        inputSummary.operational++;
      }
    } else {
      inputSummary.other++;
    }
  }

  return { rows: merged, inputSummary };
}

export async function purgeAllDataEntryRecords(): Promise<{
  ok: boolean;
  tables: Record<string, number>;
  error?: string;
}> {
  await assertDevMigrationAccess();

  const counts: Record<string, number> = {};

  try {
    const r1 = await db.delete(kpiCalculationAttempts);
    counts["kpi_calculation_attempts"] = r1.rowCount ?? 0;

    const r2 = await db.delete(dataEntryLogs);
    counts["data_entry_logs"] = r2.rowCount ?? 0;

    const r3 = await db.delete(kpi);
    counts["kpi"] = r3.rowCount ?? 0;

    const r4 = await db.delete(dataEntries);
    counts["data_entries"] = r4.rowCount ?? 0;

    const r5 = await db.delete(tariffRelevance);
    counts["tariff_relevance"] = r5.rowCount ?? 0;

    const r6 = await db.delete(transmissionRelevance);
    counts["transmission_relevance"] = r6.rowCount ?? 0;

    revalidatePath("/migration");
    revalidatePath("/data-entry");
    revalidatePath("/settings/relevance");

    return { ok: true, tables: counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("[purge] Failed to purge data entry records:", {
      error: message,
    });
    return { ok: false, tables: counts, error: message };
  }
}

export async function deduplicateDataEntries(): Promise<{
  ok: boolean;
  deleted: number;
  error?: string;
}> {
  await assertDevMigrationAccess();

  try {
    const idsToDelete: string[] = [];

    // Pass 1: 6-field duplicates (uniq_entry index)
    const dupes6 = await db.execute(sql`
      WITH dupes AS (
        SELECT
          report_period_id, measure_def_id, service_area_id,
          technology_id, provider_id, unit_id,
          COUNT(*) as cnt,
          array_agg(id ORDER BY updated_at DESC) as ids
        FROM data_entries
        WHERE is_deleted = false
        GROUP BY 1, 2, 3, 4, 5, 6
        HAVING COUNT(*) > 1
      )
      SELECT ids[2:] as to_delete FROM dupes
    `);
    for (const row of dupes6.rows) {
      const arr = row.to_delete as string[];
      if (arr && arr.length > 0) idsToDelete.push(...arr);
    }

    // Pass 2: 8-field duplicates (exact duplicates including customer_type_id/payment_mode_id)
    const dupes8 = await db.execute(sql`
      WITH dupes AS (
        SELECT
          report_period_id, measure_def_id, service_area_id,
          unit_id, provider_id, technology_id,
          customer_type_id, payment_mode_id,
          COUNT(*) as cnt,
          array_agg(id ORDER BY updated_at DESC) as ids
        FROM data_entries
        WHERE is_deleted = false
        GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
        HAVING COUNT(*) > 1
      )
      SELECT ids[2:] as to_delete FROM dupes
    `);
    for (const row of dupes8.rows) {
      const arr = row.to_delete as string[];
      if (arr && arr.length > 0) idsToDelete.push(...arr);
    }

    // Pass 3: "Other" inputs with duplicate NULL/non-NULL SA/gen context
    //   For inputs NOT in Operational/Tariff/Generation, keep only the row
    //   with NULL service_area_id/unit_id.
    //   Delete rows where SA/ER/EP/ES are non-null when a NULL version exists
    //   for the same (report_period_id, measure_def_id).
    const dupesNull = await db.execute(sql`
      WITH pairs AS (
        SELECT de1.id as keep_id, de2.id as delete_id
        FROM data_entries de1
        JOIN data_entries de2
          ON de1.report_period_id = de2.report_period_id
         AND de1.measure_def_id = de2.measure_def_id
         AND de1.is_deleted = false AND de2.is_deleted = false
         AND de1.id != de2.id
         AND de1.service_area_id IS NULL
         AND de1.unit_id IS NULL
         AND de1.provider_id IS NULL
         AND de1.technology_id IS NULL
         AND (de2.service_area_id IS NOT NULL
           OR de2.unit_id IS NOT NULL
           OR de2.provider_id IS NOT NULL
           OR de2.technology_id IS NOT NULL)
        JOIN measure_definitions  id ON de1.measure_def_id = id.id
        WHERE id.category_id NOT IN (
          SELECT DISTINCT category_id FROM measure_definitions 
          WHERE category_id IS NOT NULL
            AND category_id IN (
              SELECT id FROM managed_list_items WHERE LOWER(name) = 'operational'
            )
        )
        AND id.subcategory_id NOT IN (
          SELECT DISTINCT subcategory_id FROM measure_definitions 
          WHERE subcategory_id IS NOT NULL
            AND subcategory_id IN (
              SELECT id FROM managed_list_items WHERE LOWER(name) IN ('tariff structure', 'generation')
            )
        )
        AND id.category_id NOT IN (
          SELECT DISTINCT category_id FROM measure_definitions 
          WHERE category_id IS NOT NULL
            AND category_id IN (
            SELECT id FROM managed_list_items WHERE LOWER(name) IN ('hr & safety', 'governance', 'financial')
          )
        )
      )
      SELECT delete_id FROM pairs
    `);
    for (const row of dupesNull.rows) {
      const id = row.delete_id as string;
      if (id) idsToDelete.push(id);
    }

    if (idsToDelete.length === 0) {
      return { ok: true, deleted: 0 };
    }

    await db
      .delete(dataEntryLogs)
      .where(inArray(dataEntryLogs.data_entry_id, idsToDelete));

    const result = await db
      .delete(dataEntries)
      .where(inArray(dataEntries.id, idsToDelete));

    revalidatePath("/migration");
    revalidatePath("/data-entry");

    return { ok: true, deleted: result.rowCount ?? idsToDelete.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("[dedup] Failed", { error: message });
    return { ok: false, deleted: 0, error: message };
  }
}
