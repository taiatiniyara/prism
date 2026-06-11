"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Lock,
  Palette,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  fetchKpiOptions,
  fetchScorecard,
  fetchTemplate,
  fetchTheme,
  savePerspectiveOverlay,
  saveTheme,
  saveTrajectory,
} from "@/app/data-entry/balanced-scorecard/new-bsc/client";
import {
  generateThemeCss,
  STYLEABLE_ELEMENTS,
} from "@/app/data-entry/balanced-scorecard/new-bsc/theme";
import NewBscKpiTargets from "@/components/data-entry/new-bsc-kpi-targets";
import type {
  BscActivityKind,
  BscProjectStatus,
  BscTemplateLevel,
  BscThemeStyles,
  KpiOption,
  KpiTrajectory,
  OverlayNodeInput,
  ScorecardNode,
  TemplateNode,
} from "@/app/data-entry/balanced-scorecard/new-bsc/types";
import type { BscElementStyle } from "@/db/schema/bsc-builder";

// ---------------------------------------------------------------------------
// Working-tree model (template merged with the utility's overlay)
// ---------------------------------------------------------------------------

type WorkingKpi = {
  key: string;
  kpiDefinitionId: number | null;
  kpiName: string | null;
  pendingCustomKpiRequestId: string | null;
  trajectory: KpiTrajectory | null;
};

type WorkingInitiative = {
  key: string;
  title: string;
  description: string | null;
  kind: BscActivityKind;
  startDate: string | null;
  targetCompletionDate: string | null;
  status: BscProjectStatus | null;
  kpis: WorkingKpi[];
};

const PROJECT_STATUS_LABEL: Record<BscProjectStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  complete: "Complete",
  on_hold: "On hold",
};

type WorkingObjective = {
  key: string;
  description: string;
  initiatives: WorkingInitiative[];
};

type WorkingNode = {
  key: string;
  templateNodeId: string | null;
  level: BscTemplateLevel;
  label: string;
  isMandatory: boolean;
  isCustom: boolean;
  selected: boolean;
  children: WorkingNode[];
  specificObjectives: WorkingObjective[];
};

const CHILD_LEVEL: Record<BscTemplateLevel, BscTemplateLevel | null> = {
  perspective: "overall_objective",
  overall_objective: "key_focus_area",
  key_focus_area: "strategic_objective",
  strategic_objective: "strategic_lever",
  strategic_lever: null,
};

const LEVEL_LABEL: Record<BscTemplateLevel, string> = {
  perspective: "Perspective",
  overall_objective: "Overall Objective",
  key_focus_area: "Key Focus Area",
  strategic_objective: "Strategic Objective",
  strategic_lever: "Strategic Lever",
};

const TRAJECTORY_LABEL: Record<KpiTrajectory, string> = {
  increase: "Increase ↑",
  decrease: "Decrease ↓",
  same: "Maintain →",
};

const genKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Math.round(performance.now())}-${Math.floor(performance.now())}`;

// --- Build working tree from template + scorecard overlay -------------------

const mapObjectives = (
  objectives: ScorecardNode["specificObjectives"],
): WorkingObjective[] =>
  objectives.map((objective) => ({
    key: genKey(),
    description: objective.description,
    initiatives: objective.initiatives.map((initiative) => ({
      key: genKey(),
      title: initiative.title,
      description: initiative.description,
      kind: initiative.kind,
      startDate: initiative.startDate,
      targetCompletionDate: initiative.targetCompletionDate,
      status: initiative.status,
      kpis: initiative.kpis.map((kpi) => ({
        key: genKey(),
        kpiDefinitionId: kpi.kpiDefinitionId,
        kpiName: kpi.kpiName,
        pendingCustomKpiRequestId: kpi.pendingCustomKpiRequestId,
        trajectory: kpi.trajectory,
      })),
    })),
  }));

const fromScorecard = (node: ScorecardNode): WorkingNode => ({
  key: genKey(),
  templateNodeId: null,
  level: node.level,
  label: node.label,
  isMandatory: false,
  isCustom: true,
  selected: true,
  children: node.children.map(fromScorecard),
  specificObjectives: mapObjectives(node.specificObjectives),
});

const mergeChildren = (
  template: TemplateNode[],
  scorecard: ScorecardNode[],
): WorkingNode[] => {
  const scByTemplateId = new Map(
    scorecard
      .filter((node) => node.templateNodeId != null)
      .map((node) => [node.templateNodeId as string, node]),
  );

  const merged: WorkingNode[] = template.map((tmpl) => {
    const match = scByTemplateId.get(tmpl.id);
    return {
      key: genKey(),
      templateNodeId: tmpl.id,
      level: tmpl.level,
      label: tmpl.label,
      isMandatory: tmpl.isMandatory,
      isCustom: false,
      selected: tmpl.isMandatory || match != null,
      children: mergeChildren(tmpl.children, match ? match.children : []),
      specificObjectives: match ? mapObjectives(match.specificObjectives) : [],
    };
  });

  const customs = scorecard
    .filter((node) => node.templateNodeId == null)
    .map(fromScorecard);

  return [...merged, ...customs];
};

// --- Serialize a perspective subtree for save (selected-only) ---------------

const serializeNode = (node: WorkingNode, ord: number): OverlayNodeInput => ({
  templateNodeId: node.templateNodeId,
  label: node.isCustom ? node.label : null,
  level: node.level,
  ord,
  children: node.children
    .filter((child) => child.selected)
    .map((child, index) => serializeNode(child, index)),
  specificObjectives:
    node.level === "strategic_lever"
      ? node.specificObjectives.map((objective, oi) => ({
          description: objective.description,
          ord: oi,
          initiatives: objective.initiatives.map((initiative, ii) => ({
            title: initiative.title,
            description: initiative.description,
            kind: initiative.kind,
            startDate: initiative.startDate,
            targetCompletionDate: initiative.targetCompletionDate,
            status: initiative.status,
            ord: ii,
            kpis: initiative.kpis
              .filter(
                (kpi) =>
                  kpi.kpiDefinitionId != null ||
                  kpi.pendingCustomKpiRequestId != null,
              )
              .map((kpi, ki) => ({
                kpiDefinitionId: kpi.kpiDefinitionId,
                pendingCustomKpiRequestId: kpi.pendingCustomKpiRequestId,
                ord: ki,
              })),
          })),
        }))
      : [],
});

// --- Immutable tree helpers -------------------------------------------------

const updateNodeByKey = (
  nodes: WorkingNode[],
  key: string,
  fn: (node: WorkingNode) => WorkingNode,
): WorkingNode[] =>
  nodes.map((node) =>
    node.key === key
      ? fn(node)
      : { ...node, children: updateNodeByKey(node.children, key, fn) },
  );

const selectPath = (
  nodes: WorkingNode[],
  key: string,
): { next: WorkingNode[]; found: boolean } => {
  let found = false;
  const next = nodes.map((node) => {
    if (node.key === key) {
      found = true;
      return { ...node, selected: true };
    }
    const result = selectPath(node.children, key);
    if (result.found) {
      found = true;
      return { ...node, selected: true, children: result.next };
    }
    return node;
  });
  return { next, found };
};

const deselectSubtree = (node: WorkingNode): WorkingNode => ({
  ...node,
  selected: false,
  specificObjectives: [],
  children: node.children.map(deselectSubtree),
});

const nodeHasContent = (node: WorkingNode): boolean =>
  node.specificObjectives.length > 0 ||
  node.children.some((child) => child.selected || nodeHasContent(child));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type PendingDeselect = { perspectiveKey: string; nodeKey: string; label: string };

export default function NewBscBuilder({
  canBuild = true,
}: {
  canBuild?: boolean;
}) {
  const [perspectives, setPerspectives] = useState<WorkingNode[] | null>(null);
  const [kpiOptions, setKpiOptions] = useState<KpiOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"build" | "preview">("build");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [targetsOpen, setTargetsOpen] = useState<Set<string>>(new Set());
  const [pendingDeselect, setPendingDeselect] =
    useState<PendingDeselect | null>(null);

  // DEV-only styling theme.
  const [themeStyles, setThemeStyles] = useState<BscThemeStyles>({});
  const [canEditTheme, setCanEditTheme] = useState(false);
  const [designMode, setDesignMode] = useState(false);
  const [selectedEl, setSelectedEl] = useState<string>(
    STYLEABLE_ELEMENTS[0].id,
  );

  const perspectivesRef = useRef<WorkingNode[] | null>(null);
  const themeRef = useRef<BscThemeStyles>({});
  const themeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    perspectivesRef.current = perspectives;
  }, [perspectives]);

  useEffect(() => {
    themeRef.current = themeStyles;
  }, [themeStyles]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [template, scorecard, options, theme] = await Promise.all([
          fetchTemplate(),
          fetchScorecard(),
          fetchKpiOptions().catch(() => [] as KpiOption[]),
          fetchTheme().catch(() => ({ styles: {}, canEdit: false })),
        ]);
        if (!active) return;
        setPerspectives(mergeChildren(template.nodes, scorecard.perspectives));
        setKpiOptions(options);
        setThemeStyles(theme.styles);
        setCanEditTheme(theme.canEdit);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load BSC.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const themeCss = useMemo(() => generateThemeCss(themeStyles), [themeStyles]);

  const scheduleThemeSave = useCallback(() => {
    if (themeSaveTimer.current) clearTimeout(themeSaveTimer.current);
    themeSaveTimer.current = setTimeout(() => {
      void saveTheme(themeRef.current).catch((err) =>
        toast.error(
          err instanceof Error ? err.message : "Failed to save theme.",
        ),
      );
    }, 800);
  }, []);

  const updateElementStyle = useCallback(
    (elId: string, patch: Partial<BscElementStyle>) => {
      setThemeStyles((prev) => {
        const merged: BscElementStyle = { ...(prev[elId] ?? {}), ...patch };
        (Object.keys(merged) as (keyof BscElementStyle)[]).forEach((key) => {
          if (merged[key] == null) delete merged[key];
        });
        const next = { ...prev };
        if (Object.keys(merged).length === 0) delete next[elId];
        else next[elId] = merged;
        return next;
      });
      scheduleThemeSave();
    },
    [scheduleThemeSave],
  );

  const resetElementStyle = useCallback(
    (elId: string) => {
      setThemeStyles((prev) => {
        const next = { ...prev };
        delete next[elId];
        return next;
      });
      scheduleThemeSave();
    },
    [scheduleThemeSave],
  );

  const kpiSelectOptions = useMemo(
    () =>
      kpiOptions.map((option) => ({
        value: String(option.kpiDefinitionId),
        label: option.name,
      })),
    [kpiOptions],
  );

  const scheduleSave = useCallback((perspectiveKey: string) => {
    const timers = saveTimers.current;
    const existing = timers.get(perspectiveKey);
    if (existing) clearTimeout(existing);
    timers.set(
      perspectiveKey,
      setTimeout(() => {
        const current = perspectivesRef.current?.find(
          (node) => node.key === perspectiveKey,
        );
        if (!current || current.templateNodeId == null) return;
        void savePerspectiveOverlay({
          perspectiveTemplateNodeId: current.templateNodeId,
          node: serializeNode(current, 0),
        }).catch((err) =>
          toast.error(
            err instanceof Error ? err.message : "Failed to save scorecard.",
          ),
        );
      }, 800),
    );
  }, []);

  // Mutate one perspective subtree and schedule its save.
  const mutatePerspective = useCallback(
    (
      perspectiveKey: string,
      recipe: (nodes: WorkingNode[]) => WorkingNode[],
    ) => {
      setPerspectives((prev) => {
        if (!prev) return prev;
        const next = prev.map((node) =>
          node.key === perspectiveKey ? { ...node } : node,
        );
        const index = next.findIndex((node) => node.key === perspectiveKey);
        if (index === -1) return prev;
        const updated = recipe([next[index]]);
        next[index] = updated[0];
        return next;
      });
      scheduleSave(perspectiveKey);
    },
    [scheduleSave],
  );

  const toggleSelect = (
    perspectiveKey: string,
    node: WorkingNode,
    nextChecked: boolean,
  ) => {
    if (node.isMandatory) return;
    if (nextChecked) {
      mutatePerspective(
        perspectiveKey,
        (nodes) => selectPath(nodes, node.key).next,
      );
      return;
    }
    if (nodeHasContent(node)) {
      setPendingDeselect({
        perspectiveKey,
        nodeKey: node.key,
        label: node.label,
      });
      return;
    }
    mutatePerspective(perspectiveKey, (nodes) =>
      updateNodeByKey(nodes, node.key, deselectSubtree),
    );
  };

  const confirmDeselect = () => {
    if (!pendingDeselect) return;
    const { perspectiveKey, nodeKey } = pendingDeselect;
    mutatePerspective(perspectiveKey, (nodes) =>
      updateNodeByKey(nodes, nodeKey, deselectSubtree),
    );
    setPendingDeselect(null);
  };

  const addCustomChild = (
    perspectiveKey: string,
    parent: WorkingNode,
  ) => {
    const childLevel = CHILD_LEVEL[parent.level];
    if (!childLevel) return;
    mutatePerspective(perspectiveKey, (nodes) =>
      updateNodeByKey(nodes, parent.key, (node) => ({
        ...node,
        selected: true,
        children: [
          ...node.children,
          {
            key: genKey(),
            templateNodeId: null,
            level: childLevel,
            label: `New ${LEVEL_LABEL[childLevel]}`,
            isMandatory: false,
            isCustom: true,
            selected: true,
            children: [],
            specificObjectives: [],
          },
        ],
      })),
    );
  };

  const renameCustom = (
    perspectiveKey: string,
    nodeKey: string,
    label: string,
  ) =>
    mutatePerspective(perspectiveKey, (nodes) =>
      updateNodeByKey(nodes, nodeKey, (node) => ({ ...node, label })),
    );

  // --- Lower-zone mutations (operate on a lever node) -----------------------

  const updateLever = (
    perspectiveKey: string,
    leverKey: string,
    fn: (objectives: WorkingObjective[]) => WorkingObjective[],
  ) =>
    mutatePerspective(perspectiveKey, (nodes) =>
      updateNodeByKey(nodes, leverKey, (node) => ({
        ...node,
        specificObjectives: fn(node.specificObjectives),
      })),
    );

  const addActivity = (
    perspectiveKey: string,
    leverKey: string,
    objectiveKey: string,
    kind: BscActivityKind,
  ) =>
    updateLever(perspectiveKey, leverKey, (objectives) =>
      objectives.map((item) =>
        item.key === objectiveKey
          ? {
              ...item,
              initiatives: [
                ...item.initiatives,
                {
                  key: genKey(),
                  title: "",
                  description: null,
                  kind,
                  startDate: null,
                  targetCompletionDate: null,
                  status: kind === "project" ? "planned" : null,
                  kpis: [],
                },
              ],
            }
          : item,
      ),
    );

  const patchInitiative = (
    perspectiveKey: string,
    leverKey: string,
    objectiveKey: string,
    initiativeKey: string,
    patch: Partial<WorkingInitiative>,
  ) =>
    updateLever(perspectiveKey, leverKey, (objectives) =>
      objectives.map((item) =>
        item.key === objectiveKey
          ? {
              ...item,
              initiatives: item.initiatives.map((ini) =>
                ini.key === initiativeKey ? { ...ini, ...patch } : ini,
              ),
            }
          : item,
      ),
    );

  const setTrajectoryEverywhere = (
    kpiDefinitionId: number,
    trajectory: KpiTrajectory | null,
  ) => {
    setPerspectives((prev) => {
      if (!prev) return prev;
      const patchKpi = (node: WorkingNode): WorkingNode => ({
        ...node,
        children: node.children.map(patchKpi),
        specificObjectives: node.specificObjectives.map((objective) => ({
          ...objective,
          initiatives: objective.initiatives.map((initiative) => ({
            ...initiative,
            kpis: initiative.kpis.map((kpi) =>
              kpi.kpiDefinitionId === kpiDefinitionId
                ? { ...kpi, trajectory }
                : kpi,
            ),
          })),
        })),
      });
      return prev.map(patchKpi);
    });
    void saveTrajectory({ kpiDefinitionId, trajectory }).catch((err) =>
      toast.error(
        err instanceof Error ? err.message : "Failed to save trajectory.",
      ),
    );
  };

  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleTargets = (key: string) =>
    setTargetsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground">Loading BSC Builder…</div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border bg-rose-50 p-3 text-xs text-rose-800">
        {error}
      </div>
    );
  }

  if (!perspectives) return null;

  // --- Render: lower zone ---------------------------------------------------

  const renderLowerZone = (perspectiveKey: string, lever: WorkingNode) => (
    <div className="mt-2 space-y-2 border-l-2 border-lime-200 pl-3">
      {lever.specificObjectives.map((objective) => (
        <div
          key={objective.key}
          className="rounded-md border bg-muted/30 p-2 space-y-2"
          data-bsc-el="objectiveBlock"
        >
          <div className="flex items-start gap-2">
            <Textarea
              className="min-h-9 bg-white text-xs"
              placeholder="Specific objective the utility is aiming for…"
              value={objective.description}
              disabled={!canBuild}
              onChange={(event) =>
                updateLever(perspectiveKey, lever.key, (objectives) =>
                  objectives.map((item) =>
                    item.key === objective.key
                      ? { ...item, description: event.target.value }
                      : item,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!canBuild}
              onClick={() =>
                updateLever(perspectiveKey, lever.key, (objectives) =>
                  objectives.filter((item) => item.key !== objective.key),
                )
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>

          {/* Initiatives */}
          <div className="space-y-2 pl-2">
            {objective.initiatives.map((initiative) => (
              <div
                key={initiative.key}
                className="rounded border bg-white p-2"
                data-bsc-el="initiativeCard"
              >
                <div className="flex items-center gap-2">
                  {/* Left column: type badge + name */}
                  <Badge
                    variant={
                      initiative.kind === "project" ? "default" : "secondary"
                    }
                    className="text-[10px]"
                    data-bsc-el="badge"
                  >
                    {initiative.kind === "project" ? "Project" : "Initiative"}
                  </Badge>
                  <Input
                    className="h-8 min-w-0 flex-1 text-xs"
                    placeholder={
                      initiative.kind === "project"
                        ? "Project name"
                        : "Initiative name"
                    }
                    value={initiative.title}
                    disabled={!canBuild}
                    onChange={(event) =>
                      patchInitiative(
                        perspectiveKey,
                        lever.key,
                        objective.key,
                        initiative.key,
                        { title: event.target.value },
                      )
                    }
                  />

                  {/* Right column: project timing/status, right-aligned */}
                  {initiative.kind === "project" ? (
                    <div className="flex shrink-0 items-center gap-2 text-[11px]">
                      <label className="text-muted-foreground">Start</label>
                      <Input
                        type="date"
                        className="h-7 w-32 text-xs"
                        value={initiative.startDate ?? ""}
                        disabled={!canBuild}
                        onChange={(event) =>
                          patchInitiative(
                            perspectiveKey,
                            lever.key,
                            objective.key,
                            initiative.key,
                            { startDate: event.target.value || null },
                          )
                        }
                      />
                      <label className="text-muted-foreground">Target</label>
                      <Input
                        type="date"
                        className="h-7 w-32 text-xs"
                        value={initiative.targetCompletionDate ?? ""}
                        disabled={!canBuild}
                        onChange={(event) =>
                          patchInitiative(
                            perspectiveKey,
                            lever.key,
                            objective.key,
                            initiative.key,
                            {
                              targetCompletionDate: event.target.value || null,
                            },
                          )
                        }
                      />
                      <Select
                        value={initiative.status ?? "planned"}
                        disabled={!canBuild}
                        onValueChange={(value) =>
                          patchInitiative(
                            perspectiveKey,
                            lever.key,
                            objective.key,
                            initiative.key,
                            { status: value as BscProjectStatus },
                          )
                        }
                      >
                        <SelectTrigger className="h-7 w-32 bg-white text-xs">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planned">Planned</SelectItem>
                          <SelectItem value="in_progress">
                            In progress
                          </SelectItem>
                          <SelectItem value="complete">Complete</SelectItem>
                          <SelectItem value="on_hold">On hold</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    disabled={!canBuild}
                    onClick={() =>
                      updateLever(perspectiveKey, lever.key, (objectives) =>
                        objectives.map((item) =>
                          item.key === objective.key
                            ? {
                                ...item,
                                initiatives: item.initiatives.filter(
                                  (ini) => ini.key !== initiative.key,
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                {/* KPIs under the initiative */}
                <div className="mt-2 space-y-1 pl-2">
                  {initiative.kpis.map((kpi) => (
                    <div key={kpi.key} className="space-y-1" data-bsc-el="kpiRow">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate">
                          {kpi.kpiName ??
                            kpi.pendingCustomKpiRequestId ??
                            `KPI #${kpi.kpiDefinitionId ?? "?"}`}
                        </span>
                        <Select
                          value={kpi.trajectory ?? "none"}
                          disabled={!canBuild || kpi.kpiDefinitionId == null}
                          onValueChange={(value) =>
                            kpi.kpiDefinitionId != null &&
                            setTrajectoryEverywhere(
                              kpi.kpiDefinitionId,
                              value === "none"
                                ? null
                                : (value as KpiTrajectory),
                            )
                          }
                        >
                          <SelectTrigger className="h-7 w-32 bg-white text-xs">
                            <SelectValue placeholder="Trajectory" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No trajectory</SelectItem>
                            <SelectItem value="increase">Increase ↑</SelectItem>
                            <SelectItem value="decrease">Decrease ↓</SelectItem>
                            <SelectItem value="same">Maintain →</SelectItem>
                          </SelectContent>
                        </Select>
                        {kpi.kpiDefinitionId != null ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={() => toggleTargets(kpi.key)}
                          >
                            Targets
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={!canBuild}
                          onClick={() =>
                            updateLever(
                              perspectiveKey,
                              lever.key,
                              (objectives) =>
                                objectives.map((item) =>
                                  item.key === objective.key
                                    ? {
                                        ...item,
                                        initiatives: item.initiatives.map(
                                          (ini) =>
                                            ini.key === initiative.key
                                              ? {
                                                  ...ini,
                                                  kpis: ini.kpis.filter(
                                                    (k) => k.key !== kpi.key,
                                                  ),
                                                }
                                              : ini,
                                        ),
                                      }
                                    : item,
                                ),
                            )
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      {kpi.kpiDefinitionId != null &&
                      targetsOpen.has(kpi.key) ? (
                        <NewBscKpiTargets
                          kpiDefinitionId={kpi.kpiDefinitionId}
                          canBuild={canBuild}
                        />
                      ) : null}
                    </div>
                  ))}

                  {/* KPI picker */}
                  {canBuild ? (
                    <SearchableSelect
                      options={kpiSelectOptions}
                      placeholder="+ Add KPI"
                      searchPlaceholder="Search KPIs…"
                      emptyLabel="No KPIs found"
                      triggerClassName="h-7 text-xs bg-white"
                      onValueChange={(value) => {
                        const option = kpiOptions.find(
                          (o) => String(o.kpiDefinitionId) === value,
                        );
                        if (!option) return;
                        updateLever(
                          perspectiveKey,
                          lever.key,
                          (objectives) =>
                            objectives.map((item) =>
                              item.key === objective.key
                                ? {
                                    ...item,
                                    initiatives: item.initiatives.map((ini) =>
                                      ini.key === initiative.key
                                        ? {
                                            ...ini,
                                            kpis: [
                                              ...ini.kpis,
                                              {
                                                key: genKey(),
                                                kpiDefinitionId:
                                                  option.kpiDefinitionId,
                                                kpiName: option.name,
                                                pendingCustomKpiRequestId: null,
                                                trajectory: null,
                                              },
                                            ],
                                          }
                                        : ini,
                                    ),
                                  }
                                : item,
                            ),
                        );
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ))}

            {canBuild ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    addActivity(
                      perspectiveKey,
                      lever.key,
                      objective.key,
                      "initiative",
                    )
                  }
                >
                  <Plus className="mr-1 size-3" /> Initiative
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    addActivity(
                      perspectiveKey,
                      lever.key,
                      objective.key,
                      "project",
                    )
                  }
                >
                  <Plus className="mr-1 size-3" /> Project
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ))}

      {canBuild ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            updateLever(perspectiveKey, lever.key, (objectives) => [
              ...objectives,
              { key: genKey(), description: "", initiatives: [] },
            ])
          }
        >
          <Plus className="mr-1 size-3" /> Specific Objective
        </Button>
      ) : null}
    </div>
  );

  // --- Render: a tree node (build mode) -------------------------------------

  const renderNode = (
    perspectiveKey: string,
    node: WorkingNode,
    depth: number,
  ) => {
    const childLevel = CHILD_LEVEL[node.level];
    const isCollapsed = collapsed.has(node.key);
    const isLever = node.level === "strategic_lever";

    return (
      <div
        key={node.key}
        style={{ paddingLeft: depth * 14 }}
        className="py-0.5"
        data-bsc-el="nodeRow"
      >
        <div className="flex items-center gap-2">
          {node.children.length > 0 || isLever ? (
            <button
              type="button"
              onClick={() => toggleCollapsed(node.key)}
              className="text-muted-foreground"
            >
              {isCollapsed ? (
                <ChevronRight className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="inline-block w-3.5" />
          )}

          <Checkbox
            checked={node.selected}
            disabled={!canBuild || node.isMandatory}
            onCheckedChange={(checked) =>
              toggleSelect(perspectiveKey, node, checked === true)
            }
          />

          {node.isCustom ? (
            <Input
              className="h-7 max-w-xs text-xs"
              value={node.label}
              disabled={!canBuild}
              onChange={(event) =>
                renameCustom(perspectiveKey, node.key, event.target.value)
              }
            />
          ) : (
            <span
              className={
                node.selected
                  ? "text-xs font-medium"
                  : "text-xs text-muted-foreground"
              }
            >
              {node.label}
            </span>
          )}

          {node.isMandatory ? (
            <Lock className="size-3 text-muted-foreground" />
          ) : null}
          {node.isCustom ? (
            <Badge
              variant="secondary"
              className="text-[10px]"
              data-bsc-el="badge"
            >
              Custom
            </Badge>
          ) : null}
        </div>

        {!isCollapsed ? (
          <>
            {node.children.map((child) =>
              renderNode(perspectiveKey, child, depth + 1),
            )}

            {childLevel && node.selected && canBuild ? (
              <div style={{ paddingLeft: (depth + 1) * 14 }}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-muted-foreground"
                  onClick={() => addCustomChild(perspectiveKey, node)}
                >
                  <Plus className="mr-1 size-3" /> Add custom{" "}
                  {LEVEL_LABEL[childLevel]}
                </Button>
              </div>
            ) : null}

            {isLever && node.selected
              ? renderLowerZone(perspectiveKey, node)
              : null}
          </>
        ) : null}
      </div>
    );
  };

  // --- Render: preview mode (mandatory + selected/populated only) -----------

  const renderPreviewNode = (node: WorkingNode, depth: number) => {
    if (!node.selected) return null;
    return (
      <div key={node.key} style={{ paddingLeft: depth * 14 }} className="py-0.5">
        <div className="text-xs">
          <span className="font-medium">{node.label}</span>
          <span className="ml-2 text-[10px] text-muted-foreground">
            {LEVEL_LABEL[node.level]}
          </span>
        </div>
        {node.children.map((child) => renderPreviewNode(child, depth + 1))}
        {node.level === "strategic_lever"
          ? node.specificObjectives.map((objective) => (
              <div
                key={objective.key}
                style={{ paddingLeft: (depth + 1) * 14 }}
                className="text-xs text-muted-foreground"
              >
                ◦ {objective.description || "(unnamed objective)"}
                {objective.initiatives.map((initiative) => (
                  <div
                    key={initiative.key}
                    style={{ paddingLeft: 14 }}
                    className="text-[11px]"
                  >
                    {initiative.kind === "project" ? "▣" : "–"}{" "}
                    {initiative.title ||
                      (initiative.kind === "project"
                        ? "(unnamed project)"
                        : "(unnamed initiative)")}
                    {initiative.kind === "project" ? (
                      <span className="ml-1 text-muted-foreground">
                        (Project
                        {initiative.status
                          ? ` · ${PROJECT_STATUS_LABEL[initiative.status]}`
                          : ""}
                        {initiative.targetCompletionDate
                          ? ` · due ${initiative.targetCompletionDate}`
                          : ""}
                        )
                      </span>
                    ) : null}
                    {initiative.kpis.length > 0 ? (
                      <span className="ml-1">
                        [
                        {initiative.kpis
                          .map(
                            (kpi) =>
                              `${kpi.kpiName ?? "KPI"}${
                                kpi.trajectory
                                  ? ` ${TRAJECTORY_LABEL[kpi.trajectory]}`
                                  : ""
                              }`,
                          )
                          .join(", ")}
                        ]
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ))
          : null}
      </div>
    );
  };

  // --- Render: DEV design panel (curated, per element-type styling) ---------

  const renderDesignPanel = () => {
    const current: BscElementStyle = themeStyles[selectedEl] ?? {};
    const colorRow = (
      label: string,
      prop: "textColor" | "backgroundColor" | "borderColor",
    ) => (
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">{label}</span>
        <input
          type="color"
          className="h-6 w-8 cursor-pointer rounded border"
          value={current[prop] ?? "#000000"}
          onChange={(event) =>
            updateElementStyle(selectedEl, { [prop]: event.target.value })
          }
        />
        {current[prop] ? (
          <button
            type="button"
            className="text-muted-foreground"
            aria-label={`Clear ${label}`}
            onClick={() => updateElementStyle(selectedEl, { [prop]: undefined })}
          >
            ✕
          </button>
        ) : null}
      </div>
    );

    return (
      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">Style element:</span>
          <Select value={selectedEl} onValueChange={setSelectedEl}>
            <SelectTrigger className="h-7 w-60 bg-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLEABLE_ELEMENTS.map((element) => (
                <SelectItem key={element.id} value={element.id}>
                  {element.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={() => resetElementStyle(selectedEl)}
          >
            Reset
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          {colorRow("Text", "textColor")}
          {colorRow("Background", "backgroundColor")}
          {colorRow("Border", "borderColor")}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Font size</span>
            <Input
              type="number"
              className="h-7 w-16 text-xs"
              value={current.fontSize ?? ""}
              onChange={(event) =>
                updateElementStyle(selectedEl, {
                  fontSize: event.target.value
                    ? Number(event.target.value)
                    : undefined,
                })
              }
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Weight</span>
            <Select
              value={current.fontWeight ? String(current.fontWeight) : "default"}
              onValueChange={(value) =>
                updateElementStyle(selectedEl, {
                  fontWeight: value === "default" ? undefined : Number(value),
                })
              }
            >
              <SelectTrigger className="h-7 w-28 bg-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="400">Regular</SelectItem>
                <SelectItem value="500">Medium</SelectItem>
                <SelectItem value="600">Semibold</SelectItem>
                <SelectItem value="700">Bold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Padding</span>
            <Input
              type="number"
              className="h-7 w-16 text-xs"
              value={current.padding ?? ""}
              onChange={(event) =>
                updateElementStyle(selectedEl, {
                  padding: event.target.value
                    ? Number(event.target.value)
                    : undefined,
                })
              }
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Changes apply to all “{STYLEABLE_ELEMENTS.find((e) => e.id === selectedEl)?.label}”
          elements across the BSC and save automatically.
        </p>
      </div>
    );
  };

  return (
    <div
      className="bsc-themed space-y-3 rounded-md border bg-background p-3 sm:p-4"
      data-bsc-el="container"
    >
      {themeCss ? <style>{themeCss}</style> : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Tick the framework items that apply, add custom branches, then author
          specific objectives, initiatives and KPIs under each strategic lever.
        </p>
        <div className="flex items-center gap-2">
          {canEditTheme ? (
            <Button
              type="button"
              variant={designMode ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setDesignMode((on) => !on)}
            >
              <Palette className="mr-1 size-3" />
              {designMode ? "Done styling" : "Design"}
            </Button>
          ) : null}
          <div className="inline-flex overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() => setView("build")}
              className={`px-3 py-1 text-xs ${
                view === "build" ? "bg-lime-500 text-white" : "bg-white"
              }`}
            >
              Build
            </button>
            <button
              type="button"
              onClick={() => setView("preview")}
              className={`px-3 py-1 text-xs ${
                view === "preview" ? "bg-lime-500 text-white" : "bg-white"
              }`}
            >
              BSC Preview
            </button>
          </div>
        </div>
      </div>

      {canEditTheme && designMode
        ? renderDesignPanel()
        : null}

      {!canBuild ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You have read-only access to this scorecard.
        </div>
      ) : null}

      <div className="space-y-3">
        {perspectives.map((perspective) => (
          <div
            key={perspective.key}
            className="rounded-md border p-2"
            data-bsc-el="perspectiveCard"
          >
            <div
              className="mb-1 text-sm font-semibold"
              data-bsc-el="perspectiveTitle"
            >
              {perspective.label}
            </div>
            {view === "build"
              ? perspective.children.map((child) =>
                  renderNode(perspective.key, child, 1),
                )
              : perspective.children.map((child) =>
                  renderPreviewNode(child, 1),
                )}
          </div>
        ))}
      </div>

      <AlertDialog
        open={pendingDeselect != null}
        onOpenChange={(open) => {
          if (!open) setPendingDeselect(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{pendingDeselect?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This branch has objectives, initiatives or KPIs underneath.
              Removing it will delete that content from this scorecard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeselect}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
