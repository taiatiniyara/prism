import "dotenv/config";
import { db } from "@/db/connection";
import { roles, user, type UserStatus } from "@/db/schema/auth-schema";
import { organisations } from "@/db/schema/utility";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

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

const toUserStatus = (value: unknown): UserStatus => {
  if (value === "active" || value === "pending" || value === "deactivated") {
    return value;
  }
  return "active";
};

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
    configuredTrainingBaseUrls.map(toMigrationBaseUrl),
  ),
);

const legacyMigBaseUrls = Array.from(
  new Set(
    [...configuredTrainingBaseUrls, ...migrationBaseUrls].map(
      toLegacyMigBaseUrl,
    ),
  ),
);

const migrationApiKey =
  (process.env.PRISM_TRAINING_MIGRATION_KEY ??
    process.env.MIGRATION_API_KEY)?.trim() ??
  "";

const fetchUsersFromTraining = async (): Promise<MigrationUserDto[]> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(migrationApiKey ? { "x-migration-key": migrationApiKey } : {}),
  };

  const failures: string[] = [];

  for (const baseUrl of [...migrationBaseUrls, ...legacyMigBaseUrls]) {
    const requestUrl = `${baseUrl}/users`;
    try {
      const response = await fetch(requestUrl, {
        headers,
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        failures.push(`${requestUrl} -> HTTP ${response.status}`);
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        failures.push(`${requestUrl} -> expected JSON, got ${contentType || "unknown"}`);
        continue;
      }
      return (await response.json()) as MigrationUserDto[];
    } catch (error) {
      failures.push(
        `${requestUrl} -> ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(
    `Unable to reach users migration endpoint. Tried: ${failures.join(" | ")}`,
  );
};

async function main() {
  console.log("=== Sync users from prism-training into prism user table ===\n");

  const list = await fetchUsersFromTraining();
  console.log(`Fetched ${list.length} users from prism-training.\n`);

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

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const sourceUser of list) {
    const normalizedEmail = (sourceUser.email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      skipped += 1;
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
      updatedAt: new Date(),
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
      createdAt: new Date(),
    });

    existingUserIdSet.add(insertId);
    existingUserIdByEmail.set(normalizedEmail, insertId);
    inserted += 1;
  }

  console.log("Done.");
  console.log(`  inserted: ${inserted}`);
  console.log(`  updated:  ${updated}`);
  console.log(`  skipped:  ${skipped}`);
  console.log(`  total:    ${inserted + updated}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});