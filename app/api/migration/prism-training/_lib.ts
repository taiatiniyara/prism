import { headers } from "next/headers";
import { db } from "@/db/connection";
import { roles, user } from "@/db/schema/auth-schema";
import { countries, subRegions } from "@/db/schema/country";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { kpiDefinitions } from "@/db/schema/kpi";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import {
  energyResources,
  organisations,
  serviceAreas,
} from "@/db/schema/utility";

export const SUPPORTED_TABLES = [
  "roles",
  "users",
  "managed_lists",
  "managed_list_items",
  "sub_regions",
  "countries",
  "organisations",
  "service_areas",
  "report_periods",
  "energy_resources",
  "input_definitions",
  "kpi_definitions",
  "data_entries",
] as const;

export type SupportedTable = (typeof SUPPORTED_TABLES)[number];

export type MigrationTableResponse = {
  table: SupportedTable;
  count: number;
  limit: number;
  offset: number;
  rows: unknown[];
};

const MAX_LIMIT = 50000;
const DEFAULT_LIMIT = 10000;

export const parseLimit = (raw: string | null) => {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(parsed)), MAX_LIMIT);
};

export const parseOffset = (raw: string | null) => {
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
};

export const assertMigrationKey = (request: Request) => {
  const required = process.env.PRISM_TRAINING_MIGRATION_KEY ?? process.env.MIGRATION_API_KEY;
  if (!required) {
    throw new Error("MIGRATION_API_KEY is not configured on this server.");
  }
  const provided = request.headers.get("x-migration-key") ?? "";
  if (provided !== required) {
    throw new Error("Unauthorized");
  }
};

export const assertMigrationKeyAsync = async () => {
  const required = process.env.PRISM_TRAINING_MIGRATION_KEY ?? process.env.MIGRATION_API_KEY;
  if (!required) {
    throw new Error("MIGRATION_API_KEY is not configured on this server.");
  }
  const hdrs = await headers();
  const provided = hdrs.get("x-migration-key") ?? "";
  if (provided !== required) {
    throw new Error("Unauthorized");
  }
};

const getRows = async (
  table: SupportedTable,
  limit: number,
  offset: number,
): Promise<unknown[]> => {
  if (table === "roles") {
    return db.select().from(roles).limit(limit).offset(offset);
  }

  if (table === "users") {
    return db.select().from(user).limit(limit).offset(offset);
  }

  if (table === "managed_lists") {
    return db.select().from(managedLists).limit(limit).offset(offset);
  }

  if (table === "managed_list_items") {
    return db.select().from(managedListItems).limit(limit).offset(offset);
  }

  if (table === "sub_regions") {
    return db.select().from(subRegions).limit(limit).offset(offset);
  }

  if (table === "countries") {
    return db.select().from(countries).limit(limit).offset(offset);
  }

  if (table === "organisations") {
    return db.select().from(organisations).limit(limit).offset(offset);
  }

  if (table === "service_areas") {
    return db.select().from(serviceAreas).limit(limit).offset(offset);
  }

  if (table === "report_periods") {
    return db.select().from(reportPeriods).limit(limit).offset(offset);
  }

  if (table === "energy_resources") {
    return db.select().from(energyResources).limit(limit).offset(offset);
  }

  if (table === "input_definitions") {
    return db.select().from(inputDefinitions).limit(limit).offset(offset);
  }

  if (table === "kpi_definitions") {
    return db.select().from(kpiDefinitions).limit(limit).offset(offset);
  }

  return db.select().from(dataEntries).limit(limit).offset(offset);
};

export const fetchTable = async (
  table: SupportedTable,
  limit: number,
  offset: number,
): Promise<MigrationTableResponse> => {
  const rows = await getRows(table, limit, offset);
  return {
    table,
    count: rows.length,
    limit,
    offset,
    rows,
  };
};

export const normalizeTables = (rawTables: string[]): SupportedTable[] => {
  const normalized = rawTables
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value): value is SupportedTable =>
      SUPPORTED_TABLES.includes(value as SupportedTable),
    );

  return Array.from(new Set(normalized));
};
