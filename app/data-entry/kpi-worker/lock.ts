import { db } from "@/db/connection";
import { sql } from "drizzle-orm";
import type { KpiWorkerScope } from "./types";
import crypto from "node:crypto";

const deferredFollowUps = new Set<string>();

/** Scope keys this process currently holds a Postgres advisory lock for. */
const activeLocks = new Set<string>();

const normalizeScopeValue = (value: number | null | undefined): number | null =>
  value ?? null;

export const buildScopeLockKey = (scope: KpiWorkerScope): string => {
  const payload = {
    reportPeriodId: scope.reportPeriodId,
    organizationId: normalizeScopeValue(scope.organizationId),
    serviceAreaId: normalizeScopeValue(scope.serviceAreaId),
    unitId: normalizeScopeValue(scope.unitId),
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

  const acquired = result.rows[0]?.acquired === true;
  if (acquired) {
    // Record that we hold it, so releaseScopeLock actually issues the unlock.
    // (Without this the advisory lock was only ever cleared when the pooled
    // connection cycled — a leaked lock could wedge a scope for a long time.)
    activeLocks.add(key);
  }
  return acquired;
};

export const releaseScopeLock = async (
  scope: KpiWorkerScope,
): Promise<void> => {
  const key = buildScopeLockKey(scope);
  const lockId = toLockId(key);

  if (!activeLocks.has(key)) return;

  try {
    // NOTE: session-level advisory locks are per-connection. On a connection
    // pool the unlock can land on a different backend than the acquire, making
    // it a no-op. The robust fix is a transaction-scoped lock
    // (`pg_advisory_xact_lock`), which rides on the orchestrator consolidation
    // in #237; this at least issues the unlock on the happy path.
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
