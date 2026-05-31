"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  backfillEnergyResourcePeriods,
  retrieveCountryContextData,
  retrieveCountries,
  retrieveDataEntries,
  retrieveEnergyResources,
  retrieveGenerationRelevance,
  retrieveManagedLists,
  retrieveReportPeriods,
  retrieveRoles,
  retrieveTariffRelevance,
  retrieveTransmissionRelevance,
  retrieveUtilityContextData,
  retrieveUsers,
  retrieveUtilityData,
  logMigrationStep,
  getMigrationHistory,
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
  fn: () => Promise<boolean>;
  heavy?: boolean;
}

const steps: Step[] = [
  { label: "Managed Lists", fn: retrieveManagedLists },
  { label: "Countries", fn: retrieveCountries },
  { label: "Roles", fn: retrieveRoles },
  { label: "Users", fn: retrieveUsers },
  { label: "Utility Data", fn: retrieveUtilityData },
  { label: "Report Periods", fn: retrieveReportPeriods },
  { label: "Energy Resources", fn: retrieveEnergyResources },
  { label: "Energy Resource Periods", fn: backfillEnergyResourcePeriods },
  { label: "Country Context", fn: retrieveCountryContextData },
  { label: "Utility Context", fn: retrieveUtilityContextData },
  { label: "Generation Relevance", fn: retrieveGenerationRelevance, heavy: true },
  { label: "Transmission Relevance", fn: retrieveTransmissionRelevance, heavy: true },
  { label: "Tariff Relevance", fn: retrieveTariffRelevance, heavy: true },
  { label: "Data Entries", fn: () => retrieveDataEntries(), heavy: true },
];

const HEAVY_TIMEOUT_MS = 180_000;

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

      try {
        ok = await withTimeout(step.fn(), timeoutMs);
      } catch (err) {
        error = err instanceof Error ? err.message : "Unknown error";
      }

      const ms = Date.now() - started;
      const details = error ? `Error: ${error}` : (ok ? "OK" : "Failed");
      log.push({ label: step.label, ok, ms, details, error });
      setResults([...log]);

      await logMigrationStep(step.label, ok, ms, error ?? null);
    }

    setCurrentStep(-1);
    setRunning(false);
    getMigrationHistory().then(setHistory).catch(() => {});
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
        {running && <span className="text-sm text-slate-500">Step {currentStep + 1} of {steps.length}</span>}
        {history.length > 0 && !running && (
          <span className="text-xs text-slate-400">Last run: {lastPassed} passed{lastFailed > 0 ? `, ${lastFailed} failed` : ""}</span>
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-1">
          <div className="text-sm font-medium mb-2">{passed} passed{failed > 0 ? `, ${failed} failed` : ""}</div>
          {results.map((r, i) => (
            <div key={i} className={`text-xs px-2 py-1 rounded ${r.ok ? "bg-lime-100 text-lime-800" : "bg-red-100 text-red-800"}`}>
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
                <div key={h.id} className={`text-xs px-2 py-0.5 rounded flex justify-between ${h.success ? "text-slate-600" : "text-red-600 bg-red-50"}`}>
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
