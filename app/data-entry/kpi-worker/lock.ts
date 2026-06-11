import { db } from "@/db/connection";
import { sql } from "drizzle-orm";
import type { KpiWorkerScope } from "./types";
import crypto from "node:crypto";

const deferredFollowUps = new Set<string>();

const normalizeScopeValue = (value: number | null | undefined): number | null =>
  value ?? null;

export const buildScopeLockKey = (scope: KpiWorkerScope): string => {
  const payload = {
    reportPeriodId: scope.reportPeriodId,
    organizationId: normalizeScopeValue(scope.organizationId),
    serviceAreaId: normalizeScopeValue(scope.serviceAreaId),
    energyResourceId: normalizeScopeValue(scope.energyResourceId),
    energyProviderId: normalizeScopeValue(scope.energyProviderId),
    energyTypeId: normalizeScopeValue(scope.energyTypeId),
    energySourceId: normalizeScopeValue(scope.energySourceId),
    customerTypeId: normalizeScopeValue(scope.customerTypeId),
    paymentModeId: normalizeScopeValue(scope.paymentModeId),
  };

  return JSON.stringify(payload);
};

const toLockId = (key: string): string => {
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return BigInt("0x" + hash.substring(0, 16)).toString();
};

export const acquireScopeLock = async (
  scope: KpiWorkerScope,
): Promise<boolean> => {
  const key = buildScopeLockKey(scope);
  const lockId = toLockId(key);

  const result = await db.execute<{ acquired: boolean }>(
    sql`SELECT pg_try_advisory_lock(${sql.raw(lockId)}::bigint) AS acquired`,
  );

  return result.rows[0]?.acquired === true;
};

const activeLocks = new Set<string>();

export const releaseScopeLock = async (
  scope: KpiWorkerScope,
): Promise<void> => {
  const key = buildScopeLockKey(scope);
  const lockId = toLockId(key);

  if (!activeLocks.has(key)) return;

  try {
    await db.execute(
      sql`SELECT pg_advisory_unlock(${sql.raw(lockId)}::bigint)`,
    );
  } catch {
    // lock may have been released by connection close
  }

  activeLocks.delete(key);
};

export const markDeferredFollowUp = (scope: KpiWorkerScope): void => {
  deferredFollowUps.add(buildScopeLockKey(scope));
};

export const consumeDeferredFollowUp = (scope: KpiWorkerScope): boolean => {
  const key = buildScopeLockKey(scope);
  const hasDeferred = deferredFollowUps.has(key);
  if (hasDeferred) {
    deferredFollowUps.delete(key);
  }

  return hasDeferred;
};
