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
  planCalculatedMeasureCompute,
  computeCalculatedMeasureChunk,
  planKpiCompute,
  computeKpiChunk,
  updateTargetUom,
  renameFormulaTarget,
} from "@/app/settings/kpi/unified-formula-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";

import { FormulaEditor, formulaVariables } from "./FormulaEditor";
import { InputTagCard } from "./InputTagCard";
import { MeasurePickerModal } from "./MeasurePickerModal";
import { InputCoverageModal } from "./InputCoverageModal";
import {
  getPeriodsCoverageSummary,
  type PeriodCoverageSummary,
} from "@/app/settings/kpi/input-coverage-service";
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

/** Canonical signature of the builder's editable state — comparing the current
 *  signature to the last saved/loaded one tells us whether there are unsaved
 *  edits (which drives the adaptive Save & Compute / Recompute button). */
function builderStateSignature(formula: string, cards: TagCardState[]): string {
  return JSON.stringify({
    f: formula.trim(),
    c: cards.map((c) => ({
      v: c.variableName,
      m: c.measureDefId ?? null,
      g: c.grainMode,
      o: !!c.isOptional,
      d: Object.fromEntries(
        Object.entries(c.dims)
          .filter(([, b]) => b != null)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, b]) => [k, { mode: b!.mode, member: b!.memberId ?? null }]),
      ),
    })),
  });
}

// Per-formula compute results (counter block + reason table + bar), persisted so
// the previous recompute's stats are always shown when you re-open a formula —
// even after a page refresh (Eugene). Keyed "<mode>:<targetId>". localStorage is
// a convenience: every access is guarded, and it is only ever touched from
// client effects (never during render / SSR).
type ResultsCacheEntry = {
  recompute: RecomputeResult;
  progress: { done: number; total: number } | null;
};
const RESULTS_CACHE_KEY = "prism.calc.results.v1";
function loadResultsCache(): Map<string, ResultsCacheEntry> {
  try {
    const raw = localStorage.getItem(RESULTS_CACHE_KEY);
    if (!raw) return new Map();
    return new Map(
      Object.entries(JSON.parse(raw) as Record<string, ResultsCacheEntry>),
    );
  } catch {
    return new Map();
  }
}
function saveResultsCache(map: Map<string, ResultsCacheEntry>): void {
  try {
    localStorage.setItem(
      RESULTS_CACHE_KEY,
      JSON.stringify(Object.fromEntries(map)),
    );
  } catch {
    // quota exceeded / private mode — retention is a convenience, never critical
  }
}

