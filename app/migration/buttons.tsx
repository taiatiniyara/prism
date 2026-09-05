"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  backfillUnitPeriods,
  retrieveCountryContextData,
  retrieveCountries,
  retrieveDataEntries,
  retrieveUnits,
  retrieveGenerationRelevance,
  retrieveInputRelevance,
  retrieveManagedLists,
  retrieveReportPeriods,
  retrieveRoles,
  retrieveTariffRelevance,
  retrieveTransmissionRelevance,
  retrieveUtilityContextData,
  retrieveUsers,
  retrieveUtilityData,
  retrieveInputDlDefMappings,
  logMigrationStep,
  getMigrationHistory,
  purgeAllDataEntryRecords,
  deduplicateDataEntries,
  type MigrationStepResult,
} from "./service";

interface HistoryEntry {
  id: number;
  run_at: string;
  step_label: string;
  success: boolean;
  duration_ms: number;
  error_message: string | null;
}

interface Step {
  label: string;
  fn: () => Promise<MigrationStepResult>;
  heavy?: boolean;
}

const steps: Step[] = [
  { label: "Managed Lists", fn: retrieveManagedLists as () => Promise<MigrationStepResult> },
  { label: "Countries", fn: retrieveCountries as () => Promise<MigrationStepResult> },
  { label: "Roles", fn: retrieveRoles as () => Promise<MigrationStepResult> },
  { label: "Users", fn: retrieveUsers as () => Promise<MigrationStepResult> },
  { label: "Utility Data", fn: retrieveUtilityData as () => Promise<MigrationStepResult> },
  { label: "Report Periods", fn: retrieveReportPeriods as () => Promise<MigrationStepResult> },
  { label: "Units", fn: retrieveUnits as () => Promise<MigrationStepResult> },
  { label: "Unit Periods", fn: backfillUnitPeriods as () => Promise<MigrationStepResult> },
  { label: "Input DL Def Mappings", fn: retrieveInputDlDefMappings, heavy: true },
  { label: "Country Context", fn: retrieveCountryContextData as () => Promise<MigrationStepResult>, heavy: true },
  { label: "Utility Context", fn: retrieveUtilityContextData as () => Promise<MigrationStepResult>, heavy: true },
  { label: "Transmission Relevance", fn: retrieveTransmissionRelevance as () => Promise<MigrationStepResult>, heavy: true },
  { label: "Tariff Relevance", fn: retrieveTariffRelevance as () => Promise<MigrationStepResult>, heavy: true },
  { label: "Input Relevance", fn: retrieveInputRelevance as () => Promise<MigrationStepResult>, heavy: true },
  { label: "Generation Relevance", fn: retrieveGenerationRelevance as () => Promise<MigrationStepResult>, heavy: true },
  { label: "Data Entries", fn: (() => retrieveDataEntries()) as () => Promise<MigrationStepResult>, heavy: true },
];

const HEAVY_TIMEOUT_MS = Number(
  process.env.MIGRATION_HEAVY_STEP_TIMEOUT_MS ?? "600000",
);

interface StepResult {
  label: string;
  ok: boolean;
  ms: number;
  details: string;
  error?: string;
}

