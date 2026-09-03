"use client";

import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isCategoricalDataType } from "@/lib/formula/descriptive-projection";
import {
  saveUnifiedFormula,
  recomputeKpiNow,
  planCalculatedMeasureCompute,
  computeCalculatedMeasureChunk,
  updateTargetUom,
} from "@/app/settings/kpi/unified-formula-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";

import { FormulaEditor, formulaVariables } from "./FormulaEditor";
import { InputTagCard } from "./InputTagCard";
import { MeasurePickerModal } from "./MeasurePickerModal";
import { InputCoverageModal } from "./InputCoverageModal";
import { TestHarness } from "./TestHarness";
import {
  colorForVariableIndex,
  type BuilderData,
  type BuilderMode,
  type DimBinding,
  type DimensionField,
  type MeasureCatalogueItem,
  type RecomputeResult,
  type SavePayload,
  type TagCardState,
  type TargetOption,
} from "./types";

type ResultSortCol = "period" | "status" | "value" | "reason";
type ResultSortState = { col: ResultSortCol; dir: "asc" | "desc" };

let cardKeySeq = 0;
const nextCardKey = () => `card_${Date.now().toString(36)}_${cardKeySeq++}`;

function seedDims(
  measure: MeasureCatalogueItem,
): Partial<Record<DimensionField, DimBinding>> {
  const dims: Partial<Record<DimensionField, DimBinding>> = {};
  for (const d of measure.applicableDims) {
    // Default every applicable dimension to All (aggregate across it). Previously
    // `by_context` dimensions silently pinned to their first allowed member
    // (e.g. Utility Function → "Generation"), which quietly restricted the
    // formula to a single slice. Aggregating across the dimension is the safe,
    // expected default; the author can still narrow it to Pin/Inherit per card.
    dims[d.field] = { mode: "all", memberId: null };
  }
  return dims;
}

export interface UnifiedFormulaBuilderProps {
  data: BuilderData;
  mode: BuilderMode;
}