export function UnifiedFormulaBuilder({ data, mode }: UnifiedFormulaBuilderProps) {
  const [activeMode, setActiveMode] = useState<BuilderMode>(mode);
  const rawTargets =
    activeMode === "kpi" ? data.kpiTargets : data.measureTargets;
  // Local display-name overrides so an inline rename shows immediately (keyed
  // "<mode>:<id>") without waiting for a full reload.
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>(
    {},
  );
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [isRenaming, startRename] = useTransition();
  const targets = useMemo(
    () =>
      rawTargets.map((t) => {
        const ov = nameOverrides[`${activeMode}:${t.id}`];
        return ov ? { ...t, name: ov } : t;
      }),
    [rawTargets, nameOverrides, activeMode],
  );
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [formula, setFormula] = useState("");
  const [cards, setCards] = useState<TagCardState[]>([]);
  const [onlyWithoutFormula, setOnlyWithoutFormula] = useState(false);
  const [trackAsKpi, setTrackAsKpi] = useState(false);
  const [pickerCardKey, setPickerCardKey] = useState<string | null>(null);
  const [recompute, setRecompute] = useState<RecomputeResult | null>(null);
  // Report period whose per-unit input coverage the diagnostic modal shows.
  const [coveragePeriod, setCoveragePeriod] = useState<number | null>(null);
  // Per-period "N units blank" totals for the inline badge in the reason table
  // (batched; fetched once a recompute settles), keyed by report period id.
  const [coverageSummary, setCoverageSummary] = useState<
    Map<number, PeriodCoverageSummary>
  >(new Map());
  // Chunked calculated-measure compute progress ("period X of N"). null = idle.
  const [computeProgress, setComputeProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  // Signature of the last saved/loaded state; when the current state differs
  // there are unsaved edits — the compute button then offers Save & Compute
  // (persist + backfill), otherwise Recompute all periods (backfill only).
  const [savedSig, setSavedSig] = useState<string>(() =>
    builderStateSignature("", []),
  );
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
  // Per-target cache of the last compute's stats (counter block + reason table +
  // progress bar), so re-opening a formula shows its previous recompute — kept
  // until it is recomputed, and persisted to localStorage so it survives a page
  // refresh (Eugene). A ref (not state) so writing it never re-renders or
  // re-feeds the settle effect; hydrated from localStorage on mount below.
  const resultsByTarget = useRef<Map<string, ResultsCacheEntry>>(new Map());
  useEffect(() => {
    // Hydrate the cache from localStorage after mount (client-only — never
    // during SSR/render). Selecting a target reads the ref, so it is ready.
    resultsByTarget.current = loadResultsCache();
  }, []);
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

  // Once a recompute settles (not mid-flight), fetch per-period unit-coverage
  // totals so the reason table can badge "N units blank" inline without opening
  // the modal. Batched — one query for all periods, so it stays cheap.
  useEffect(() => {
    if (selectedTargetId == null || !recompute || isSaving || isComputing) {
      return;
    }
    // Retain this settled run for the target so re-selecting it restores the
    // counter block + reason table + bar (until it is recomputed).
    resultsByTarget.current.set(`${activeMode}:${selectedTargetId}`, {
      recompute,
      progress: computeProgress,
    });
    saveResultsCache(resultsByTarget.current);
    const periodIds = recompute.byPeriod.map((p) => p.reportPeriodId);
    if (periodIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await getPeriodsCoverageSummary({
          ownerKind: activeMode,
          ownerId: selectedTargetId,
          reportPeriodIds: periodIds,
        });
        if (!cancelled) {
          setCoverageSummary(new Map(rows.map((r) => [r.reportPeriodId, r])));
        }
      } catch {
        // diagnostic only — a coverage-summary failure must not disrupt the table
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    recompute,
    computeProgress,
    selectedTargetId,
    activeMode,
    isSaving,
    isComputing,
  ]);

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
    // Restore this formula's last compute stats (counter block + reason table +
    // bar) if it has any — so its results persist across target switches until
    // it is recomputed. Coverage badges re-derive via the settle effect.
    const cached = resultsByTarget.current.get(`${activeMode}:${id}`);
    setRecompute(cached?.recompute ?? null);
    setCoverageSummary(new Map());
    setComputeProgress(cached?.progress ?? null);
    setJustSaved(false);
    setRenaming(false);
    setSavedSig(
      builderStateSignature(target?.formula ?? "", target?.existingCards ?? []),
    );
  };

  const handleModeSwitch = (next: BuilderMode) => {
    if (next === activeMode) return;
    setActiveMode(next);
    setSelectedTargetId(null);
    setFormula("");
    setCards([]);
    setRecompute(null);
    setCoverageSummary(new Map());
    setComputeProgress(null);
    setJustSaved(false);
    setRenaming(false);
    setSavedSig(builderStateSignature("", []));
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
    // Show the bar for the WHOLE run, including the save + planning window before
    // the period count is known: start INDETERMINATE (total 0 → animated bar),
    // then flip to the determinate count once the plan resolves. Without this the
    // buttons read "Working…" with no bar during save/plan (the reported gap).
    // Cleared in `finally` so it never sticks on error or early-exit.
    setComputeProgress((p) => p ?? { done: 0, total: 0 });
    setRecompute({ processed: 0, failed: 0, byPeriod: [] });
    try {
      // Scope the whole run to the selected measure — compute + KPI republish
      // touch only it, not every calculated measure. (No selection ⇒ whole set.)
      const plan = await planCalculatedMeasureCompute(focusId);
      const total = plan.periodIds.length;
      if (total === 0) {
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
      return { total, calculated, skipped, errors };
    } finally {
      // Keep the bar visible until the target changes (Eugene): a determinate
      // bar (100% on success, or partial on error) STAYS as the record of the
      // last backfill; only the indeterminate "preparing" state (total 0 —
      // planning failed or no periods) is cleared. Cleared for real in
      // handleSelectTarget / handleModeSwitch.
      setComputeProgress((p) => (p && p.total > 0 ? p : null));
    }
  };

  // KPI equivalent of runChunkedMeasureCompute: the KPI backfill must ALSO show
  // the progress bar (Eugene: the bar is a required part of showing backfill
  // compute for both calculated inputs AND KPIs). recomputeKpiNow does a heavy
  // one-shot refresh of upstream measures across ALL periods then computes; here
  // we chunk it — planKpiCompute gives the participating periods (+ whether to
  // refresh measures), and computeKpiChunk does the refresh + KPI compute per
  // batch, streaming per-period status into the reason table. No worker change.
  const runChunkedKpiCompute = async (
    kpiDefId: number,
  ): Promise<RecomputeResult> => {
    setComputeProgress((p) => p ?? { done: 0, total: 0 });
    setRecompute({ processed: 0, failed: 0, byPeriod: [] });
    try {
      const plan = await planKpiCompute(kpiDefId);
      const total = plan.periodIds.length;
      if (total === 0) {
        return { processed: 0, failed: 0, byPeriod: [] };
      }
      setComputeProgress({ done: 0, total });
      const accum: RecomputeResult["byPeriod"] = [];
      let processed = 0;
      let failed = 0;
      let done = 0;
      for (let i = 0; i < plan.periodIds.length; i += CHUNK_SIZE) {
        const chunk = plan.periodIds.slice(i, i + CHUNK_SIZE);
        const c = await computeKpiChunk({
          kpiDefId,
          reportPeriodIds: chunk,
          refreshMeasures: plan.refreshMeasures,
        });
        processed += c.processed;
        failed += c.failed;
        if (c.byPeriod.length) accum.push(...c.byPeriod);
        done += chunk.length;
        setComputeProgress({ done, total });
        const snapshot = [...accum];
        setRecompute({
          processed: snapshot.filter((p) => p.status === "ok").length,
          failed: snapshot.filter((p) => p.status !== "ok").length,
          byPeriod: snapshot,
        });
      }
      return { processed, failed, byPeriod: accum };
    } finally {
      setComputeProgress((p) => (p && p.total > 0 ? p : null));
    }
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
        setSavedSig(builderStateSignature(formula, cards));
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
      // Show the bar for the whole run — BOTH calculated-measure and KPI backfill
      // (Eugene: the progress bar is a required part of showing backfill compute
      // regardless of target type). Set it indeterminate up front so it's visible
      // during the save + planning window, not just once the first chunk lands.
      setComputeProgress({ done: 0, total: 0 });
      const res = await saveUnifiedFormula(payload);
      if (!res.ok) {
        setComputeProgress(null);
        toast.error(res.error ?? "Save failed.");
        return;
      }
      setJustSaved(true);
      setSavedSig(builderStateSignature(formula, cards));
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
        // KPI backfill — same chunked bar (streams per-period status into the
        // reason table); runChunkedKpiCompute sets `recompute` as it goes.
        const c = await runChunkedKpiCompute(targetId);
        const attempted = c.processed + c.failed;
        if (attempted === 0) {
          toast.warning("Saved ✓ · no report periods to compute.");
        } else if (c.failed > 0) {
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
      // KPI backfill — chunked with the same progress bar; streams per-period
      // status into the reason table as each batch lands.
      const res = await runChunkedKpiCompute(selectedTargetId);
      const attempted = res.processed + res.failed;
      if (attempted === 0) {
        toast.warning("No report periods to compute.");
      } else if (res.failed > 0) {
        toast.warning(`Recomputed ${res.processed}, ${res.failed} failed.`);
      } else {
        toast.success(`Recomputed ${res.processed} period(s).`);
      }
    });
  };

  // Unsaved edits? Drives the adaptive compute button: dirty ⇒ Save & Compute
  // (persist then backfill), clean ⇒ Recompute all periods (backfill only, so
  // it never silently computes with a stale saved formula).
  const isDirty = builderStateSignature(formula, cards) !== savedSig;

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

  const startRenaming = () => {
    if (selectedTargetId == null || !selectedTarget) return;
    setNameDraft(selectedTarget.name);
    setRenaming(true);
  };
  const commitRename = () => {
    if (selectedTargetId == null) return;
    const name = nameDraft.trim();
    if (!name || name === (selectedTarget?.name ?? "")) {
      setRenaming(false);
      return;
    }
    const ownerId = selectedTargetId;
    const mode = activeMode;
    startRename(() => {
      void (async () => {
        const res = await renameFormulaTarget({ mode, ownerId, name });
        if (!res.ok) {
          toast.error(res.error ?? "Rename failed.");
          return;
        }
        setNameOverrides((prev) => ({ ...prev, [`${mode}:${ownerId}`]: name }));
        setRenaming(false);
        toast.success("Renamed ✓");
      })();
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
              {selectedTargetId != null &&
                (renaming ? (
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      value={nameDraft}
                      autoFocus
                      placeholder="Name"
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenaming(false);
                      }}
                      className="h-8"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8"
                      onClick={commitRename}
                      disabled={isRenaming}
                    >
                      {isRenaming ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => setRenaming(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startRenaming}
                    className="text-muted-foreground mt-1 text-xs underline-offset-2 hover:underline"
                    title={`Rename this ${activeMode === "kpi" ? "KPI" : "calculated measure"}`}
                  >
                    &#9998; Rename this {activeMode === "kpi" ? "KPI" : "measure"}
                  </button>
                ))}
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
            <p className="text-xs font-medium text-success dark:text-success">
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
                  <span className="size-1.5 rounded-full bg-success" />
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
            {/* One adaptive compute button: while there are unsaved edits it
                persists them first (Save & Compute); once clean it re-runs the
                same backfill (Recompute all periods) without re-saving — so it
                never computes with a stale formula, and there's no confusing
                near-duplicate pair. Hidden for KPIs that never compute
                (pass-through / descriptive projections). */}
            {!(
              activeMode === "kpi" &&
              (isPassThroughKpi || isDescriptiveProjection)
            ) && (
              <Button
                type="button"
                variant={isDirty ? "default" : "outline"}
                onClick={isDirty ? handleSaveAndCompute : handleCompute}
                disabled={
                  isSaving ||
                  isComputing ||
                  (isDirty
                    ? !canSave
                    : activeMode === "kpi" && selectedTargetId == null)
                }
                title={
                  isDirty
                    ? "Save the formula and compute it across all prior and current periods"
                    : "Recompute this formula across all prior and current periods (no unsaved changes to save)"
                }
              >
                {isSaving || isComputing
                  ? "Computing…"
                  : isDirty
                    ? "Save & Compute"
                    : "Recompute all periods"}
              </Button>
            )}
            {(computeProgress || recompute) && (
              <div className="ml-auto flex items-center gap-3">
                {computeProgress && (
                  <div className="flex items-center gap-2" aria-live="polite">
                    <div className="bg-muted h-2 w-[28rem] max-w-[45vw] overflow-hidden rounded-full">
                      {computeProgress.total > 0 ? (
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${
                              (computeProgress.done / computeProgress.total) *
                              100
                            }%`,
                          }}
                        />
                      ) : (
                        // Indeterminate (save + planning, before the count is known).
                        <div className="bg-primary/60 h-full w-full animate-pulse rounded-full" />
                      )}
                    </div>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {computeProgress.total > 0
                        ? `${Math.round(
                            (computeProgress.done / computeProgress.total) * 100,
                          )}%`
                        : "…"}
                    </span>
                  </div>
                )}
                {recompute &&
                  (() => {
                    // processed = attempted so far = successful + failed;
                    // total = the full period count (from the progress plan).
                    const successful = recompute.processed;
                    const failed = recompute.failed;
                    const processed = successful + failed;
                    const total =
                      computeProgress && computeProgress.total > 0
                        ? computeProgress.total
                        : processed;
                    const cols: {
                      label: string;
                      value: number;
                      cls?: string;
                    }[] = [
                      { label: "Total", value: total },
                      { label: "Processed", value: processed },
                      {
                        label: "Successful",
                        value: successful,
                        cls: "text-success",
                      },
                      {
                        label: "Failed",
                        value: failed,
                        cls: failed > 0 ? "text-destructive" : undefined,
                      },
                    ];
                    return (
                      <div className="flex items-center gap-3 text-center">
                        {cols.map((c) => (
                          <div key={c.label} className="leading-tight">
                            <div className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                              {c.label}
                            </div>
                            <div
                              className={cn(
                                "text-sm font-semibold tabular-nums",
                                c.cls,
                              )}
                            >
                              {c.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
              </div>
            )}
          </div>
          {computeProgress && (
            <p className="text-muted-foreground text-[11px] leading-snug">
              {computeProgress.total > 0 ? (
                computeProgress.done >= computeProgress.total ? (
                  <>
                    Computed all {computeProgress.total} period(s) — results
                    below. Kept for this formula until you recompute it.
                  </>
                ) : (
                  <>
                    Computing period{" "}
                    {Math.min(computeProgress.done + 1, computeProgress.total)} of{" "}
                    {computeProgress.total} — runs in the background across all
                    periods; results fill in below as each batch completes. You
                    can keep this tab open.
                  </>
                )
              ) : (
                <>Saving &amp; preparing the periods to compute…</>
              )}
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
              <div className="max-h-48 overflow-auto">
                {/* Full-width: the Reason column (w-full) soaks up the slack so
                    Period/Status/Value stay tight on the left and the Coverage
                    column sits at the far right. */}
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
                        className="w-full"
                      />
                      <th className="bg-muted sticky top-0 z-10 py-1 pr-2 pl-3 text-left font-medium whitespace-nowrap">
                        Coverage
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedByPeriod.map((r) => {
                      // Three-state status: a row that computed a value but has
                      // some mandatory generator inputs still missing is
                      // "incomplete" (computed on partial data), not "failed".
                      const missing =
                        coverageSummary.get(r.reportPeriodId)?.missingUnits ?? 0;
                      const computed = r.status === "ok";
                      const effStatus = computed
                        ? missing > 0
                          ? "incomplete"
                          : "ok"
                        : "failed";
                      return (
                        <tr key={r.reportPeriodId} className="border-t">
                          <td className="py-1 pr-3 tabular-nums">
                            {r.reportPeriodId}
                          </td>
                          <td className="py-1 pr-3">
                            <Badge
                              variant="outline"
                              className={cn(
                                "capitalize",
                                effStatus === "ok" &&
                                  "border-success/40 bg-success/10 text-success",
                                effStatus === "incomplete" &&
                                  "border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-300",
                                effStatus === "failed" &&
                                  "border-destructive/40 bg-destructive/10 text-destructive",
                              )}
                              title={
                                effStatus === "incomplete"
                                  ? `Computed on partial data — ${missing} generator(s) missing a required input`
                                  : undefined
                              }
                            >
                              {effStatus}
                            </Badge>
                          </td>
                        <td className="py-1 pr-3 font-mono tabular-nums">
                          {r.value ?? "—"}
                        </td>
                        <td className="text-muted-foreground w-full py-1 pr-3">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate">{r.reason ?? ""}</span>
                            {(() => {
                              const s = coverageSummary.get(r.reportPeriodId);
                              return s && s.missingUnits > 0 ? (
                                <span
                                  className="shrink-0 rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
                                  title={`${s.missingUnits} of ${s.totalUnits} generator(s) missing a required input this period`}
                                >
                                  {s.missingUnits} not entered
                                </span>
                              ) : null;
                            })()}
                          </span>
                        </td>
                        <td className="py-1 pr-2 pl-3 text-left whitespace-nowrap">
                          {selectedTargetId != null && (
                            <button
                              type="button"
                              onClick={() => setCoveragePeriod(r.reportPeriodId)}
                              className={cn(
                                "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline",
                                computed
                                  ? "text-muted-foreground"
                                  : "text-primary",
                              )}
                              title="Which generators (units) are missing which inputs, for this period"
                            >
                              {computed ? "coverage" : "which units?"}
                            </button>
                          )}
                        </td>
                        </tr>
                      );
                    })}
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
        computed={
          coveragePeriod != null &&
          (recompute?.byPeriod.find(
            (bp) => bp.reportPeriodId === coveragePeriod,
          )?.status ?? "") === "ok"
        }
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
      className={cn("bg-muted sticky top-0 z-10 py-1 font-medium", className)}
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
        ok ? "text-success dark:text-success" : "text-muted-foreground",
      )}
    >
      <span aria-hidden>{ok ? "✓" : "○"}</span>
      {children}
    </span>
  );
}

export default UnifiedFormulaBuilder;
