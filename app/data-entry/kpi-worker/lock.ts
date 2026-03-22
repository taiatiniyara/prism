import type { KpiWorkerScope } from "./types";

const inFlightScopes = new Set<string>();
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

export const acquireScopeLock = (scope: KpiWorkerScope): boolean => {
  const key = buildScopeLockKey(scope);
  if (inFlightScopes.has(key)) {
    return false;
  }

  inFlightScopes.add(key);
  return true;
};

export const releaseScopeLock = (scope: KpiWorkerScope): void => {
  inFlightScopes.delete(buildScopeLockKey(scope));
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
