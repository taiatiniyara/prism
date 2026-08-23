import { db } from "@/db/connection";
import { logger } from "@/lib/logging/logger";
import {
  organisations,
  serviceAreas,
  units,
  type UnitPeriodEntry,
} from "@/db/schema/utility";
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { eq, notInArray } from "drizzle-orm";

export type GeneratorSyncResult = {
  ok: boolean;
  inserted: number;
  updated: number;
  deleted: number;
  total: number;
  skippedInvalidForeignKeys: number;
};

const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
} as const;

const migrationApiKey = (
  process.env.PRISM_TRAINING_MIGRATION_KEY ?? process.env.MIGRATION_API_KEY
)?.trim();

const normalizeBaseUrl = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const toMigrationBaseUrl = (value: string): string => {
  const normalized = normalizeBaseUrl(value);
  if (normalized.toLowerCase().endsWith("/api/migration")) return normalized;
  if (normalized.toLowerCase().endsWith("/api/mig")) {
    return `${normalized.slice(0, -4)}/migration`;
  }
  if (normalized.toLowerCase().endsWith("/api")) {
    return `${normalized}/migration`;
  }
  return `${normalized}/api/migration`;
};

const toLegacyMigBaseUrl = (value: string): string => {
  const normalized = normalizeBaseUrl(value);
  if (normalized.toLowerCase().endsWith("/api/mig")) return normalized;
  if (normalized.toLowerCase().endsWith("/api/migration")) {
    return `${normalized.slice(0, -10)}/mig`;
  }
  if (normalized.toLowerCase().endsWith("/api")) {
    return `${normalized}/mig`;
  }
  return `${normalized}/api/mig`;
};

const configuredTrainingBaseUrls = [
  process.env.PRISM_TRAINING_MIGRATION_URL,
  process.env.PRISM_TRAINING_API_BASE_URL,
].filter((url): url is string => Boolean(url && url.trim().length > 0));

const migrationBaseUrls = Array.from(
  new Set(
    [
      ...configuredTrainingBaseUrls,
      "http://localhost:36197/api/migration",
      "http://localhost:3001/api/migration",
      "http://localhost:3000/api/migration",
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
      "http://localhost:36197/api/mig",
      "http://localhost:3001/api/mig",
      "http://localhost:3000/api/mig",
    ]
      .filter((url): url is string => Boolean(url && url.trim().length > 0))
      .map(toLegacyMigBaseUrl),
  ),
);

const GENERATOR_FETCH_TIMEOUT_MS = Number(
  process.env.MIGRATION_FETCH_TIMEOUT_MS ?? "60000",
);

