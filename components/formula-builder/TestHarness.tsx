"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeEvaluateFormula } from "./safe-eval";

const toTokenHash = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const formatNumber = (value: number): string =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);

/**
 * The value as it renders on dashboards, per the KPI/measure's configured
 * format: currency → "$" + 2dp; a "%" unit → suffixed "%"; any other unit →
 * suffixed. No ×100 conversion — a stored ratio stays a ratio (matches the
 * "KPI's configured format" contract).
 */
const formatAdjusted = (
  value: number,
  isCurrency: boolean,
  unitLabel: string | null | undefined,
): string => {
  if (isCurrency) {
    return `$${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)}`;
  }
  const num = formatNumber(value);
  const unit = unitLabel?.trim() ?? "";
  if (!unit) return num;
  return unit === "%" ? `${num}%` : `${num} ${unit}`;
};

export interface TestHarnessProps {
  formula: string;
  variableNames: string[];
  /** variable name -> tailwind bg/text colour classes (matches its card/token) */
  variableColors?: Record<string, string>;
  /** selected KPI/measure display format — drives the format-adjusted result */
  unitLabel?: string | null;
  isCurrency?: boolean;
}

export function TestHarness({
  formula,
  variableNames,
  variableColors,
  unitLabel,
  isCurrency = false,
}: TestHarnessProps) {
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
    const evaluated = safeEvaluateFormula(clean, variables);
    if (!evaluated.ok) {
      return {
        status: "error" as const,
        message: evaluated.error,
      };
    }
    return {
      status: "ok" as const,
      value: evaluated.value,
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
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-accent/60">
              <th className="text-muted-foreground px-3 py-2 text-left text-xs font-semibold tracking-wide uppercase">
                Variable
              </th>
              <th className="text-muted-foreground px-3 py-2 text-right text-xs font-semibold tracking-wide uppercase">
                Sample value
              </th>
            </tr>
          </thead>
          <tbody>
            {variableNames.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  className="text-muted-foreground px-3 py-4 text-center text-xs"
                >
                  No variables yet.
                </td>
              </tr>
            ) : (
              variableNames.map((name) => (
                <tr key={name} className="border-t">
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        "inline-block rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold",
                        variableColors?.[name],
                      )}
                    >
                      {name}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
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
                      className="ml-auto h-7 max-w-40 text-right text-xs tabular-nums"
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-stretch gap-2">
        <div className="bg-muted/30 min-w-0 flex-1 rounded-lg border border-dashed p-2.5">
          <p className="text-xs font-medium">Formula</p>
          <p className="text-muted-foreground mt-1 font-mono text-xs break-words">
            {formula.trim() || "—"}
          </p>
        </div>
        {result.status === "ok" ? (
          <>
            <div className="bg-card flex w-40 shrink-0 flex-col items-end justify-center rounded-lg border p-2.5">
              <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                Raw
              </p>
              <span className="text-base font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                {formatNumber(Number(result.value))}
              </span>
            </div>
            {(isCurrency || (unitLabel && unitLabel.trim().length > 0)) && (
              <div className="bg-card flex w-40 shrink-0 flex-col items-end justify-center rounded-lg border p-2.5">
                <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                  Format adjusted
                </p>
                <span className="text-base font-semibold text-emerald-700 tabular-nums dark:text-emerald-300">
                  {formatAdjusted(Number(result.value), isCurrency, unitLabel)}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="bg-card flex w-48 shrink-0 items-center justify-end rounded-lg border p-2.5">
            <span
              className={
                result.status === "error"
                  ? "text-destructive text-right text-xs"
                  : "text-muted-foreground text-right text-xs"
              }
            >
              {result.message}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default TestHarness;