export default function MigrationButtons() {
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [results, setResults] = useState<StepResult[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);
  const [deduping, setDeduping] = useState(false);
  const [dedupResult, setDedupResult] = useState<string | null>(null);

  useEffect(() => {
    getMigrationHistory().then(setHistory).catch(() => {});
  }, [running]);

  async function syncAll() {
    if (running) return;
    setRunning(true);
    setResults([]);

    const log: StepResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      const step = steps[i];
      const timeoutMs = step.heavy ? HEAVY_TIMEOUT_MS : 30_000;
      const started = Date.now();

      let ok = false;
      let error: string | undefined;
      let inserted = 0;
      let updated = 0;

      try {
        const result = await withTimeout(step.fn(), timeoutMs);
        ok = result.ok;
        inserted = result.inserted;
        updated = result.updated;
      } catch (err) {
        error = err instanceof Error ? err.message : "Unknown error";
      }

      const ms = Date.now() - started;
      const details = error ? `Error: ${error}` : (ok ? `${inserted} inserted, ${updated} updated` : "Failed");
      log.push({ label: step.label, ok, ms, details, error });
      setResults([...log]);

      await logMigrationStep(step.label, ok, ms, error ?? null);
    }

    setCurrentStep(-1);
    setRunning(false);
    getMigrationHistory().then(setHistory).catch(() => {});
  }

  async function purgeAll() {
    if (purging) return;
    setPurging(true);
    setPurgeResult(null);
    try {
      const result = await purgeAllDataEntryRecords();
      if (result.ok) {
        const parts = Object.entries(result.tables)
          .filter(([, count]) => count > 0)
          .map(([table, count]) => `${table}: ${count}`);
        setPurgeResult(parts.length > 0 ? parts.join(", ") : "No records found.");
      } else {
        setPurgeResult(`Error: ${result.error ?? "Unknown error"}`);
      }
    } catch (err) {
      setPurgeResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPurging(false);
    }
  }

  async function dedup() {
    if (deduping) return;
    setDeduping(true);
    setDedupResult(null);
    try {
      const result = await deduplicateDataEntries();
      if (result.ok) {
        setDedupResult(
          result.deleted > 0
            ? `${result.deleted} duplicate rows removed.`
            : "No duplicates found.",
        );
      } else {
        setDedupResult(`Error: ${result.error ?? "Unknown error"}`);
      }
    } catch (err) {
      setDedupResult(
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setDeduping(false);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const lastRun = history.length > 0 ? history.filter((h) => h.run_at === history[0].run_at) : [];
  const lastPassed = lastRun.filter((h) => h.success).length;
  const lastFailed = lastRun.filter((h) => !h.success).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button disabled={running} onClick={syncAll} className="text-base px-6">
          {running ? `Syncing: ${steps[currentStep]?.label}...` : "Sync All from prism-training"}
        </Button>
        <Button
          disabled={running || purging}
          variant="destructive"
          onClick={purgeAll}
          className="text-base px-6"
        >
          {purging ? "Purging..." : "Purge All Data Entry Records"}
        </Button>
        <Button
          disabled={running || deduping}
          variant="outline"
          onClick={dedup}
          className="text-base px-6"
        >
          {deduping ? "Deduping..." : "Deduplicate Data Entries"}
        </Button>
        {running && <span className="text-sm text-slate-500">Step {currentStep + 1} of {steps.length}</span>}
        {history.length > 0 && !running && (
          <span className="text-xs text-slate-400">Last run: {lastPassed} passed{lastFailed > 0 ? `, ${lastFailed} failed` : ""}</span>
        )}
      </div>

      {purgeResult ? (
        <p className="text-sm text-muted-foreground">Purge: {purgeResult}</p>
      ) : null}
      {dedupResult ? (
        <p className="text-sm text-muted-foreground">Dedup: {dedupResult}</p>
      ) : null}

      {results.length > 0 && (
        <div className="space-y-1">
          <div className="text-sm font-medium mb-2">{passed} passed{failed > 0 ? `, ${failed} failed` : ""}</div>
          {results.map((r, i) => (
            <div key={i} className={`text-xs px-2 py-1 rounded ${r.ok ? "bg-lime-100 text-lime-800" : "bg-danger/10 text-danger"}`}>
        {r.ok ? "\u2713" : "\u2717"} {r.label} ({r.ms}ms)
        {r.details && <span className="ml-1 opacity-75"> {"—"} {r.details}</span>}
        {r.error && <span className="ml-2 opacity-75">{r.error}</span>}
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div>
          <button onClick={() => setShowHistory(!showHistory)} className="text-xs text-slate-500 hover:text-slate-700 underline">
            {showHistory ? "Hide history" : `Show history (${history.length} entries)`}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-0.5 max-h-64 overflow-y-auto">
              {history.map((h) => (
                <div key={h.id} className={`text-xs px-2 py-0.5 rounded flex justify-between ${h.success ? "text-slate-600" : "text-danger bg-danger/10"}`}>
                  <span>{h.success ? "\u2713" : "\u2717"} {h.step_label}{h.error_message && <span className="ml-2 opacity-75">- {h.error_message}</span>}</span>
                  <span className="text-slate-400">{new Date(h.run_at).toLocaleString()} ({h.duration_ms}ms)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}