const fetchGeneratorsFromTraining = async (): Promise<unknown[]> => {
  const headers: Record<string, string> = {
    ...JSON_HEADERS,
    ...(migrationApiKey ? { "x-migration-key": migrationApiKey } : {}),
  };

  const failures: string[] = [];

  for (const baseUrl of [...migrationBaseUrls, ...legacyMigBaseUrls]) {
    const requestUrl = `${baseUrl}/generators`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        GENERATOR_FETCH_TIMEOUT_MS,
      );

      const response = await fetch(requestUrl, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        failures.push(`${requestUrl} -> HTTP ${response.status}`);
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        failures.push(`${requestUrl} -> expected JSON, got ${contentType || "unknown"}`);
        continue;
      }

      return (await response.json()) as unknown[];
    } catch (error) {
      failures.push(
        `${requestUrl} -> ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(
    `Unable to reach generator migration endpoint. Tried: ${failures.join(" | ")}`,
  );
};

const PG_INT32_MIN = -2147483648;
const PG_INT32_MAX = 2147483647;

const isPgInt32 = (value: number): boolean =>
  Number.isInteger(value) && value >= PG_INT32_MIN && value <= PG_INT32_MAX;

const normalizeRequiredId = (
  value: number | null | undefined,
): number | null => {
  if (value == null) return null;
  const parsed = Math.trunc(value);
  return isPgInt32(parsed) ? parsed : null;
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

type SourcePeriodEntry = {
  utility_report_period_id?: number | null;
  report_period_id?: number | null;
  capacity_mw?: number | string | null;
  is_active?: boolean | null;
};

type SourceGenerator = {
  id: number;
  name?: string | null;
  service_area_id?: number | null;
  utility_id?: number | null;
  energy_provider_id?: number | null;
  energy_type_id?: number | null;
  energy_source_id?: number | null;
  energy_resource_type_id?: number | null;
  is_virtual?: boolean | null;
  agg_level_id?: number | null;
  updated_at?: string | Date | null;
  updated_by_id?: string | null;
  period_entries?: SourcePeriodEntry[] | null;
  report_period_id?: number | null;
  capacity_mw?: number | string | null;
  is_active?: boolean | null;
};

type NormalizedUnit = {
  id: number;
  name: string;
  service_area_id: number | null;
  utility_id: number | null;
  provider_id: number | null;
  technology_id: number | null;
  energyTypeId: number | null;
  energyResourceTypeId: number | null;
  is_virtual: boolean;
  updated_at: Date;
  period_entries: UnitPeriodEntry[];
};

type InsertUnit = {
  id: number;
  name: string;
  service_area_id: number;
  utility_id: number;
  provider_id: number;
  technology_id: number;
  category_id: number;
  asset_class_id: number;
  power_station_id: number | null;
  is_virtual: boolean;
  is_aggregated: boolean;
  period_entries: UnitPeriodEntry[];
  updated_at: Date;
  updated_by_id: string | null;
};

type MappedUnit = Omit<InsertUnit, "id" | "updated_at">;

const normalizePeriodEntries = (resource: SourceGenerator): UnitPeriodEntry[] => {
  const entries: UnitPeriodEntry[] = Array.isArray(resource.period_entries)
    ? resource.period_entries
        .map((entry) => {
          const reportPeriodId = normalizeRequiredId(
            entry?.utility_report_period_id ?? entry?.report_period_id,
          );
          if (reportPeriodId == null) return null;
          return {
            report_period_id: reportPeriodId,
            capacity_mw: toNumberOrNull(entry?.capacity_mw),
            is_active: entry?.is_active ?? true,
          };
        })
        .filter((entry): entry is UnitPeriodEntry => entry != null)
    : [];

  const flatReportPeriodId = normalizeRequiredId(resource.report_period_id);
  if (entries.length === 0 && flatReportPeriodId != null) {
    entries.push({
      report_period_id: flatReportPeriodId,
      capacity_mw: toNumberOrNull(resource.capacity_mw),
      is_active: resource.is_active ?? true,
    });
  }

  return entries;
};

export async function syncGenerators(): Promise<GeneratorSyncResult> {
  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  let skippedInvalidForeignKeys = 0;

  try {
    const list = (await fetchGeneratorsFromTraining()) as SourceGenerator[];

    const groupedUnits = new Map<number, NormalizedUnit>();

    for (const resource of list) {
      const id = normalizeRequiredId(resource.id);
      if (id == null) continue;

      const normalizedPeriodEntries = normalizePeriodEntries(resource);

      const existing = groupedUnits.get(id);
      if (!existing) {
        groupedUnits.set(id, {
          id,
          name: (resource.name ?? "").trim() || `Unit ${id}`,
          service_area_id: normalizeRequiredId(resource.service_area_id),
          utility_id: normalizeRequiredId(resource.utility_id),
          provider_id: normalizeRequiredId(resource.energy_provider_id),
          technology_id: normalizeRequiredId(resource.energy_source_id),
          energyTypeId: normalizeRequiredId(resource.energy_type_id),
          energyResourceTypeId: normalizeRequiredId(
            resource.energy_resource_type_id,
          ),
          is_virtual: resource.is_virtual ?? false,
          updated_at: resource.updated_at
            ? new Date(resource.updated_at)
            : new Date(),
          period_entries: normalizedPeriodEntries,
        });
        continue;
      }

      for (const entry of normalizedPeriodEntries) {
        const existingIndex = existing.period_entries.findIndex(
          (current) => current.report_period_id === entry.report_period_id,
        );

        if (existingIndex === -1) {
          existing.period_entries.push(entry);
        } else {
          const current = existing.period_entries[existingIndex];
          existing.period_entries[existingIndex] = {
            report_period_id: current.report_period_id,
            capacity_mw:
              current.capacity_mw != null ? current.capacity_mw : entry.capacity_mw,
            is_active: current.is_active || entry.is_active,
          };
        }
      }
    }

    const dedupedUnits = Array.from(groupedUnits.values());
    const sourceIds = new Set(dedupedUnits.map((unit) => unit.id));

    const reportPeriodRows = await db
      .select({ id: reportPeriods.id, utilityId: reportPeriods.utility_id })
      .from(reportPeriods);

    const utilityReportPeriodIds = new Map<number, number[]>();
    for (const rp of reportPeriodRows) {
      const existing = utilityReportPeriodIds.get(rp.utilityId) ?? [];
      existing.push(rp.id);
      utilityReportPeriodIds.set(rp.utilityId, existing);
    }

    for (const unit of dedupedUnits) {
      if (unit.utility_id == null) continue;
      const utilityPeriodIds =
        utilityReportPeriodIds.get(unit.utility_id) ?? [];
      const existingPeriodIds = new Set(
        unit.period_entries.map((entry) => entry.report_period_id),
      );

      for (const reportPeriodId of utilityPeriodIds) {
        if (existingPeriodIds.has(reportPeriodId)) continue;
        unit.period_entries.push({
          report_period_id: reportPeriodId,
          capacity_mw: null,
          is_active: false,
        });
      }

      unit.period_entries.sort(
        (a, b) => a.report_period_id - b.report_period_id,
      );
    }

    const existingUnits = await db.select({ id: units.id }).from(units);
    const existingIds = new Set(existingUnits.map((u) => u.id));

    const [serviceAreaRows, utilityRows, managedItemRows] = await Promise.all([
      db.select({ id: serviceAreas.id }).from(serviceAreas),
      db.select({ id: organisations.id }).from(organisations),
      db
        .select({
          id: managedListItems.id,
          parentId: managedListItems.parent_id,
        })
        .from(managedListItems),
    ]);

    const validServiceAreaIds = new Set(serviceAreaRows.map((row) => row.id));
    const validUtilityIds = new Set(utilityRows.map((row) => row.id));
    const validManagedItemIds = new Set(managedItemRows.map((row) => row.id));
    const parentById = new Map(
      managedItemRows.map((row) => [row.id, row.parentId]),
    );

    const validatedUnits: InsertUnit[] = [];
    const updateEntries: Array<{ id: number; data: MappedUnit }> = [];

    for (const unit of dedupedUnits) {
      const serviceAreaId = unit.service_area_id;
      const utilityId = unit.utility_id;
      const providerId = unit.provider_id;
      const technologyId = unit.technology_id;

      const hasInvalidForeignKey =
        serviceAreaId == null ||
        !validServiceAreaIds.has(serviceAreaId) ||
        utilityId == null ||
        !validUtilityIds.has(utilityId) ||
        providerId == null ||
        !validManagedItemIds.has(providerId) ||
        technologyId == null ||
        !validManagedItemIds.has(technologyId);

      const sourceCategoryId =
        unit.energyTypeId != null && validManagedItemIds.has(unit.energyTypeId)
          ? unit.energyTypeId
          : null;
      const fallbackCategoryId =
        technologyId != null ? (parentById.get(technologyId) ?? null) : null;
      const categoryId = sourceCategoryId ?? fallbackCategoryId;
      const sourceAssetClassId =
        unit.energyResourceTypeId != null &&
        validManagedItemIds.has(unit.energyResourceTypeId)
          ? unit.energyResourceTypeId
          : null;
      const assetClassId =
        sourceAssetClassId ??
        (categoryId != null ? (parentById.get(categoryId) ?? null) : null);

      if (
        hasInvalidForeignKey ||
        categoryId == null ||
        !validManagedItemIds.has(categoryId) ||
        assetClassId == null ||
        !validManagedItemIds.has(assetClassId)
      ) {
        skippedInvalidForeignKeys += 1;
        continue;
      }

      const mapped: MappedUnit = {
        name: unit.name,
        service_area_id: serviceAreaId,
        utility_id: utilityId,
        provider_id: providerId,
        technology_id: technologyId,
        category_id: categoryId,
        asset_class_id: assetClassId,
        power_station_id: null,
        is_virtual: unit.is_virtual,
        is_aggregated: false,
        period_entries: unit.period_entries,
        updated_by_id: null,
      };

      if (existingIds.has(unit.id)) {
        updateEntries.push({ id: unit.id, data: mapped });
      } else {
        validatedUnits.push({
          id: unit.id,
          ...mapped,
          updated_at: unit.updated_at,
        });
      }
    }

    if (validatedUnits.length > 0) {
      await db
        .insert(units)
        .values(validatedUnits as unknown as Array<typeof units.$inferInsert>);
      inserted += validatedUnits.length;
    }

    for (const entry of updateEntries) {
      await db.update(units).set(entry.data).where(eq(units.id, entry.id));
      updated += 1;
    }

    if (sourceIds.size > 0) {
      const removed = await db
        .delete(units)
        .where(notInArray(units.id, Array.from(sourceIds)))
        .returning({ id: units.id });
      deleted = removed.length;
      if (deleted > 0) {
        logger.warn(
          `[migration] syncGenerators deleted ${deleted} units absent from prism-training`,
        );
      }
    }

    if (skippedInvalidForeignKeys > 0) {
      logger.warn(
        `[migration] syncGenerators skipped ${skippedInvalidForeignKeys} rows with invalid foreign keys`,
      );
    }
  } catch (error) {
    logger.error("[migration] syncGenerators failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      inserted,
      updated,
      deleted,
      total: inserted + updated,
      skippedInvalidForeignKeys,
    };
  }

  return {
    ok: true,
    inserted,
    updated,
    deleted,
    total: inserted + updated,
    skippedInvalidForeignKeys,
  };
}