export function UnifiedFormulaBuilder({ data, mode }: UnifiedFormulaBuilderProps) {
  const [activeMode, setActiveMode] = useState<BuilderMode>(mode);
  const targets =
    activeMode === "kpi" ? data.kpiTargets : data.measureTargets;
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [formula, setFormula] = useState("");
  const [cards, setCards] = useState<TagCardState[]>([]);
  const [onlyWithoutFormula, setOnlyWithoutFormula] = useState(false);
  const [trackAsKpi, setTrackAsKpi] = useState(false);
  const [pickerCardKey, setPickerCardKey] = useState<string | null>(null);
  const [recompute, setRecompute] = useState<RecomputeResult | null>(null);
  // Report period whose per-unit input coverage the diagnostic modal shows.
  const [coveragePeriod, setCoveragePeriod] = useState<number | null>(null);
  // Chunked calculated-measure compute progress ("period X of N"). null = idle.
  const [computeProgress, setComputeProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  // Inline UoM edits, keyed by target id, so the harness's format-adjusted
  // preview reflects a just-changed unit before a reload.
  const [unitOverrides, setUnitOverrides] = useState<Record<number, number>>(
    {},
  );
  const [isSaving, startSave] = useTransition();
  const [isComputing, startCompute] = useTransition();

  // Re-fetch the loader data (measures + their dimension scope, targets, units)
  // when this tab regains focus — so changes made in the separate Measure Scope
  // / settings tabs show up without a manual reload. router.refresh() re-runs the
  // server component but preserves this component's local edit state. Debounced
  // so a quick tab flick doesn't refetch repeatedly.
  const router = useRouter();
  const lastRefresh = useRef(0);
  useEffect(() => {
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefresh.current < 1500) return;
      lastRefresh.current = now;
      router.refresh();
    };
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [router]);

  // Recompute-results table sort. Period ascending is the default; clicking a
  // header sorts by that column (toggling asc/desc on repeat clicks).
  const [resultSort, setResultSort] = useState<{
    col: ResultSortCol;
    dir: "asc" | "desc";
  }>({ col: "period", dir: "asc" });
  const toggleResultSort = (col: ResultSortCol) =>
    setResultSort((s) =>
      s.col === col
        ? { col, dir: s.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" },
    );
  const sortedByPeriod = useMemo(() => {
    if (!recompute) return [];
    const numOrNull = (v?: string) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const mul = resultSort.dir === "asc" ? 1 : -1;
    return [...recompute.byPeriod].sort((a, b) => {
      let cmp = 0;
      if (resultSort.col === "period") {
        cmp = a.reportPeriodId - b.reportPeriodId;
      } else if (resultSort.col === "value") {
        const na = numOrNull(a.value);
        const nb = numOrNull(b.value);
        // Empty values ("—") always sort last, regardless of direction.
        if (na == null && nb == null) cmp = 0;
        else if (na == null) return 1;
        else if (nb == null) return -1;
        else cmp = na - nb;
      } else if (resultSort.col === "status") {
        cmp = (a.status ?? "").localeCompare(b.status ?? "");
      } else {
        cmp = (a.reason ?? "").localeCompare(b.reason ?? "");
      }
      // Stable tiebreak by period so equal keys keep a deterministic order.
      if (cmp === 0) return a.reportPeriodId - b.reportPeriodId;
      return cmp * mul;
    });
  }, [recompute, resultSort]);

  const measuresById = useMemo(() => {
    const m = new Map<number, MeasureCatalogueItem>();
    for (const item of data.measures) m.set(item.id, item);
    return m;
  }, [data.measures]);

  const targetsById = useMemo(() => {
    const m = new Map<number, TargetOption>();
    for (const t of targets) m.set(t.id, t);
    return m;
  }, [targets]);

  const filteredTargets = useMemo(
    () =>
      targets.filter(
        (t) =>
          // Always keep the currently-selected target in the list, even after
          // Save & Compute flips it to properly-configured — otherwise it drops
          // out of the "needs setup/repair" filter and the dropdown blanks while
          // the formula + tag-cards stay visible (looks like the selection was lost).
          t.id === selectedTargetId ||
          (onlyWithoutFormula ? !t.isProperlyConfigured : true),
      ),
    [targets, onlyWithoutFormula, selectedTargetId],
  );

  const variables = useMemo(() => formulaVariables(formula), [formula]);
  const knownVariables = useMemo(
    () => cards.map((c) => c.variableName),
    [cards],
  );

  // Descriptive projection: this KPI publishes an entered value by reference —
  // it is never numerically computed, so Compute-now is not offered (it would
  // always fail "missing inputs"). Belt-and-braces per #4: the intent flag
  // (kpi_definitions.is_descriptive) OR the structural guard (any bound input
  // is a categorical option/text/boolean measure — the numeric evaluator must
  // never run on one of those).
  const descriptiveInputs = useMemo(
    () =>
      cards
        .map((c) =>
          c.measureDefId != null ? measuresById.get(c.measureDefId) : undefined,
        )
        .filter(
          (m): m is MeasureCatalogueItem =>
            !!m && isCategoricalDataType(m.dataTypeName),
        ),
    [cards, measuresById],
  );
  const targetIsDescriptive =
    selectedTargetId != null &&
    (targetsById.get(selectedTargetId)?.isDescriptive ?? false);
  const isDescriptiveProjection =
    targetIsDescriptive || descriptiveInputs.length > 0;

  // Pass-through KPI: a KPI whose formula is a single variable bound to one
  // COMPUTED measure (e.g. a Track-as-KPI companion) — it just MIRRORS that
  // measure, and the measure's own compute publishes it (via "Apply to
  // previous and current periods"), so "Compute now" here has no purpose.
  // (A pass-through of a raw/context measure still needs its own compute, so we
  // only hide it for computed-measure mirrors.)
  const passThroughMeasure = useMemo(() => {
    if (activeMode !== "kpi") return undefined;
    if (cards.length !== 1) return undefined;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(formula.trim())) return undefined;
    const measureId = cards[0]?.measureDefId;
    const measure = measureId != null ? measuresById.get(measureId) : undefined;
    return measure?.isCalculated ? measure : undefined;
  }, [activeMode, cards, formula, measuresById]);
  const isPassThroughKpi = passThroughMeasure != null;

  // distinct colour per variable, shared by its formula token and its card
  const variableColors = useMemo(() => {
    const map: Record<string, string> = {};
    knownVariables.forEach((name, i) => {
      if (!(name in map)) map[name] = colorForVariableIndex(i);
    });
    return map;
  }, [knownVariables]);

  // --- card reconciliation ------------------------------------------------
  const reconcileCards = (
    nextFormula: string,
    prev: TagCardState[],
  ): TagCardState[] => {
    const vars = formulaVariables(nextFormula);
    const byName = new Map(prev.map((c) => [c.variableName, c]));
    return vars.map(
      (name) =>
        byName.get(name) ?? {
          key: nextCardKey(),
          variableName: name,
          measureDefId: null,
          grainMode: "inherit",
          dims: {},
        },
    );
  };

  const handleFormulaChange = (next: string) => {
    setFormula(next);
    setCards((prev) => reconcileCards(next, prev));
    setJustSaved(false);
  };

  const handleSelectTarget = (value: string) => {
    const id = Number(value);
    const target = targetsById.get(id);
    setSelectedTargetId(id);
    setFormula(target?.formula ?? "");
    setCards(target?.existingCards.map((c) => ({ ...c })) ?? []);
    setTrackAsKpi(target?.isTrackedAsKpi ?? false);
    setRecompute(null);
    setJustSaved(false);
  };

  const handleModeSwitch = (next: BuilderMode) => {
    if (next === activeMode) return;
    setActiveMode(next);
    setSelectedTargetId(null);
    setFormula("");
    setCards([]);
    setRecompute(null);
    setJustSaved(false);
    setOnlyWithoutFormula(false);
    setTrackAsKpi(false);
  };

  const updateCard = (key: string, next: TagCardState) =>
    setCards((prev) => prev.map((c) => (c.key === key ? next : c)));

  // Rename a variable: rewrite its token in the formula AND the card, so the
  // binding (measure + dims) is preserved (no orphaned/re-created card).
  const handleRenameVariable = (card: TagCardState, rawNext: string) => {
    const next = rawNext.trim();
    const oldName = card.variableName;
    if (!next || next === oldName) return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(next)) {
      toast.error(
        "Variable names use letters, numbers and underscores, and can’t start with a number.",
      );
      return;
    }
    if (cards.some((c) => c.key !== card.key && c.variableName === next)) {
      toast.error(`“${next}” is already used by another input.`);
      return;
    }
    const escapedName = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escapedName}\\b`, "g");
    setFormula((f) => f.replace(re, next));
    setCards((prev) =>
      prev.map((c) => (c.key === card.key ? { ...c, variableName: next } : c)),
    );
    setJustSaved(false);
  };

  const removeCard = (key: string) => {
    const card = cards.find((c) => c.key === key);
    setCards((prev) => prev.filter((c) => c.key !== key));
    if (card) {
      // strip the variable's tokens from the formula so state stays consistent
      const stripped = formula
        .split(/\s+/)
        .filter((tok) => tok !== card.variableName)
        .join(" ")
        .trim();
      setFormula(stripped);
    }
  };

  const handlePickMeasure = (measure: MeasureCatalogueItem) => {
    if (!pickerCardKey) return;
    setCards((prev) =>
      prev.map((c) =>
        c.key === pickerCardKey
          ? {
              ...c,
              measureDefId: measure.id,
              measureName: measure.name,
              unitLabel: measure.unitLabel ?? undefined,
              strataId: measure.strataId,
              dims: seedDims(measure),
            }
          : c,
      ),
    );
  };

  // --- validation ---------------------------------------------------------
  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (selectedTargetId == null) errs.push("Choose a target first.");
    if (!formula.trim()) errs.push("Formula is empty.");
    const cardByName = new Map(cards.map((c) => [c.variableName, c]));
    for (const v of variables) {
      const card = cardByName.get(v);
      if (!card) {
        errs.push(`Variable “${v}” has no input card.`);
      } else if (card.measureDefId == null) {
        errs.push(`Input “${v}” needs a measure.`);
      } else if (!measuresById.has(card.measureDefId)) {
        errs.push(`Input “${v}” points at an unavailable measure.`);
      }
    }
    return errs;
  }, [selectedTargetId, formula, cards, variables, measuresById]);

  const canSave = validationErrors.length === 0;
  const bindingsResolved =
    variables.length > 0 &&
    variables.every((v) => {
      const c = cards.find((x) => x.variableName === v);
      return c?.measureDefId != null && measuresById.has(c.measureDefId);
    });

  // --- actions ------------------------------------------------------------

  // Chunked calculated-measure recompute. The aggregated worker is a per-period
  // fixpoint, so computing all ~140 periods in one server-action call blows past
  // the gateway timeout (the old bug: the browser saw nothing while the compute
  // finished server-side). Instead: enumerate periods once, then compute a small
  // slice per request — updating "period X of N" and streaming each slice's
  // per-period reasons into the table below. Returns the final totals for the toast.
  const CHUNK_SIZE = 8;
  const runChunkedMeasureCompute = async (): Promise<{
    total: number;
    calculated: number;
    skipped: number;
    errors: number;
  }> => {
    const focusId = selectedTargetId ?? undefined;
    // Scope the whole run to the selected measure — compute + KPI republish
    // touch only it, not every calculated measure. (No selection ⇒ whole set.)
    const plan = await planCalculatedMeasureCompute(focusId);
    const total = plan.periodIds.length;
    setRecompute({ processed: 0, failed: 0, byPeriod: [] });
    if (total === 0) {
      setComputeProgress(null);
      return { total: 0, calculated: 0, skipped: 0, errors: 0 };
    }
    setComputeProgress({ done: 0, total });
    const accum: RecomputeResult["byPeriod"] = [];
    let calculated = 0;
    let skipped = 0;
    let errors = 0;
    let done = 0;
    for (let i = 0; i < plan.periodIds.length; i += CHUNK_SIZE) {
      const chunk = plan.periodIds.slice(i, i + CHUNK_SIZE);
      const isLast = i + CHUNK_SIZE >= plan.periodIds.length;
      const c = await computeCalculatedMeasureChunk({
        periodIds: chunk,
        focusMeasureId: focusId,
        dependentKpiIds: plan.dependentKpiIds,
        targetInputDefIds: plan.targetInputDefIds,
        revalidate: isLast,
      });
      calculated += c.calculated;
      skipped += c.skipped;
      errors += c.errors;
      if (c.byPeriod.length) accum.push(...c.byPeriod);
      done += chunk.length;
      setComputeProgress({ done, total });
      // Stream partial results into the reason table as each slice lands.
      const snapshot = [...accum];
      setRecompute({
        processed: snapshot.filter((p) => p.status === "ok").length,
        failed: snapshot.filter((p) => p.status !== "ok").length,
        byPeriod: snapshot,
      });
    }
    setComputeProgress(null);
    return { total, calculated, skipped, errors };
  };

  const handleSave = () => {
    if (selectedTargetId == null) {
      toast.error("Choose a target first.");
      return;
    }
    if (!canSave) {
      toast.error(validationErrors[0]);
      return;
    }
    const payload: SavePayload = {
      mode: activeMode,
      ownerId: selectedTargetId,
      formula: formula.trim(),
      cards,
      trackAsKpi: activeMode === "measure" ? trackAsKpi : undefined,
    };
    startSave(() => {
      void (async () => {
        const res = await saveUnifiedFormula(payload);
        if (!res.ok) {
          toast.error(res.error ?? "Save failed.");
          return;
        }
        toast.success("Saved ✓");
        setJustSaved(true);
        // Keep the definition on screen after saving — the user can keep
        // editing, save again, or pick another target from the dropdown.
        // (Blanking the form here read as data loss.)
      })();
    });
  };

  // Save & Compute: persist the formula, then immediately compute so prior +
  // current period values reflect it (a bare Save computes nothing). Skipped
  // for targets where compute has no purpose (descriptive / pass-through) — the
  // button isn't shown there.
  const handleSaveAndCompute = () => {
    if (selectedTargetId == null) {
      toast.error("Choose a target first.");
      return;
    }
    if (!canSave) {
      toast.error(validationErrors[0]);
      return;
    }
    const targetId = selectedTargetId;
    const payload: SavePayload = {
      mode: activeMode,
      ownerId: targetId,
      formula: formula.trim(),
      cards,
      trackAsKpi: activeMode === "measure" ? trackAsKpi : undefined,
    };
    startSave(async () => {
      const res = await saveUnifiedFormula(payload);
      if (!res.ok) {
        toast.error(res.error ?? "Save failed.");
        return;
      }
      setJustSaved(true);
      if (activeMode === "measure") {
        // Chunked async-with-progress: never a single >1-min request.
        const c = await runChunkedMeasureCompute();
        if (c.total === 0) {
          toast.warning("Saved ✓ · no report periods to compute.");
        } else if (c.errors > 0) {
          toast.warning(
            `Saved ✓ · computed ${c.calculated} value(s) across ${c.total} period(s); ${c.errors} period(s) errored.`,
          );
        } else {
          toast.success(
            `Saved ✓ · computed ${c.calculated} value(s) across ${c.total} period(s) (${c.skipped} skipped).`,
          );
        }
      } else {
        const c = await recomputeKpiNow(targetId);
        setRecompute(c);
        if (c.failed > 0) {
          toast.warning(
            `Saved ✓ · recomputed ${c.processed}, ${c.failed} failed.`,
          );
        } else {
          toast.success(`Saved ✓ · recomputed ${c.processed} period(s).`);
        }
      }
    });
  };

  const handleCompute = () => {
    startCompute(async () => {
      if (activeMode === "measure") {
        // Batch: compute ALL calculated measures across all periods (the
        // aggregated worker is a fixpoint over the whole set), chunked per
        // period so no single request exceeds the gateway timeout; the reason
        // table below streams the SELECTED measure's per-period status.
        const res = await runChunkedMeasureCompute();
        if (res.total === 0) {
          toast.warning("No report periods to compute.");
        } else if (res.errors > 0) {
          toast.warning(
            `Computed ${res.calculated} value(s) across ${res.total} period(s); ${res.errors} period(s) errored.`,
          );
        } else {
          toast.success(
            `Computed ${res.calculated} calculated-measure value(s) across ${res.total} period(s) (${res.skipped} skipped).`,
          );
        }
        return;
      }
      if (selectedTargetId == null) {
        toast.error("Choose a target first.");
        return;
      }
      const res = await recomputeKpiNow(selectedTargetId);
      setRecompute(res);
      if (res.failed > 0) {
        toast.warning(`Recomputed ${res.processed}, ${res.failed} failed.`);
      } else {
        toast.success(`Recomputed ${res.processed} period(s).`);
      }
    });
  };

  // Selected target's effective unit (override if the user just changed it).
  const selectedTarget =
    selectedTargetId != null ? targetsById.get(selectedTargetId) : undefined;
  const effectiveUnitId =
    selectedTargetId != null && selectedTargetId in unitOverrides
      ? unitOverrides[selectedTargetId]
      : (selectedTarget?.unitId ?? null);
  const effectiveUnitLabel =
    data.units.find((u) => u.id === effectiveUnitId)?.name ?? null;

  const handleChangeUom = (value: string) => {
    if (selectedTargetId == null) return;
    const unitId = Number(value);
    if (!value || !Number.isFinite(unitId)) return;
    setUnitOverrides((prev) => ({ ...prev, [selectedTargetId]: unitId }));
    startSave(async () => {
      const res = await updateTargetUom({
        mode: activeMode,
        ownerId: selectedTargetId,
        unitId,
      });
      if (!res.ok) toast.error(res.error ?? "Couldn't update the unit.");
      else
        toast.success(
          `Unit set to ${data.units.find((u) => u.id === unitId)?.name ?? "—"}.`,
        );
    });
  };

  return (
    <div className="space-y-4">
      {/* target selector */}
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-xs">What are you building?</Label>
              <div className="mt-1 flex w-fit items-center gap-1 rounded-md border p-1">
                <button
                  type="button"
                  onClick={() => handleModeSwitch("measure")}
                  className={cn(
                    "rounded px-3 py-1 text-sm font-medium transition",
                    activeMode === "measure"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  Calculated Measures
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch("kpi")}
                  className={cn(
                    "rounded px-3 py-1 text-sm font-medium transition",
                    activeMode === "kpi"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  KPIs
                </button>
              </div>
            </div>
            <div className="min-w-64 flex-1">
              <Label className="text-xs">
                {activeMode === "kpi" ? "KPI to build" : "Calculated measure to build"}
              </Label>
              <SearchableSelect
                value={
                  selectedTargetId != null ? String(selectedTargetId) : undefined
                }
                onValueChange={handleSelectTarget}
                options={filteredTargets.map((t) => {
                  const name = t.isProperlyConfigured
                    ? t.name
                    : t.hasFormula
                      ? `${t.name} — needs repair`
                      : `${t.name} — no formula`;
                  // Prefix the id (also makes the option searchable by id).
                  return { value: String(t.id), label: `${t.id} · ${name}` };
                })}
                placeholder={
                  activeMode === "kpi" ? "Select a KPI…" : "Select a measure…"
                }
                searchPlaceholder="Search…"
                emptyLabel="Nothing found."
                triggerClassName="mt-1 w-full"
                allowEscapeKeyPropagation={false}
              />
            </div>
            {selectedTargetId != null && (
              <div className="w-40">
                <Label className="text-xs">UoM</Label>
                <SearchableSelect
                  value={
                    effectiveUnitId != null ? String(effectiveUnitId) : undefined
                  }
                  onValueChange={handleChangeUom}
                  options={data.units.map((u) => ({
                    value: String(u.id),
                    label: u.name,
                  }))}
                  placeholder="Set unit…"
                  searchPlaceholder="Search units…"
                  emptyLabel="No units."
                  triggerClassName="mt-1 w-full"
                  allowEscapeKeyPropagation={false}
                />
              </div>
            )}
            <Label className="text-muted-foreground flex items-center gap-2 pb-1.5 text-xs">
              <Checkbox
                checked={onlyWithoutFormula}
                onCheckedChange={(c) => setOnlyWithoutFormula(c === true)}
              />
              <span className="max-w-[8.5rem] leading-snug">
                filter for calculations that need setup or repair
              </span>
            </Label>
          </div>
          {justSaved && (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Saved ✓ — still shown below. Keep editing, or pick another{" "}
              {activeMode === "kpi" ? "KPI" : "measure"} from the dropdown above.
            </p>
          )}
        </CardContent>
      </Card>

      {/* definition + formula */}
      <Card className="overflow-visible">
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold">Build formula</p>
            </div>
            {activeMode === "measure" && (
              <div className="flex flex-col items-end gap-1.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={trackAsKpi}
                  onClick={() => setTrackAsKpi((v) => !v)}
                  className="flex items-center gap-2 text-xs font-medium"
                >
                  Track as KPI
                  <span
                    className={cn(
                      "relative h-5 w-9 rounded-full transition-colors",
                      trackAsKpi ? "bg-amber-400" : "bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-4 rounded-full bg-white shadow transition-all",
                        trackAsKpi ? "left-[18px]" : "left-0.5",
                      )}
                    />
                  </span>
                </button>
              </div>
            )}
          </div>

          <div>
            <FormulaEditor
              formula={formula}
              onChange={handleFormulaChange}
              knownVariables={knownVariables}
              variableColors={variableColors}
              onNewVariable={(name) =>
                setCards((prev) =>
                  prev.some((c) => c.variableName === name)
                    ? prev
                    : [
                        ...prev,
                        {
                          key: nextCardKey(),
                          variableName: name,
                          measureDefId: null,
                          grainMode: "inherit",
                          dims: {},
                        },
                      ],
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* inputs = tag cards */}
      <Card className="overflow-visible">
        <CardContent className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">Inputs — a tag card per variable</p>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">
                <b>Pin</b> a slice, aggregate with <b>All</b>, or{" "}
                <b>Inherit</b> its scope
              </span>
              <span className="text-muted-foreground flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Pinned
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  All
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-slate-400" />
                  Inherit
                </span>
              </span>
            </div>
          </div>

          {cards.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Write a formula above — each variable you type gets its own input
              card here.
            </p>
          ) : (
            cards.map((card) => (
              <InputTagCard
                key={card.key}
                card={card}
                measure={
                  card.measureDefId != null
                    ? measuresById.get(card.measureDefId)
                    : undefined
                }
                dimMembers={data.dimMembers}
                onChange={(next) => updateCard(card.key, next)}
                onRename={(next) => handleRenameVariable(card, next)}
                onRemove={() => removeCard(card.key)}
                onPickMeasure={() => setPickerCardKey(card.key)}
                nameColor={variableColors[card.variableName]}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* test harness */}
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-bold">Test harness</p>
          <TestHarness
            formula={formula}
            variableNames={variables}
            variableColors={variableColors}
            unitLabel={effectiveUnitLabel}
            isCurrency={selectedTarget?.isCurrency ?? false}
          />
        </CardContent>
      </Card>

      {/* validation footer + actions */}
      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <Flag ok={bindingsResolved}>All bindings resolved</Flag>
            <Flag ok={!!formula.trim()}>Formula present</Flag>
            <Flag ok={validationErrors.length === 0}>Ready to save</Flag>
          </div>
          {validationErrors.length > 0 && selectedTargetId != null && (
            <ul className="text-destructive space-y-0.5 text-xs">
              {validationErrors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSave}
              disabled={isSaving || isComputing || !canSave}
            >
              {isSaving ? "Saving…" : "Save"}
            </Button>
            {!(
              activeMode === "kpi" &&
              (isPassThroughKpi || isDescriptiveProjection)
            ) && (
              <Button
                type="button"
                onClick={handleSaveAndCompute}
                disabled={isSaving || isComputing || !canSave}
                title="Save the formula and immediately compute it across all prior and current periods"
              >
                {computeProgress
                  ? `Computing ${computeProgress.done}/${computeProgress.total}…`
                  : isSaving || isComputing
                    ? "Working…"
                    : "Save & Compute"}
              </Button>
            )}
            {!(activeMode === "kpi" && isPassThroughKpi) && (
              <Button
                type="button"
                variant="outline"
                onClick={handleCompute}
                disabled={
                  isComputing ||
                  (activeMode === "kpi" && selectedTargetId == null) ||
                  (activeMode === "kpi" && isDescriptiveProjection)
                }
              >
                {computeProgress
                  ? `Computing ${computeProgress.done}/${computeProgress.total}…`
                  : isComputing
                    ? "Computing…"
                    : activeMode === "kpi"
                      ? "Compute now"
                      : "Apply to previous and current periods"}
              </Button>
            )}
            {computeProgress && (
              <div
                className="ml-2 flex min-w-[10rem] flex-1 items-center gap-2"
                aria-live="polite"
              >
                <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        computeProgress.total > 0
                          ? (computeProgress.done / computeProgress.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {computeProgress.total > 0
                    ? Math.round(
                        (computeProgress.done / computeProgress.total) * 100,
                      )
                    : 0}
                  %
                </span>
              </div>
            )}
          </div>
          {computeProgress && (
            <p className="text-muted-foreground text-[11px] leading-snug">
              Computing period{" "}
              {Math.min(computeProgress.done + 1, computeProgress.total)} of{" "}
              {computeProgress.total} — runs in the background across all periods;
              results fill in below as each batch completes. You can keep this tab
              open.
            </p>
          )}

          {activeMode === "kpi" &&
            isDescriptiveProjection &&
            !isPassThroughKpi && (
              <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
                <b className="text-foreground">Descriptive KPI</b> — this
                publishes an entered value by reference
                {descriptiveInputs[0] ? (
                  <>
                    {" "}
                    (
                    <b className="text-foreground">
                      {descriptiveInputs[0].name}
                    </b>
                    , a {descriptiveInputs[0].dataTypeName} measure)
                  </>
                ) : null}
                . It isn&rsquo;t numerically computed, so there&rsquo;s nothing
                to Compute — just <b className="text-foreground">Save</b> the
                reference.
              </p>
            )}

          {activeMode === "kpi" && isPassThroughKpi && (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
              <b className="text-foreground">Pass-through KPI</b> — this mirrors{" "}
              <b className="text-foreground">{passThroughMeasure?.name}</b>. It
              publishes automatically when that measure is computed, so
              there&rsquo;s nothing to compute here — just{" "}
              <b className="text-foreground">Save</b>.
            </p>
          )}

          {recompute && (
            <div className="bg-muted/30 rounded-lg border p-3">
              <p className="mb-2 text-xs font-semibold">
                Recompute · {recompute.processed} processed ·{" "}
                {recompute.failed} failed
                {computeProgress ? " · computing…" : ""}
              </p>
              <div className="max-h-48 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <SortableTh
                        label="Period"
                        col="period"
                        sort={resultSort}
                        onSort={toggleResultSort}
                        className="pr-3"
                      />
                      <SortableTh
                        label="Status"
                        col="status"
                        sort={resultSort}
                        onSort={toggleResultSort}
                        className="pr-3"
                      />
                      <SortableTh
                        label="Value"
                        col="value"
                        sort={resultSort}
                        onSort={toggleResultSort}
                        className="pr-3"
                      />
                      <SortableTh
                        label="Reason"
                        col="reason"
                        sort={resultSort}
                        onSort={toggleResultSort}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedByPeriod.map((r) => (
                      <tr key={r.reportPeriodId} className="border-t">
                        <td className="py-1 pr-3 tabular-nums">
                          {r.reportPeriodId}
                        </td>
                        <td className="py-1 pr-3">
                          <Badge
                            variant={
                              r.status === "ok" ? "secondary" : "destructive"
                            }
                          >
                            {r.status}
                          </Badge>
                        </td>
                        <td className="py-1 pr-3 font-mono tabular-nums">
                          {r.value ?? "—"}
                        </td>
                        <td className="text-muted-foreground py-1">
                          <div className="flex items-center justify-between gap-2">
                            <span>{r.reason ?? ""}</span>
                            {selectedTargetId != null && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCoveragePeriod(r.reportPeriodId)
                                }
                                className={cn(
                                  "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline",
                                  r.status === "ok"
                                    ? "text-muted-foreground"
                                    : "text-primary",
                                )}
                                title="Which generators (units) are missing which inputs, for this period"
                              >
                                {r.status === "ok" ? "coverage" : "which units?"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <MeasurePickerModal
        open={pickerCardKey != null}
        onOpenChange={(o) => {
          if (!o) setPickerCardKey(null);
        }}
        measures={data.measures}
        onPick={handlePickMeasure}
        variableName={
          cards.find((c) => c.key === pickerCardKey)?.variableName ?? null
        }
      />

      <InputCoverageModal
        open={coveragePeriod != null}
        onOpenChange={(o) => {
          if (!o) setCoveragePeriod(null);
        }}
        ownerKind={activeMode}
        ownerId={selectedTargetId}
        reportPeriodId={coveragePeriod}
        ownerName={selectedTarget?.name}
      />
    </div>
  );
}

function SortableTh({
  label,
  col,
  sort,
  onSort,
  className,
}: {
  label: string;
  col: ResultSortCol;
  sort: ResultSortState;
  onSort: (col: ResultSortCol) => void;
  className?: string;
}) {
  const active = sort.col === col;
  return (
    <th
      className={cn("py-1 font-medium", className)}
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className="hover:text-foreground -mx-1 flex items-center gap-1 rounded px-1 font-medium"
        title={`Sort by ${label}`}
      >
        {label}
        <span
          aria-hidden
          className={cn(
            "text-[9px] leading-none",
            active ? "opacity-90" : "opacity-30",
          )}
        >
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "▲"}
        </span>
      </button>
    </th>
  );
}

function Flag({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5",
        ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
      )}
    >
      <span aria-hidden>{ok ? "✓" : "○"}</span>
      {children}
    </span>
  );
}

export default UnifiedFormulaBuilder;
