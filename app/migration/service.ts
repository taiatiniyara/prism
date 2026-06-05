"use server";

import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { db } from "@/db/connection";
import { Role, roles, type UserStatus, user } from "@/db/schema/auth-schema";
import { countries, Country, SubRegion, subRegions } from "@/db/schema/country";
import {
  DataEntryComment,
  dataEntries,
  DataEntryStatusId,
  generationRelevance,
  generationToggleRelevance,
  InputDefinition,
  inputDlDefMappings,
  inputDefinitions,
} from "@/db/schema/dataEntry";
import { KpiDefinition, kpiDefinitions } from "@/db/schema/kpi";
import {
  ManagedList,
  ManagedListItem,
  managedListItems,
  managedLists,
} from "@/db/schema/managedLists";
import { ReportPeriod, reportPeriods } from "@/db/schema/reportPeriods";
import {
  EnergyResource,
  EnergyResourcePeriodEntry,
  energyResources,
  Organisation,
  organisations,
  ServiceArea,
  serviceAreas,
} from "@/db/schema/utility";
import { formatReportPeriodDisplay } from "@/lib/formatters";
import { getCurrentUser } from "@/lib/user.service";
import { generateRandomNumber } from "@/lib/utils";
import { aliasedTable, and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { migrationLogs } from "@/db/schema/migration-log";

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
const DATA_ENTRY_PAGE_LIMIT = Number(
  process.env.MIGRATION_DATA_ENTRY_PAGE_LIMIT ?? "500",
);
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
  console.error("[migration] operation failed", error);
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

const resolveDataEntryPageLimit = (): number => {
  if (!Number.isFinite(DATA_ENTRY_PAGE_LIMIT) || DATA_ENTRY_PAGE_LIMIT <= 0) {
    return 500;
  }

  return Math.max(1, Math.min(2000, Math.trunc(DATA_ENTRY_PAGE_LIMIT)));
};

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

  const errorMsg = [
    `Unable to reach migration endpoint for ${path}.`,
    `Tried: ${allFailures.join(" | ")}`,
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
  data_not_available?: boolean;
  is_deleted?: boolean;
  energy_provider_id?: number | null;
  energy_source_id?: number | null;
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
  data_not_available?: boolean;
  is_deleted?: boolean;
  country_id?: number | null;
};

export async function retrieveUtilityContextData(options?: {
  reportPeriodId?: number;
}) {
  await assertDevMigrationAccess();
  let inserted = 0;
  let updated = 0;

  try {
    const call = await fetchLegacyMigEndpoint("/utilityContext");
    const list = (await call.json()) as SourceUtilityContextRow[];

    const mappingRows = await db
      .select({
        trainingDlDefId: inputDlDefMappings.training_dl_def_id,
        inputDefId: inputDlDefMappings.input_def_id,
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
        db.select({ id: inputDefinitions.id }).from(inputDefinitions),
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
        normalizeOptionalId(row.energy_provider_id),
        targetManagedListItemIds,
      );
      const energySourceId = normalizeOptionalFkId(
        normalizeOptionalId(row.energy_source_id),
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

      const payload = {
        report_period_id: reportPeriodId,
        input_def_id: inputDefId,
        service_area_id: null,
        energy_resource_id: null,
        energy_provider_id: energyProviderId,
        energy_source_id: energySourceId,
        customer_type_id: customerTypeId,
        payment_mode_id: paymentModeId,
        value: row.dl_value ?? row.value ?? null,
        comments: toStructuredComments(row.comments ?? null, updatedAt),
        update_medium_id: null,
        status_id:
          row.data_not_available === true
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
            eq(dataEntries.input_def_id, inputDefId),
            isNull(dataEntries.service_area_id),
            isNull(dataEntries.energy_resource_id),
            energyProviderId == null
              ? isNull(dataEntries.energy_provider_id)
              : eq(dataEntries.energy_provider_id, energyProviderId),
            energySourceId == null
              ? isNull(dataEntries.energy_source_id)
              : eq(dataEntries.energy_source_id, energySourceId),
            customerTypeId == null
              ? isNull(dataEntries.customer_type_id)
              : eq(dataEntries.customer_type_id, customerTypeId),
            paymentModeId == null
              ? isNull(dataEntries.payment_mode_id)
              : eq(dataEntries.payment_mode_id, paymentModeId),
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

  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveCountryContextData(options?: {
  reportPeriodId?: number;
}) {
  await assertDevMigrationAccess();
  let inserted = 0;
  let updated = 0;

  try {
    const call = await fetchLegacyMigEndpoint("/countryContext");
    const list = (await call.json()) as SourceCountryContextRow[];

    const mappingRows = await db
      .select({
        trainingDlDefId: inputDlDefMappings.training_dl_def_id,
        inputDefId: inputDlDefMappings.input_def_id,
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
      db.select({ id: inputDefinitions.id }).from(inputDefinitions),
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

      const payload = {
        report_period_id: reportPeriodId,
        input_def_id: inputDefId,
        service_area_id: null,
        energy_resource_id: null,
        energy_provider_id: null,
        energy_source_id: null,
        customer_type_id: null,
        payment_mode_id: null,
        value: row.dl_value ?? row.value ?? null,
        comments: toStructuredComments(row.comments ?? null, updatedAt),
        update_medium_id: null,
        status_id:
          row.data_not_available === true
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
            eq(dataEntries.input_def_id, inputDefId),
            isNull(dataEntries.service_area_id),
            isNull(dataEntries.energy_resource_id),
            isNull(dataEntries.energy_provider_id),
            isNull(dataEntries.energy_source_id),
            isNull(dataEntries.customer_type_id),
            isNull(dataEntries.payment_mode_id),
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
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveRoles() {
  await assertDevMigrationAccess();
  let inserted = 0;
  let updated = 0;
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
  let updated = 0;
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
      utilityPeriods.sort((a, b) => a.report_date.getTime() - b.report_date.getTime());

      const newRpInList = utilityPeriods.find(
        (rp) => rp.report_date.getTime() === newRp.report_date.getTime() && rp.utility_id === newRp.utility_id,
      );
      if (!newRpInList) continue;

      const prevRp = utilityPeriods.find(
        (rp) => rp.report_date.getTime() < newRpInList.report_date.getTime() && rp.id !== newRpInList.id,
      );
      if (!prevRp) continue;

      const energyResourcesList = await db
        .select()
        .from(energyResources)
        .where(eq(energyResources.utility_id, newRp.utility_id));

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
          .update(energyResources)
          .set({ period_entries: newPeriodEntries })
          .where(eq(energyResources.id, resource.id));
      }

      const prevGenRelevance = await db
        .select()
        .from(generationRelevance)
        .where(eq(generationRelevance.report_period_id, prevRp.id));

      if (prevGenRelevance.length > 0) {
        const newGenRelevance = prevGenRelevance.map((gr) => ({
          id: crypto.randomUUID(),
          report_period_id: newRpInList.id,
          service_area_id: gr.service_area_id,
          input_def_id: gr.input_def_id,
          energy_provider_id: gr.energy_provider_id,
          energy_source_id: gr.energy_source_id,
          energy_resource_type_id: gr.energy_resource_type_id,
          is_relevant: gr.is_relevant,
          is_deleted: gr.is_deleted,
          updatedAt: new Date(),
          updatedById: gr.updatedById,
        }));

        await db.insert(generationRelevance).values(newGenRelevance);
        inserted += newGenRelevance.length;
      }

      const prevGenToggleRelevance = await db
        .select()
        .from(generationToggleRelevance)
        .where(eq(generationToggleRelevance.report_period_id, prevRp.id));

      if (prevGenToggleRelevance.length > 0) {
        const newGenToggleRelevance = prevGenToggleRelevance.map((gtr) => ({
          id: crypto.randomUUID(),
          report_period_id: newRpInList.id,
          service_area_id: gtr.service_area_id,
          energy_provider_id: gtr.energy_provider_id,
          energy_source_id: gtr.energy_source_id,
          is_relevant: gtr.is_relevant,
          is_deleted: gtr.is_deleted,
          updatedAt: new Date(),
          updatedById: gtr.updatedById,
        }));

        await db.insert(generationToggleRelevance).values(newGenToggleRelevance);
        inserted += newGenToggleRelevance.length;
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
  let updated = 0;
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
  let updated = 0;
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

export async function retrieveInputDefinitions() {
  await assertDevMigrationAccess();
  let inserted = 0;
  let updated = 0;
  const call = await fetchMigrationEndpoint("/inputDefinitions");
  const list = await call.json();
  const inputDefinitionsList: InputDefinition[] = list.inputDefinitions;
  const existingInputDefinitions = await db.select().from(inputDefinitions);
  const existingInputDefinitionIds = new Set(
    existingInputDefinitions.map((id) => id.id),
  );
  const nonExistingInputDefinitions = inputDefinitionsList.filter(
    (def) => !existingInputDefinitionIds.has(def.id),
  );

  try {
    if (nonExistingInputDefinitions.length > 0) {
      await db.insert(inputDefinitions).values(
        nonExistingInputDefinitions.map((def) => ({
          ...def,
          energy_provider_id: 20,
          energy_source_id: 41,
        })),
      );
    }
  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveReportPeriods() {
  await assertDevMigrationAccess();
  let inserted = 0;
  let updated = 0;
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
      utilityPeriods.sort((a, b) => a.report_date.getTime() - b.report_date.getTime());

      const newRpInList = utilityPeriods.find((rp) => rp.id === newRp.id);
      if (!newRpInList) continue;

      const prevRp = utilityPeriods.find(
        (rp) => rp.report_date.getTime() < newRpInList.report_date.getTime() && rp.id !== newRp.id,
      );
      if (!prevRp) continue;

      const energyResourcesList = await db
        .select()
        .from(energyResources)
        .where(eq(energyResources.utility_id, newRp.utility_id));

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
          .update(energyResources)
          .set({ period_entries: newPeriodEntries })
          .where(eq(energyResources.id, resource.id));
      }

      const prevGenRelevance = await db
        .select()
        .from(generationRelevance)
        .where(eq(generationRelevance.report_period_id, prevRp.id));

      if (prevGenRelevance.length > 0) {
        const newGenRelevance = prevGenRelevance.map((gr) => ({
          id: crypto.randomUUID(),
          report_period_id: newRp.id,
          service_area_id: gr.service_area_id,
          input_def_id: gr.input_def_id,
          energy_provider_id: gr.energy_provider_id,
          energy_source_id: gr.energy_source_id,
          energy_resource_type_id: gr.energy_resource_type_id,
          is_relevant: gr.is_relevant,
          is_deleted: gr.is_deleted,
          updatedAt: new Date(),
          updatedById: gr.updatedById,
        }));

        await db.insert(generationRelevance).values(newGenRelevance);
        inserted += newGenRelevance.length;
      }

      const prevGenToggleRelevance = await db
        .select()
        .from(generationToggleRelevance)
        .where(eq(generationToggleRelevance.report_period_id, prevRp.id));

      if (prevGenToggleRelevance.length > 0) {
        const newGenToggleRelevance = prevGenToggleRelevance.map((gtr) => ({
          id: crypto.randomUUID(),
          report_period_id: newRp.id,
          service_area_id: gtr.service_area_id,
          energy_provider_id: gtr.energy_provider_id,
          energy_source_id: gtr.energy_source_id,
          is_relevant: gtr.is_relevant,
          is_deleted: gtr.is_deleted,
          updatedAt: new Date(),
          updatedById: gtr.updatedById,
        }));

        await db.insert(generationToggleRelevance).values(newGenToggleRelevance);
        inserted += newGenToggleRelevance.length;
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
  let updated = 0;
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

  const existingEnergyResources = await db.select().from(energyResources);
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

  const validatedEnergyResources: Array<typeof energyResources.$inferInsert> =
    [];

  for (const er of nonExistingEnergyResources) {
    const serviceAreaId = normalizeRequiredId(er.service_area_id);
    const utilityId = normalizeRequiredId(er.utility_id);
    const energyProviderId = normalizeRequiredId(er.energy_provider_id);
    const energyTypeId = normalizeRequiredId(er.energy_type_id);
    const energySourceId = normalizeRequiredId(er.energy_source_id);
    const aggLevelId = normalizeRequiredId(er.agg_level_id);

    const hasInvalidForeignKey =
      serviceAreaId == null ||
      !validServiceAreaIds.has(serviceAreaId) ||
      utilityId == null ||
      !validUtilityIds.has(utilityId) ||
      energyProviderId == null ||
      !validManagedItemIds.has(energyProviderId) ||
      energyTypeId == null ||
      !validManagedItemIds.has(energyTypeId) ||
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
      energy_provider_id: energyProviderId,
      energy_type_id: energyTypeId,
      energy_source_id: energySourceId,
      agg_level_id: aggLevelId,
      updated_at: er.updated_at ? new Date(er.updated_at) : new Date(),
      updated_by_id: null,
    });
  }

  try {
    if (validatedEnergyResources.length > 0) {
      await db.insert(energyResources).values(validatedEnergyResources);
        inserted += validatedEnergyResources.length;
    }

    if (skippedInvalidForeignKeys > 0) {
      console.warn(
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
  let inserted = 0;
  let updated = 0;

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
        id: energyResources.id,
        utilityId: energyResources.utility_id,
        periodEntries: energyResources.period_entries,
      })
      .from(energyResources);

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
          .update(energyResources)
          .set({ period_entries: nextEntries })
          .where(eq(energyResources.id, resource.id));
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
  let inserted = 0;
  let updated = 0;
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
  energy_resource_id: number | null;
  service_area_id: number | null;
  input_def_id: number;
  input_def_legacy_id?: string | null;
  input_def_name?: string | null;
  input_def_variable_name?: string | null;
  value: string | null;
  comments: string | null;
  update_medium_id: number | null;
  status_legacy_id: number | null;
  data_not_available: boolean;
  is_relevant: boolean | null;
  is_deleted: boolean;
  energy_provider_id: number | null;
  energy_source_id: number | null;
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
};

export type DataEntryBreakdownFilterOptions = {
  utilities: Array<{ id: number; name: string }>;
  reportPeriods: Array<{ id: number; label: string }>;
  categories: Array<{ id: number; name: string }>;
  subcategories: Array<{ id: number; name: string }>;
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

const getActivePeriodIds = (
  periodEntries: EnergyResourcePeriodEntry[] | null | undefined,
): Set<number> => {
  const ids = new Set<number>();
  if (!Array.isArray(periodEntries)) return ids;

  for (const periodEntry of periodEntries) {
    if (periodEntry?.is_active !== true) continue;
    if (typeof periodEntry.report_period_id !== "number") continue;
    ids.add(Math.trunc(periodEntry.report_period_id));
  }

  return ids;
};

const mapStatus = (row: SourceDataEntryRow): DataEntryStatusId => {
  if (row.data_not_available) return DataEntryStatusId.Not_Available;
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
    input_def_id: number;
    service_area_id: number | null;
    energy_resource_id: number | null;
    energy_provider_id: number | null;
    energy_source_id: number | null;
    customer_type_id: number | null;
    payment_mode_id: number | null;
  },
): string => {
  return [
    reportPeriodId,
    entry.input_def_id,
    nullableKeyPart(entry.service_area_id),
    nullableKeyPart(entry.energy_resource_id),
    nullableKeyPart(entry.energy_provider_id),
    nullableKeyPart(entry.energy_source_id),
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
      id: inputDefinitions.id,
      categoryId: inputDefinitions.category_id,
      subcategoryId: inputDefinitions.subcategory_id,
    })
    .from(inputDefinitions);

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
      input_def_id: dataEntries.input_def_id,
      service_area_id: dataEntries.service_area_id,
      energy_resource_id: dataEntries.energy_resource_id,
      energy_provider_id: dataEntries.energy_provider_id,
      energy_source_id: dataEntries.energy_source_id,
      customer_type_id: dataEntries.customer_type_id,
      payment_mode_id: dataEntries.payment_mode_id,
      value: dataEntries.value,
      comments: dataEntries.comments,
      update_medium_id: dataEntries.update_medium_id,
      status_id: dataEntries.status_id,
      is_relevant: dataEntries.is_relevant,
      is_deleted: dataEntries.is_deleted,
    })
    .from(dataEntries)
    .where(inArray(dataEntries.input_def_id, utilityContextInputIds));

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
        input_def_id: sourceEntry.input_def_id,
        service_area_id: sourceEntry.service_area_id,
        energy_resource_id: sourceEntry.energy_resource_id,
        energy_provider_id: sourceEntry.energy_provider_id,
        energy_source_id: sourceEntry.energy_source_id,
        customer_type_id: sourceEntry.customer_type_id,
        payment_mode_id: sourceEntry.payment_mode_id,
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
      id: inputDefinitions.id,
      categoryId: inputDefinitions.category_id,
      subcategoryId: inputDefinitions.subcategory_id,
    })
    .from(inputDefinitions);

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
      input_def_id: dataEntries.input_def_id,
      service_area_id: dataEntries.service_area_id,
      energy_resource_id: dataEntries.energy_resource_id,
      energy_provider_id: dataEntries.energy_provider_id,
      energy_source_id: dataEntries.energy_source_id,
      customer_type_id: dataEntries.customer_type_id,
      payment_mode_id: dataEntries.payment_mode_id,
      value: dataEntries.value,
      comments: dataEntries.comments,
      update_medium_id: dataEntries.update_medium_id,
      status_id: dataEntries.status_id,
      is_relevant: dataEntries.is_relevant,
      is_deleted: dataEntries.is_deleted,
    })
    .from(dataEntries)
    .where(inArray(dataEntries.input_def_id, countryContextInputIds));

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
        input_def_id: sourceEntry.input_def_id,
        service_area_id: sourceEntry.service_area_id,
        energy_resource_id: sourceEntry.energy_resource_id,
        energy_provider_id: sourceEntry.energy_provider_id,
        energy_source_id: sourceEntry.energy_source_id,
        customer_type_id: sourceEntry.customer_type_id,
        payment_mode_id: sourceEntry.payment_mode_id,
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

  const skippedSamples: Array<{
    sourceId: number | null;
    reason: string;
    reportPeriodId: number | null;
    inputDefId: number | null;
    sourceInputDefId: number | null;
  }> = [];

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
      inputDefId: inputDlDefMappings.input_def_id,
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
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      variableName: inputDefinitions.variable_name,
    })
    .from(inputDefinitions);

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
      id: energyResources.id,
      periodEntries: energyResources.period_entries,
    })
    .from(energyResources);
  const targetEnergyResourceIds = new Set<number>(
    targetEnergyResources.map((r) => r.id),
  );
  const targetEnergyResourceActivePeriodIds = new Map<number, Set<number>>(
    targetEnergyResources.map((resource) => [
      resource.id,
      getActivePeriodIds(resource.periodEntries),
    ]),
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
    while (hasMore) {
      const params = new URLSearchParams();
      params.set("includeDeleted", "1");
      params.set("limit", String(resolveDataEntryPageLimit()));

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

      for (const row of page.dataEntry) {
        const reportPeriodId = normalizeRequiredId(row.report_period_id);
        let inputDefId: number | null = null;

        const sourceTrainingDlDefId = toNumberOrNull(row.input_def_id);
        if (sourceTrainingDlDefId != null) {
          const mapped = inputByTrainingDlDefId.get(sourceTrainingDlDefId);
          if (mapped) {
            inputDefId = mapped.inputDefId;
          }
        }

        if (inputDefId == null) {
          inputDefId = normalizeRequiredId(row.input_def_id);
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
        const rawEnergyResourceId = normalizeOptionalId(row.energy_resource_id);
        const rawEnergyProviderId = normalizeOptionalId(row.energy_provider_id);
        const rawEnergySourceId = normalizeOptionalId(row.energy_source_id);
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
        const isEnergyResourceActiveForReportPeriod =
          energyResourceId != null &&
          targetEnergyResourceActivePeriodIds
            .get(energyResourceId)
            ?.has(reportPeriodId) === true;
        const scopedEnergyResourceId = isEnergyResourceActiveForReportPeriod
          ? energyResourceId
          : null;
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
        const updateMediumId = normalizeOptionalFkId(
          rawUpdateMediumId,
          targetManagedListItemIds,
        );

        const updatedAt = row.updated_at
          ? new Date(row.updated_at)
          : new Date();
        const comments = toStructuredComments(row.comments, updatedAt);

        const conditions = [
          eq(dataEntries.report_period_id, reportPeriodId),
          eq(dataEntries.input_def_id, inputDefId),
          serviceAreaId == null
            ? isNull(dataEntries.service_area_id)
            : eq(dataEntries.service_area_id, serviceAreaId),
          scopedEnergyResourceId == null
            ? isNull(dataEntries.energy_resource_id)
            : eq(dataEntries.energy_resource_id, scopedEnergyResourceId),
          energyProviderId == null
            ? isNull(dataEntries.energy_provider_id)
            : eq(dataEntries.energy_provider_id, energyProviderId),
          energySourceId == null
            ? isNull(dataEntries.energy_source_id)
            : eq(dataEntries.energy_source_id, energySourceId),
          customerTypeId == null
            ? isNull(dataEntries.customer_type_id)
            : eq(dataEntries.customer_type_id, customerTypeId),
          paymentModeId == null
            ? isNull(dataEntries.payment_mode_id)
            : eq(dataEntries.payment_mode_id, paymentModeId),
        ];

        const payload = {
          report_period_id: reportPeriodId,
          input_def_id: inputDefId,
          service_area_id: serviceAreaId,
          energy_resource_id: scopedEnergyResourceId,
          energy_provider_id: energyProviderId,
          energy_source_id: energySourceId,
          customer_type_id: customerTypeId,
          payment_mode_id: paymentModeId,
          value: row.value,
          comments,
          update_medium_id: updateMediumId,
          status_id: mapStatus(row),
          is_relevant: row.is_relevant ?? true,
          is_deleted: row.is_deleted ?? false,
          updatedAt,
          updatedById: null,
        };

        const [existing] = await db
          .select({ id: dataEntries.id })
          .from(dataEntries)
          .where(and(...conditions))
          .limit(1);

        if (existing) {
          await db
            .update(dataEntries)
            .set(payload)
            .where(eq(dataEntries.id, existing.id));
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
              eq(dataEntries.input_def_id, inputDefId),
              serviceAreaId == null
                ? isNull(dataEntries.service_area_id)
                : eq(dataEntries.service_area_id, serviceAreaId),
              scopedEnergyResourceId == null
                ? isNull(dataEntries.energy_resource_id)
                : eq(dataEntries.energy_resource_id, scopedEnergyResourceId),
              energyProviderId == null
                ? isNull(dataEntries.energy_provider_id)
                : eq(dataEntries.energy_provider_id, energyProviderId),
              energySourceId == null
                ? isNull(dataEntries.energy_source_id)
                : eq(dataEntries.energy_source_id, energySourceId),
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

          }
        }
      }

      cursor = page.pagination.nextCursor;
      hasMore = page.pagination.hasMore === true && cursor != null;
    }

    await backfillUtilityContextDataEntriesFromPreviousPeriods({
      reportPeriodId: options?.reportPeriodId,
    });

  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");
  return { ok: true, inserted, updated, total: inserted + updated };
}

type SourceGenerationRelevanceRow = {
  source_id?: number;
  utility_id?: number | null;
  report_period_id?: number | null;
  service_area_id?: number | null;
  training_dl_def_id?: number | string | null;
  energy_provider_id?: number | null;
  energy_source_id?: number | null;
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

export async function retrieveGenerationRelevance(options?: {
  reportPeriodId?: number;
  batchSize?: number;
}) {
  await assertDevMigrationAccess();
  let cursor: number | null = null;
  let hasMore = true;

  const batchSize = Math.max(1, Math.min(2000, options?.batchSize ?? 2000));

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const loopStartedAt = Date.now();
  const LOOP_MAX_MS = 50_000;

  const mappingRows = await db
    .select({
      trainingDlDefId: inputDlDefMappings.training_dl_def_id,
      inputDefId: inputDlDefMappings.input_def_id,
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
        const reportPeriodId = toNumberOrNull(row.report_period_id);
        const serviceAreaId = toNumberOrNull(row.service_area_id);
        const sourceTrainingDlDefId = toNumberOrNull(row.training_dl_def_id);
        const energyProviderId = toNumberOrNull(row.energy_provider_id);
        const energySourceId = toNumberOrNull(row.energy_source_id);

        if (
          reportPeriodId == null ||
          serviceAreaId == null ||
          sourceTrainingDlDefId == null ||
          energyProviderId == null ||
          energySourceId == null
        ) {
          skipped += 1;
          continue;
        }

        if (
          !targetReportPeriodIds.has(reportPeriodId) ||
          !targetServiceAreaIds.has(serviceAreaId) ||
          !targetManagedListItemIds.has(energyProviderId) ||
          !targetManagedListItemIds.has(energySourceId)
        ) {
          skipped += 1;
          continue;
        }

        const mappedInput = inputByTrainingDlDefId.get(sourceTrainingDlDefId);
        const inputDefId = mappedInput?.inputDefId ?? null;

        if (inputDefId == null) {
          skipped += 1;
          continue;
        }

        const updatedAt = row.updated_at
          ? new Date(row.updated_at)
          : new Date();

        const [existing] = await db
          .select({ id: generationRelevance.id })
          .from(generationRelevance)
          .where(
            and(
              eq(generationRelevance.report_period_id, reportPeriodId),
              eq(generationRelevance.service_area_id, serviceAreaId),
              eq(generationRelevance.input_def_id, inputDefId),
              eq(generationRelevance.energy_provider_id, energyProviderId),
              eq(generationRelevance.energy_source_id, energySourceId),
              isNull(generationRelevance.energy_resource_type_id),
            ),
          )
          .limit(1);

        const payload = {
          report_period_id: reportPeriodId,
          service_area_id: serviceAreaId,
          input_def_id: inputDefId,
          energy_provider_id: energyProviderId,
          energy_source_id: energySourceId,
          energy_resource_type_id: null,
          is_relevant: row.is_relevant ?? true,
          is_deleted: row.is_deleted ?? false,
          updatedAt,
          updatedById: null,
        };

        if (existing) {
          await db
            .update(generationRelevance)
            .set(payload)
            .where(eq(generationRelevance.id, existing.id));
          updated += 1;
        } else {
          await db.insert(generationRelevance).values(payload);
        inserted += 1;
          inserted += 1;
        }
      }

      cursor = page.pagination.nextCursor;
      hasMore = page.pagination.hasMore === true && cursor != null;

      if (hasMore && Date.now() - loopStartedAt > LOOP_MAX_MS) {
        console.warn(
          `[migration] retrieveGenerationRelevance time budget exhausted after ${inserted + updated} ops ` +
          `(inserted=${inserted}, updated=${updated}, skipped=${skipped}), ` +
          `deferring remaining pages (next cursor: ${cursor}). Re-run to continue.`,
        );
        break;
      }
    }

  } catch (error: unknown) {
    logMigrationError(error);
  }

  revalidatePath("/migration");
  revalidatePath("/settings/relevance");
  revalidatePath("/data-entry");

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveTransmissionRelevance(options?: {
  reportPeriodId?: number;
  batchSize?: number;
}) {
  await assertDevMigrationAccess();
  let inserted = 0;
  let updated = 0;
  let cursor: number | null = null;
  let hasMore = true;

  const batchSize = Math.max(1, Math.min(2000, options?.batchSize ?? 500));

  const mappingRows = await db
    .select({
      trainingDlDefId: inputDlDefMappings.training_dl_def_id,
      inputDefId: inputDlDefMappings.input_def_id,
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
          .select({ id: dataEntries.id })
          .from(dataEntries)
          .where(
            and(
              eq(dataEntries.report_period_id, reportPeriodId),
              eq(dataEntries.service_area_id, serviceAreaId),
              eq(dataEntries.input_def_id, inputDefId),
              isNull(dataEntries.energy_resource_id),
              isNull(dataEntries.energy_provider_id),
              isNull(dataEntries.energy_source_id),
              isNull(dataEntries.payment_mode_id),
              isNull(dataEntries.customer_type_id),
            ),
          )
          .orderBy(desc(dataEntries.updatedAt))
          .limit(1);

        const updatedAt = row.updated_at
          ? new Date(row.updated_at)
          : new Date();

        if (existing) {
          await db
            .update(dataEntries)
            .set({
              is_relevant: row.is_relevant ?? true,
              is_deleted: row.is_deleted ?? false,
              updatedAt,
              updatedById: null,
            })
            .where(eq(dataEntries.id, existing.id));
          continue;
        }

        await db.insert(dataEntries).values({
          report_period_id: reportPeriodId,
          service_area_id: serviceAreaId,
          input_def_id: inputDefId,
          energy_resource_id: null,
          energy_provider_id: null,
          energy_source_id: null,
          payment_mode_id: null,
          customer_type_id: null,
          value: null,
          comments: null,
          status_id: DataEntryStatusId.Entered,
          is_relevant: row.is_relevant ?? true,
          is_deleted: row.is_deleted ?? false,
          updatedAt,
          updatedById: null,
        });
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

  return { ok: true, inserted, updated, total: inserted + updated };
}

export async function retrieveTariffRelevance(options?: {
  reportPeriodId?: number;
  batchSize?: number;
}) {
  await assertDevMigrationAccess();

  let inserted = 0;
  let updated = 0;
  let cursor: number | null = null;
  let hasMore = true;

  const batchSize = Math.max(1, Math.min(2000, options?.batchSize ?? 500));

  const mappingRows = await db
    .select({
      trainingDlDefId: inputDlDefMappings.training_dl_def_id,
      inputDefId: inputDlDefMappings.input_def_id,
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
          .select({ id: dataEntries.id })
          .from(dataEntries)
          .where(
            and(
              eq(dataEntries.report_period_id, reportPeriodId),
              eq(dataEntries.service_area_id, serviceAreaId),
              eq(dataEntries.input_def_id, inputDefId),
              eq(dataEntries.payment_mode_id, paymentModeId),
              eq(dataEntries.customer_type_id, customerTypeId),
              isNull(dataEntries.energy_resource_id),
              isNull(dataEntries.energy_provider_id),
              isNull(dataEntries.energy_source_id),
            ),
          )
          .orderBy(desc(dataEntries.updatedAt))
          .limit(1);

        const updatedAt = row.updated_at
          ? new Date(row.updated_at)
          : new Date();

        if (existing) {
          await db
            .update(dataEntries)
            .set({
              is_relevant: row.is_relevant ?? true,
              is_deleted: row.is_deleted ?? false,
              updatedAt,
              updatedById: null,
            })
            .where(eq(dataEntries.id, existing.id));
          continue;
        }

        await db.insert(dataEntries).values({
          report_period_id: reportPeriodId,
          service_area_id: serviceAreaId,
          input_def_id: inputDefId,
          energy_resource_id: null,
          energy_provider_id: null,
          energy_source_id: null,
          payment_mode_id: paymentModeId,
          customer_type_id: customerTypeId,
          value: null,
          comments: null,
          status_id: DataEntryStatusId.Entered,
          is_relevant: row.is_relevant ?? true,
          is_deleted: row.is_deleted ?? false,
          updatedAt,
          updatedById: null,
        });
      }

      cursor = page.pagination.nextCursor;
      hasMore = page.pagination.hasMore === true && cursor != null;
    }

  } catch (error: unknown) {
    console.error(
      "[migration:tariffRelevance] ERROR:",
      error instanceof Error
        ? {
            message: error.message,
            stack: error.stack,
          }
        : error,
    );
    logMigrationError(error);
  }

  revalidatePath("/migration");
  revalidatePath("/settings/relevance");
  revalidatePath("/data-entry");

  return { ok: true, inserted, updated, total: inserted + updated };
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
  input_def_id: number;
  service_area_id: number | null;
  energy_resource_id: number | null;
  energy_provider_id: number | null;
  energy_source_id: number | null;
  customer_type_id: number | null;
  payment_mode_id: number | null;
}): string => {
  return [
    entry.report_period_id,
    entry.input_def_id,
    nullableKeyPart(entry.service_area_id),
    nullableKeyPart(entry.energy_resource_id),
    nullableKeyPart(entry.energy_provider_id),
    nullableKeyPart(entry.energy_source_id),
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
    input_def_id: Number(inputDef),
    service_area_id: parseNullableId(serviceArea),
    energy_resource_id: parseNullableId(energyResource),
    energy_provider_id: parseNullableId(energyProvider),
    energy_source_id: parseNullableId(energySource),
    customer_type_id: parseNullableId(customerType),
    payment_mode_id: parseNullableId(paymentMode),
  };
};

const buildReportPeriodLabel = (reportDate: Date, reportTypeName?: string | null): string => {
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
    .leftJoin(managedListItems, eq(reportPeriods.report_type_id, managedListItems.id));

  const inputDefList = await db
    .select({
      categoryId: inputDefinitions.category_id,
      subcategoryId: inputDefinitions.subcategory_id,
    })
    .from(inputDefinitions);

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
      inputDefConditions.push(eq(inputDefinitions.category_id, categoryId));
    }
    if (subcategoryId != null) {
      inputDefConditions.push(
        eq(inputDefinitions.subcategory_id, subcategoryId),
      );
    }

    const defs = await db
      .select({ id: inputDefinitions.id })
      .from(inputDefinitions)
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
        ? eq(dataEntries.input_def_id, scopedInputDefIds[0])
        : inArray(dataEntries.input_def_id, scopedInputDefIds),
    );
  }

  const targetRowsQuery = db
    .select({
      report_period_id: dataEntries.report_period_id,
      input_def_id: dataEntries.input_def_id,
      service_area_id: dataEntries.service_area_id,
      energy_resource_id: dataEntries.energy_resource_id,
      energy_provider_id: dataEntries.energy_provider_id,
      energy_source_id: dataEntries.energy_source_id,
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
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      variableName: inputDefinitions.variable_name,
    })
    .from(inputDefinitions);

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

  const sourceByKey = new Map<
    string,
    {
      report_period_id: number;
      input_def_id: number;
      service_area_id: number | null;
      energy_resource_id: number | null;
      energy_provider_id: number | null;
      energy_source_id: number | null;
      customer_type_id: number | null;
      payment_mode_id: number | null;
    }
  >();

  for (const row of boundedSourceRows) {
    const normalizedReportPeriodId = normalizeRequiredId(row.report_period_id);
    let normalizedInputDefId = normalizeRequiredId(row.input_def_id);

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

    const normalized = {
      report_period_id: normalizedReportPeriodId,
      input_def_id: normalizedInputDefId,
      service_area_id: normalizeOptionalId(row.service_area_id),
      energy_resource_id: normalizeOptionalId(row.energy_resource_id),
      energy_provider_id: normalizeOptionalId(row.energy_provider_id),
      energy_source_id: normalizeOptionalId(row.energy_source_id),
      customer_type_id: normalizeOptionalId(row.customer_type_id),
      payment_mode_id: normalizeOptionalId(row.payment_mode_id),
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
      input_def_id: number;
      service_area_id: number | null;
      energy_resource_id: number | null;
      energy_provider_id: number | null;
      energy_source_id: number | null;
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
        .map((key) => parseDataEntryComparisonKey(key).input_def_id)
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
        .map((key) => parseDataEntryComparisonKey(key).energy_resource_id)
        .filter((id): id is number => id != null),
    ),
  );
  const managedListIds = Array.from(
    new Set(
      Array.from(unionKeys)
        .flatMap((key) => {
          const parsed = parseDataEntryComparisonKey(key);
          return [
            parsed.energy_provider_id,
            parsed.energy_source_id,
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
          .leftJoin(managedListItems, eq(reportPeriods.report_type_id, managedListItems.id))
          .where(inArray(reportPeriods.id, reportPeriodIds));

  const inputDefList =
    inputDefIds.length === 0
      ? []
      : await db
          .select({
            id: inputDefinitions.id,
            name: inputDefinitions.name,
            categoryId: inputDefinitions.category_id,
            subcategoryId: inputDefinitions.subcategory_id,
          })
          .from(inputDefinitions)
          .where(inArray(inputDefinitions.id, inputDefIds));

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
          .select({ id: energyResources.id, name: energyResources.name })
          .from(energyResources)
          .where(inArray(energyResources.id, energyResourceIds));

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
    const inputDef = inputDefById.get(parsed.input_def_id);

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
      inputDefId: parsed.input_def_id,
      inputDefName: inputDef?.name ?? String(parsed.input_def_id),
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
      energyResourceId: parsed.energy_resource_id,
      energyResourceName:
        parsed.energy_resource_id != null
          ? (energyResourceNameById.get(parsed.energy_resource_id) ??
            String(parsed.energy_resource_id))
          : "-",
      energyProviderId: parsed.energy_provider_id,
      energyProviderName:
        parsed.energy_provider_id != null
          ? (managedListNameById.get(parsed.energy_provider_id) ??
            String(parsed.energy_provider_id))
          : "-",
      energySourceId: parsed.energy_source_id,
      energySourceName:
        parsed.energy_source_id != null
          ? (managedListNameById.get(parsed.energy_source_id) ??
            String(parsed.energy_source_id))
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
        categoryId: inputDefinitions.category_id,
        subcategoryId: inputDefinitions.subcategory_id,
      })
      .from(inputDefinitions),
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
    reportPeriods: await fetchReportPeriodOptions(),
    categories: categoryItems
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    subcategories: subcategoryItems
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

async function fetchReportPeriodOptions(): Promise<Array<{ id: number; label: string }>> {
  const rows = await db
    .select({
      id: reportPeriods.id,
      reportDate: reportPeriods.report_date,
      typeName: managedListItems.name,
    })
    .from(reportPeriods)
    .leftJoin(managedListItems, eq(reportPeriods.report_type_id, managedListItems.id))
    .orderBy(desc(reportPeriods.report_date));

  return rows.map((r) => ({
    id: r.id,
    label: formatReportPeriodDisplay(r.reportDate, r.typeName),
  }));
}

export async function getDataEntryBreakdown(
  utilityId: number | null,
  reportPeriodId: number | null,
  categoryId: number | null,
  subcategoryId: number | null,
): Promise<DataEntryBreakdownRow[]> {
  await assertDevMigrationAccess();

  const [v1Rows, v2Rows, v1FilterNames] = await Promise.all([
    fetchV1Breakdown(),
    queryV2Breakdown(utilityId, reportPeriodId, categoryId, subcategoryId),
    resolveBreakdownFilterNames(utilityId, categoryId, subcategoryId),
  ]);

  const key = (r: { utilityName: string; categoryName: string; subcategoryName: string }) =>
    `${r.utilityName}||${r.categoryName}||${r.subcategoryName}`;

  const v1Map = new Map<string, number>();
  for (const r of v1Rows) {
    if (v1FilterNames) {
      if (v1FilterNames.utilityName && r.utilityName !== v1FilterNames.utilityName) continue;
      if (v1FilterNames.categoryName && r.categoryName !== v1FilterNames.categoryName) continue;
      if (v1FilterNames.subcategoryName && r.subcategoryName !== v1FilterNames.subcategoryName) continue;
    }
    const k = key(r);
    v1Map.set(k, (v1Map.get(k) ?? 0) + r.entryCount);
  }

  const v2Map = new Map<string, number>();
  for (const r of v2Rows) {
    v2Map.set(key(r), r.entryCount);
  }

  const allKeys = new Set([...v1Map.keys(), ...v2Map.keys()]);

  const merged: DataEntryBreakdownRow[] = [];
  let syntheticId = 0;

  for (const k of allKeys) {
    const [utilityName, categoryName, subcategoryName] = k.split("||");
    merged.push({
      utilityId: syntheticId,
      utilityName,
      categoryId: syntheticId,
      categoryName,
      subcategoryId: syntheticId,
      subcategoryName,
      v1Count: v1Map.get(k) ?? 0,
      v2Count: v2Map.get(k) ?? 0,
    });
    syntheticId++;
  }

  merged.sort((a, b) => {
    const u = a.utilityName.localeCompare(b.utilityName);
    if (u !== 0) return u;
    const c = a.categoryName.localeCompare(b.categoryName);
    if (c !== 0) return c;
    return a.subcategoryName.localeCompare(b.subcategoryName);
  });

  return merged;
}

type BreakdownFilterNames = {
  utilityName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
};

async function resolveBreakdownFilterNames(
  utilityId: number | null,
  categoryId: number | null,
  subcategoryId: number | null,
): Promise<BreakdownFilterNames | null> {
  if (utilityId == null && categoryId == null && subcategoryId == null) return null;

  const [utilityName, categoryName, subcategoryName] = await Promise.all([
    utilityId != null
      ? db
          .select({ name: organisations.name })
          .from(organisations)
          .where(eq(organisations.id, utilityId))
          .limit(1)
          .then((r) => r[0]?.name ?? null)
      : null,
    categoryId != null
      ? db
          .select({ name: managedListItems.name })
          .from(managedListItems)
          .where(eq(managedListItems.id, categoryId))
          .limit(1)
          .then((r) => r[0]?.name ?? null)
      : null,
    subcategoryId != null
      ? db
          .select({ name: managedListItems.name })
          .from(managedListItems)
          .where(eq(managedListItems.id, subcategoryId))
          .limit(1)
          .then((r) => r[0]?.name ?? null)
      : null,
  ]);

  return { utilityName, categoryName, subcategoryName };
}

type V1BreakdownRow = {
  utilityName: string;
  categoryName: string;
  subcategoryName: string;
  entryCount: number;
};

async function fetchV1Breakdown(): Promise<V1BreakdownRow[]> {
  try {
    const response = await fetchMigrationEndpoint("/breakdown");
    const data = await response.json();
    const rows = (data as { rows?: V1BreakdownRow[] })?.rows;
    if (!Array.isArray(rows)) {
      console.error("[breakdown] v1 response missing rows array", typeof data);
      return [];
    }
    return rows;
  } catch (error) {
    console.error("[breakdown] v1 fetch failed", error);
    return [];
  }
}

type V2BreakdownRow = {
  utilityId: number;
  utilityName: string;
  categoryId: number;
  categoryName: string;
  subcategoryId: number;
  subcategoryName: string;
  entryCount: number;
};

async function queryV2Breakdown(
  utilityId: number | null,
  reportPeriodId: number | null,
  categoryId: number | null,
  subcategoryId: number | null,
): Promise<V2BreakdownRow[]> {
  const catAlias = aliasedTable(managedListItems, "cat");
  const subAlias = aliasedTable(managedListItems, "sub");

  const conditions = [
    eq(organisations.is_utility, true),
    eq(dataEntries.is_deleted, false),
  ];
  if (utilityId != null) conditions.push(eq(organisations.id, utilityId));
  if (reportPeriodId != null) conditions.push(eq(reportPeriods.id, reportPeriodId));
  if (categoryId != null) conditions.push(eq(inputDefinitions.category_id, categoryId));
  if (subcategoryId != null) conditions.push(eq(inputDefinitions.subcategory_id, subcategoryId));

  const rows = await db
    .select({
      utilityId: organisations.id,
      utilityName: organisations.name,
      categoryId: catAlias.id,
      categoryName: catAlias.name,
      subcategoryId: subAlias.id,
      subcategoryName: subAlias.name,
      entryCount: count(dataEntries.id),
    })
    .from(dataEntries)
    .innerJoin(reportPeriods, eq(dataEntries.report_period_id, reportPeriods.id))
    .innerJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .innerJoin(inputDefinitions, eq(dataEntries.input_def_id, inputDefinitions.id))
    .innerJoin(catAlias, eq(inputDefinitions.category_id, catAlias.id))
    .innerJoin(subAlias, eq(inputDefinitions.subcategory_id, subAlias.id))
    .where(and(...conditions))
    .groupBy(
      organisations.id,
      organisations.name,
      catAlias.id,
      catAlias.name,
      subAlias.id,
      subAlias.name,
    )
    .orderBy(organisations.name, catAlias.name, subAlias.name);

  return rows.map((r) => ({
    utilityId: r.utilityId,
    utilityName: r.utilityName,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    subcategoryId: r.subcategoryId,
    subcategoryName: r.subcategoryName,
    entryCount: Number(r.entryCount),
  }));
}
