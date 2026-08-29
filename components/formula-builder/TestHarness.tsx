"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluateKpiFormula } from "@/app/data-entry/kpi-worker/evaluator";

const toTokenHash = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const formatNumber = (value: number): string =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);

export interface TestHarnessProps {
  formula: string;
  variableNames: string[];
}

export function TestHarness({ formula, variableNames }: TestHarnessProps) {
  const [baseValue, setBaseValue] = useState(10);
  const [seed, setSeed] = useState(1);
  const [manual, setManual] = useState<Record<string, string>>({});

  // deterministic synthetic value per variable, stable while editing
  const syntheticFor = (name: string): number => {
    const weight = (toTokenHash(`${name}:${seed}`) % 17) + 1;
    return Number((baseValue + weight).toFixed(2));
  };

  const valueFor = (name: string): number => {
    const raw = manual[name];
    if (typeof raw === "string" && raw.trim().length > 0) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
    return syntheticFor(name);
  };

  const result = useMemo(() => {
    const clean = formula.trim();
    if (!clean || variableNames.length === 0) {
      return {
        status: "idle" as const,
        message: "Add a formula and at least one variable to test.",
      };
    }
    const invalidManual = variableNames.find((n) => {
      const raw = manual[n];
      return (
        typeof raw === "string" &&
        raw.trim().length > 0 &&
        !Number.isFinite(Number(raw))
      );
    });
    if (invalidManual) {
      return {
        status: "error" as const,
        message: `Sample value for “${invalidManual}” must be numeric.`,
      };
    }
    const variables: Record<string, number> = {};
    for (const n of variableNames) variables[n] = valueFor(n);
    const evaluated = evaluateKpiFormula(clean, variables);
    if (evaluated.status === "error") {
      return {
        status: "error" as const,
        message: evaluated.failureReason ?? "Unable to evaluate formula.",
      };
    }
    return {
      status: "ok" as const,
      value: evaluated.value ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula, variableNames, manual, baseValue, seed]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-56 flex-1 items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Sample base value</Label>
          <Input
            type="range"
            min={1}
            max={100}
            step={1}
            value={baseValue}
            onChange={(e) => setBaseValue(Number(e.target.value))}
            className="h-8"
          />
          <span className="text-muted-foreground w-8 text-right text-xs tabular-nums">
            {baseValue}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setSeed((s) => s + 1)}
        >
          Randomize
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setManual({})}
        >
          Reset overrides
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-accent/60">
              <th className="text-muted-foreground px-3 py-2 text-left text-xs font-semibold tracking-wide uppercase">
                Variable
              </th>
              <th className="text-muted-foreground px-3 py-2 text-left text-xs font-semibold tracking-wide uppercase">
                Sample value
              </th>
              <th className="text-muted-foreground px-3 py-2 text-right text-xs font-semibold tracking-wide uppercase">
                Used
              </th>
            </tr>
          </thead>
          <tbody>
            {variableNames.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="text-muted-foreground px-3 py-4 text-center text-xs"
                >
                  No variables yet.
                </td>
              </tr>
            ) : (
              variableNames.map((name) => (
                <tr key={name} className="border-t">
                  <td className="px-3 py-1.5 font-mono font-semibold">
                    {name}
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      type="number"
                      step="any"
                      value={manual[name] ?? ""}
                      placeholder={formatNumber(syntheticFor(name))}
                      onChange={(e) =>
                        setManual((prev) => ({
                          ...prev,
                          [name]: e.target.value,
                        }))
                      }
                      className="h-7 max-w-40 text-xs"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                    {formatNumber(valueFor(name))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="bg-muted/30 rounded-lg border border-dashed p-2.5">
          <p className="text-xs font-medium">Formula</p>
          <p className="text-muted-foreground mt-1 font-mono text-xs break-words">
            {formula.trim() || "—"}
          </p>
        </div>
        <div className="bg-card rounded-lg border p-2.5">
          <p className="text-xs font-medium">Result</p>
          {result.status === "ok" ? (
            <p className="mt-1 text-base font-semibold text-emerald-600 dark:text-emerald-400">
              {formatNumber(Number(result.value))}
            </p>
          ) : (
            <p
              className={
                result.status === "error"
                  ? "text-destructive mt-1 text-xs"
                  : "text-muted-foreground mt-1 text-xs"
              }
            >
              {result.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default TestHarness;
