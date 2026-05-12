"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  backfillEnergyResourcePeriods,
  retrieveCountryContextData,
  retrieveCountries,
  retrieveEnergyResources,
  retrieveGenerationRelevance,
  retrieveInputDefinitions,
  retrieveKpiDefinitions,
  retrieveManagedLists,
  retrieveReportPeriods,
  retrieveRoles,
  retrieveTariffRelevance,
  retrieveTransmissionRelevance,
  retrieveUtilityContextData,
  retrieveUsers,
  retrieveUtilityData,
} from "./service";
import { toast } from "sonner";

const buttonList: {
  label: string;
  fn: () => Promise<boolean>;
}[] = [
  {
    label: "Migrate Managed Lists",
    fn: retrieveManagedLists,
  },
  {
    label: "Migrate Countries",
    fn: retrieveCountries,
  },
  {
    label: "Migrate Roles",
    fn: retrieveRoles,
  },
  {
    label: "Migrate Users",
    fn: retrieveUsers,
  },
  {
    label: "Migrate Utility Data",
    fn: retrieveUtilityData,
  },
  {
    label: "Migrate Report Periods",
    fn: retrieveReportPeriods,
  },
  {
    label: "Migrate Energy Resources",
    fn: retrieveEnergyResources,
  },
  {
    label: "Backfill Energy Resource Periods",
    fn: backfillEnergyResourcePeriods,
  },
  {
    label: "Migrate KPI Definitions",
    fn: retrieveKpiDefinitions,
  },
  {
    label: "Migrate Input Definitions",
    fn: retrieveInputDefinitions,
  },
  {
    label: "Migrate Country Context",
    fn: retrieveCountryContextData,
  },
  {
    label: "Migrate Utility Context",
    fn: retrieveUtilityContextData,
  },
  {
    label: "Migrate Generation Relevance",
    fn: retrieveGenerationRelevance,
  },
  {
    label: "Migrate Transmission Relevance",
    fn: retrieveTransmissionRelevance,
  },
  {
    label: "Migrate Tariff Relevance",
    fn: retrieveTariffRelevance,
  },
];

const DEFAULT_TIMEOUT_MS = 30_000;
const HEAVY_MIGRATION_TIMEOUT_MS = 180_000;

const getTimeoutMsForLabel = (label: string): number => {
  if (
    label === "Migrate Generation Relevance" ||
    label === "Migrate Tariff Relevance"
  ) {
    return HEAVY_MIGRATION_TIMEOUT_MS;
  }

  return DEFAULT_TIMEOUT_MS;
};

export default function MigrationButtons() {
  const [runningLabel, setRunningLabel] = useState<string | null>(null);
  const [lastRunMessage, setLastRunMessage] = useState<string | null>(null);

  const isRunning = runningLabel !== null;

  const runMigration = async (label: string, fn: () => Promise<boolean>) => {
    if (isRunning) return;

    setRunningLabel(label);
    setLastRunMessage(`Starting ${label}...`);
    const startedAt = Date.now();
    const timeoutMs = getTimeoutMsForLabel(label);

    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(`Migration timed out after ${Math.round(ms / 1000)}s`),
          );
        }, ms);

        promise.then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            clearTimeout(timer);
            reject(error);
          },
        );
      });

    try {
      const result = await withTimeout(fn(), timeoutMs);
      const elapsedMs = Date.now() - startedAt;

      if (result === true) {
        const message = `${label} migrated successfully (${elapsedMs}ms)`;
        setLastRunMessage(message);
        toast.success(message);
        return;
      }

      const message = `Failed to migrate ${label} (${elapsedMs}ms)`;
      setLastRunMessage(message);
      toast.error(message);
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const errorMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : `Failed to migrate ${label}`;
      const message = `${errorMessage} (${elapsedMs}ms)`;

      setLastRunMessage(message);
      toast.error(message);
    } finally {
      setRunningLabel(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-4">
        {buttonList.map((btn) => (
          <Button
            key={btn.label}
            disabled={isRunning}
            onClick={() => {
              void runMigration(btn.label, btn.fn);
            }}
          >
            {isRunning && runningLabel === btn.label ? "Running..." : btn.label}
          </Button>
        ))}
      </div>

      {lastRunMessage ? (
        <p className="text-muted-foreground text-sm">{lastRunMessage}</p>
      ) : null}
    </div>
  );
}
