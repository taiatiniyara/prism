import type {
  KpiWorkerScope,
  KpiWorkerTrigger,
} from "@/app/data-entry/kpi-worker/types";

export const baseKpiWorkerScope: KpiWorkerScope = {
  reportPeriodId: 1,
  organizationId: 1,
  serviceAreaId: 10,
  unitId: 20,
};

export function makeKpiWorkerTrigger(
  overrides: Partial<KpiWorkerTrigger> = {},
): KpiWorkerTrigger {
  return {
    sourceDataEntryId: "00000000-0000-0000-0000-000000000001",
    inputDefId: 100,
    scope: baseKpiWorkerScope,
    ...overrides,
  };
}
