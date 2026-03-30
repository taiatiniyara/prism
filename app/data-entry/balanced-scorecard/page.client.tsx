"use client";

import { useEffect, useMemo, useState } from "react";
import ScorecardSummary from "@/components/data-entry/scorecard-summary";
import ScorecardDetailPanel from "@/components/data-entry/scorecard-detail-panel";
import ScorecardEmptyState from "@/components/data-entry/scorecard-empty-state";
import ScorecardTree from "@/components/data-entry/scorecard-tree";
import {
  fetchScorecard,
  fetchScorecardKpiOptions,
  isLatestRequest,
  saveScorecardConfig,
  saveScorecardRelationships,
} from "@/app/data-entry/balanced-scorecard/client";
import type {
  ScorecardFilterContext,
  ScorecardInputRow,
  ScorecardKpiOption,
  ScorecardRelationship,
  ScorecardSnapshot,
} from "@/app/data-entry/balanced-scorecard/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type TrackingFrequency = "monthly" | "annually";

type DraftObjectiveKpi = {
  kpiId: string | null;
  kpiDefinitionId: number;
  kpiName: string;
  targetValue: string;
  trackingFrequency: TrackingFrequency;
};

type DraftKeyInitiative = {
  id: string;
  description: string;
  kpis: DraftObjectiveKpi[];
};

type DraftObjective = {
  id: string;
  description: string;
  keyInitiatives: DraftKeyInitiative[];
};

type RelationshipNodeOption = {
  id: string;
  label: string;
  ref: ScorecardRelationship["source"];
};

type RelationshipType = ScorecardRelationship["relationshipType"];

const relationshipRefId = (ref: ScorecardRelationship["source"]): string => {
  const objective = ref.objectiveDescription?.trim() || "-";
  const initiative = ref.keyInitiativeDescription?.trim() || "-";
  const kpiId = ref.kpiId == null ? "-" : String(ref.kpiId);
  return `${ref.level}|${ref.perspectiveLevel}|${objective}|${initiative}|${kpiId}`;
};

const relationshipPairKey = (
  source: ScorecardRelationship["source"],
  target: ScorecardRelationship["target"],
  relationshipType: RelationshipType,
): string =>
  `${relationshipRefId(source)}=>${relationshipRefId(target)}=>${relationshipType}`;

const PERSPECTIVE_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Financial",
  2: "Customer",
  3: "Operation",
  4: "Development",
};

export default function ScorecardPageClient({
  initialContext,
  kpiOptions,
}: {
  initialContext: ScorecardFilterContext;
  kpiOptions: ScorecardKpiOption[];
}) {
  const [context, setContext] =
    useState<ScorecardFilterContext>(initialContext);
  const [snapshot, setSnapshot] = useState<ScorecardSnapshot | null>(null);
  const [scorecardRows, setScorecardRows] = useState<ScorecardInputRow[]>([]);
  const [scorecardRelationships, setScorecardRelationships] = useState<
    ScorecardRelationship[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedPerspective, setSelectedPerspective] = useState<number | null>(
    null,
  );
  const [availableKpiOptions, setAvailableKpiOptions] =
    useState<ScorecardKpiOption[]>(kpiOptions);
  const [kpiDefinitionId, setKpiDefinitionId] = useState<number | null>(
    kpiOptions[0]?.kpiDefinitionId ?? null,
  );
  const [kpiSearchTerm, setKpiSearchTerm] = useState("");
  const [perspectiveLevel, setPerspectiveLevel] = useState<1 | 2 | 3 | 4>(1);
  const [strategicObjective, setStrategicObjective] = useState("");
  const [keyInitiative, setKeyInitiative] = useState("");
  const [trackingFrequency, setTrackingFrequency] =
    useState<TrackingFrequency>("monthly");
  const [targetValue, setTargetValue] = useState("");
  const [currentInitiativeKpis, setCurrentInitiativeKpis] = useState<
    DraftObjectiveKpi[]
  >([]);
  const [currentObjectiveInitiatives, setCurrentObjectiveInitiatives] =
    useState<DraftKeyInitiative[]>([]);
  const [draftObjectives, setDraftObjectives] = useState<DraftObjective[]>([]);
  const [selectedExistingObjective, setSelectedExistingObjective] = useState<
    string | null
  >(null);
  const [objectiveSearchTerm, setObjectiveSearchTerm] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [draftRelationships, setDraftRelationships] = useState<
    ScorecardRelationship[]
  >([]);
  const [relationshipSourceId, setRelationshipSourceId] = useState("");
  const [relationshipTargetId, setRelationshipTargetId] = useState("");
  const [relationshipType, setRelationshipType] =
    useState<RelationshipType>("influences");

  const normalizedContext = useMemo(
    () => ({ ...context, kpiCategoryId: null, kpiSubcategoryId: null }),
    [context],
  );

  useEffect(() => {
    let active = true;

    void fetchScorecard(normalizedContext)
      .then(({ requestId, payload }) => {
        if (!active || !isLatestRequest(requestId)) {
          return;
        }
        setSnapshot(payload.snapshot);
        setScorecardRows(payload.rows ?? []);
        setScorecardRelationships(payload.relationships ?? []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) {
          return;
        }
        setSnapshot(null);
        setScorecardRows([]);
        setScorecardRelationships([]);
        setError(
          err instanceof Error ? err.message : "Unable to load scorecard.",
        );
      });

    return () => {
      active = false;
    };
  }, [normalizedContext]);

  useEffect(() => {
    setDraftRelationships(scorecardRelationships);
  }, [scorecardRelationships]);

  useEffect(() => {
    let active = true;

    void fetchScorecardKpiOptions(normalizedContext)
      .then((nextOptions) => {
        if (!active) {
          return;
        }

        setAvailableKpiOptions(nextOptions);
        setKpiDefinitionId((current) => {
          if (
            current != null &&
            nextOptions.some((option) => option.kpiDefinitionId === current)
          ) {
            return current;
          }

          return nextOptions[0]?.kpiDefinitionId ?? null;
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setAvailableKpiOptions([]);
        setKpiDefinitionId(null);
      });

    return () => {
      active = false;
    };
  }, [normalizedContext]);

  const selected = useMemo(
    () =>
      snapshot?.perspectiveScores.find(
        (item) => item.perspectiveLevel === selectedPerspective,
      ) ?? null,
    [snapshot, selectedPerspective],
  );

  const selectedKpiOption = useMemo(
    () =>
      kpiDefinitionId == null
        ? null
        : (availableKpiOptions.find(
            (option) => option.kpiDefinitionId === kpiDefinitionId,
          ) ?? null),
    [availableKpiOptions, kpiDefinitionId],
  );

  const filteredKpiOptions = useMemo(() => {
    const query = kpiSearchTerm.trim().toLowerCase();
    if (query.length === 0) {
      return availableKpiOptions;
    }

    return availableKpiOptions.filter((option) => {
      const haystack =
        `${option.kpiName} ${option.kpiDefinitionId}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [availableKpiOptions, kpiSearchTerm]);

  const kpiNameByDefinitionId = useMemo(
    () =>
      new Map(
        availableKpiOptions.map((option) => [
          option.kpiDefinitionId,
          option.kpiName,
        ]),
      ),
    [availableKpiOptions],
  );

  const existingObjectiveRows = useMemo(
    () =>
      scorecardRows.filter(
        (row) =>
          row.perspectiveLevel === perspectiveLevel &&
          row.objective != null &&
          row.objective.trim().length > 0,
      ),
    [scorecardRows, perspectiveLevel],
  );

  const existingObjectiveItems = useMemo(
    () =>
      Array.from(
        new Set(existingObjectiveRows.map((row) => row.objective!.trim())),
      ).sort((a, b) => a.localeCompare(b)),
    [existingObjectiveRows],
  );

  const filteredObjectiveItems = useMemo(() => {
    const query = objectiveSearchTerm.trim().toLowerCase();
    if (query.length === 0) {
      return existingObjectiveItems;
    }

    return existingObjectiveItems.filter((item) =>
      item.toLowerCase().includes(query),
    );
  }, [existingObjectiveItems, objectiveSearchTerm]);

  const loadObjectiveIntoEditor = (objectiveName: string) => {
    const normalizedObjective = objectiveName.trim();
    if (normalizedObjective.length === 0) {
      return;
    }

    const matchingRows = existingObjectiveRows.filter(
      (row) =>
        row.objective?.trim().toLowerCase() ===
        normalizedObjective.toLowerCase(),
    );

    const initiativeMap = new Map<string, DraftKeyInitiative>();
    for (const row of matchingRows) {
      const initiativeDescription = row.keyInitiative?.trim() || "Unspecified";
      const initiativeKey = initiativeDescription.toLowerCase();

      let initiative = initiativeMap.get(initiativeKey);
      if (initiative == null) {
        initiative = {
          id: `${Date.now()}-${Math.random()}-${initiativeMap.size}`,
          description: initiativeDescription,
          kpis: [],
        };
        initiativeMap.set(initiativeKey, initiative);
      }

      const alreadyHasKpi = initiative.kpis.some(
        (item) => item.kpiDefinitionId === row.kpiDefinitionId,
      );
      if (alreadyHasKpi) {
        continue;
      }

      initiative.kpis.push({
        kpiId: row.kpiId,
        kpiDefinitionId: row.kpiDefinitionId,
        kpiName:
          row.kpiName?.trim() ||
          kpiNameByDefinitionId.get(row.kpiDefinitionId) ||
          `KPI ${row.kpiDefinitionId}`,
        targetValue: row.targetValue == null ? "" : String(row.targetValue),
        trackingFrequency:
          row.trackingFrequency === "annually" ? "annually" : "monthly",
      });
    }

    const loadedInitiatives = Array.from(initiativeMap.values());

    setStrategicObjective(normalizedObjective);
    setKeyInitiative("");
    setCurrentInitiativeKpis([]);
    setCurrentObjectiveInitiatives(loadedInitiatives);
    const loadedKpiCount = loadedInitiatives.reduce(
      (sum, initiative) => sum + initiative.kpis.length,
      0,
    );
    setSaveMessage(
      `Loaded ${loadedInitiatives.length} initiative(s) and ${loadedKpiCount} KPI record(s) for update.`,
    );
  };

  const handleExistingObjectiveSelect = (value: string | null) => {
    if (value == null) {
      setSelectedExistingObjective(null);
      return;
    }

    const normalized = value.trim().toLowerCase();
    const matchedObjective = existingObjectiveItems.find(
      (item) => item.trim().toLowerCase() === normalized,
    );

    setSelectedExistingObjective(matchedObjective ?? value);

    if (matchedObjective != null) {
      loadObjectiveIntoEditor(matchedObjective);
    }
  };

  const relationshipNodeOptions = useMemo(() => {
    const options = new Map<string, RelationshipNodeOption>();

    const addOption = (option: RelationshipNodeOption) => {
      if (!options.has(option.id)) {
        options.set(option.id, option);
      }
    };

    for (const row of scorecardRows) {
      const perspectiveRef: ScorecardRelationship["source"] = {
        level: "perspective",
        perspectiveLevel: row.perspectiveLevel as 1 | 2 | 3 | 4,
      };
      addOption({
        id: relationshipRefId(perspectiveRef),
        label: `Perspective: ${row.perspectiveLabel}`,
        ref: perspectiveRef,
      });

      if (row.objective?.trim()) {
        const objectiveRef: ScorecardRelationship["source"] = {
          level: "objective",
          perspectiveLevel: row.perspectiveLevel as 1 | 2 | 3 | 4,
          objectiveDescription: row.objective.trim(),
        };
        addOption({
          id: relationshipRefId(objectiveRef),
          label: `Objective (${row.perspectiveLabel}): ${row.objective.trim()}`,
          ref: objectiveRef,
        });
      }

      if (row.objective?.trim() && row.keyInitiative?.trim()) {
        const initiativeRef: ScorecardRelationship["source"] = {
          level: "initiative",
          perspectiveLevel: row.perspectiveLevel as 1 | 2 | 3 | 4,
          objectiveDescription: row.objective.trim(),
          keyInitiativeDescription: row.keyInitiative.trim(),
        };
        addOption({
          id: relationshipRefId(initiativeRef),
          label: `Initiative (${row.perspectiveLabel}): ${row.keyInitiative.trim()}`,
          ref: initiativeRef,
        });

        const kpiRef: ScorecardRelationship["source"] = {
          level: "kpi",
          perspectiveLevel: row.perspectiveLevel as 1 | 2 | 3 | 4,
          objectiveDescription: row.objective.trim(),
          keyInitiativeDescription: row.keyInitiative.trim(),
          kpiId: row.kpiDefinitionId,
        };
        addOption({
          id: relationshipRefId(kpiRef),
          label: `KPI (${row.perspectiveLabel}): ${row.kpiName ?? `KPI #${row.kpiDefinitionId}`}`,
          ref: kpiRef,
        });
      }
    }

    for (const objective of draftObjectives) {
      const objectiveRef: ScorecardRelationship["source"] = {
        level: "objective",
        perspectiveLevel,
        objectiveDescription: objective.description,
      };
      addOption({
        id: relationshipRefId(objectiveRef),
        label: `Objective (${PERSPECTIVE_LABELS[perspectiveLevel]}): ${objective.description}`,
        ref: objectiveRef,
      });

      for (const initiative of objective.keyInitiatives) {
        const initiativeRef: ScorecardRelationship["source"] = {
          level: "initiative",
          perspectiveLevel,
          objectiveDescription: objective.description,
          keyInitiativeDescription: initiative.description,
        };
        addOption({
          id: relationshipRefId(initiativeRef),
          label: `Initiative (${PERSPECTIVE_LABELS[perspectiveLevel]}): ${initiative.description}`,
          ref: initiativeRef,
        });

        for (const kpi of initiative.kpis) {
          const kpiRef: ScorecardRelationship["source"] = {
            level: "kpi",
            perspectiveLevel,
            objectiveDescription: objective.description,
            keyInitiativeDescription: initiative.description,
            kpiId: kpi.kpiDefinitionId,
          };
          addOption({
            id: relationshipRefId(kpiRef),
            label: `KPI (${PERSPECTIVE_LABELS[perspectiveLevel]}): ${kpi.kpiName}`,
            ref: kpiRef,
          });
        }
      }
    }

    return [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [draftObjectives, perspectiveLevel, scorecardRows]);

  const relationshipNodeById = useMemo(
    () => new Map(relationshipNodeOptions.map((item) => [item.id, item])),
    [relationshipNodeOptions],
  );

  const hasUnsavedRelationshipChanges = useMemo(() => {
    const toKeySet = (items: ScorecardRelationship[]) =>
      new Set(
        items.map((item) =>
          relationshipPairKey(item.source, item.target, item.relationshipType),
        ),
      );

    const current = toKeySet(scorecardRelationships);
    const draft = toKeySet(draftRelationships);

    if (current.size !== draft.size) {
      return true;
    }

    for (const key of draft) {
      if (!current.has(key)) {
        return true;
      }
    }

    return false;
  }, [draftRelationships, scorecardRelationships]);

  const perspectiveLabel = PERSPECTIVE_LABELS[perspectiveLevel];
  const objectiveName = strategicObjective.trim();
  const initiativeName = keyInitiative.trim();
  const hasObjectiveContext =
    objectiveName.length > 0 || currentObjectiveInitiatives.length > 0;
  const hasInitiativeContext =
    initiativeName.length > 0 || currentInitiativeKpis.length > 0;
  const hasDraftedObjective = draftObjectives.length > 0;
  const step1CardClass =
    "rounded border border-sky-300 bg-sky-50 px-1.5 py-1 text-[11px]";
  const step2CardClass =
    "rounded border border-indigo-300 bg-indigo-50 px-1.5 py-1 text-[11px]";
  const step3CardClass =
    "rounded border border-amber-300 bg-amber-50 px-1.5 py-1 text-[11px]";
  const step4CardClass =
    "rounded border border-cyan-300 bg-cyan-50 px-1.5 py-1 text-[11px]";
  const step5CardClass =
    "rounded border border-emerald-300 bg-emerald-50 px-1.5 py-1 text-[11px]";

  return (
    <div className="space-y-2 p-1.5 sm:p-2">
      {!snapshot && !error ? (
        <div className="text-xs text-muted-foreground">
          Loading scorecard...
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end">
        <Button
          type="button"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => setIsBuilderOpen(true)}
        >
          Build / Edit BSC
        </Button>
      </div>

      <Dialog
        open={isBuilderOpen}
        onOpenChange={setIsBuilderOpen}
      >
        <DialogContent className="min-w-200 max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Build Perspective Objectives</DialogTitle>
            <DialogDescription>
              Follow the hierarchy in order: Perspective {" -> "} Strategic
              Objective {" -> "} Key Initiative {" -> "} KPI.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/30 p-2">
            <p className="text-[11px] font-medium">Current Build Path</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {perspectiveLabel} {" -> "}
              {objectiveName.length > 0
                ? objectiveName
                : "Objective not set"}{" "}
              {" -> "}
              {initiativeName.length > 0
                ? initiativeName
                : "Initiative not set"}
            </p>
            <div className="mt-1 grid gap-1 md:grid-cols-5">
              <div className={step1CardClass}>
                <p className="font-medium">1. Perspective</p>
                <p className="text-muted-foreground">Done</p>
              </div>
              <div className={step2CardClass}>
                <p className="font-medium">2. Objective</p>
                <p className="text-muted-foreground">
                  {hasObjectiveContext ? "In progress" : "Start here"}
                </p>
              </div>
              <div className={step3CardClass}>
                <p className="font-medium">3. Initiative</p>
                <p className="text-muted-foreground">
                  {hasInitiativeContext ? "In progress" : "Waiting"}
                </p>
              </div>
              <div className={step4CardClass}>
                <p className="font-medium">4. KPI</p>
                <p className="text-muted-foreground">
                  {currentInitiativeKpis.length > 0 ? "In progress" : "Waiting"}
                </p>
              </div>
              <div className={step5CardClass}>
                <p className="font-medium">5. Save</p>
                <p className="text-muted-foreground">
                  {hasDraftedObjective ? "Ready" : "Waiting"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-1.5 md:grid-cols-2">
            <div className="space-y-0.5 rounded-md border border-sky-300 bg-sky-50 p-2">
              <label className="text-[11px] font-medium">
                Step 1: Perspective
              </label>
              <Select
                value={String(perspectiveLevel)}
                onValueChange={(value) => {
                  setPerspectiveLevel(Number(value) as 1 | 2 | 3 | 4);
                  setSelectedExistingObjective(null);
                }}
                disabled={isSaving}
              >
                <SelectTrigger className="h-8 bg-white text-xs">
                  <SelectValue placeholder="Select perspective" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Financial</SelectItem>
                  <SelectItem value="2">Customer</SelectItem>
                  <SelectItem value="3">Operation</SelectItem>
                  <SelectItem value="4">Development</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 rounded-md border border-indigo-300 bg-indigo-50 p-2 md:col-span-2">
              <div className="space-y-0.5">
                <label className="text-[11px] font-medium">
                  Step 2 (Optional): Load Existing Objective
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Select an existing objective to edit its initiatives and KPI
                  targets.
                </p>
                <Select
                  value={selectedExistingObjective ?? ""}
                  onValueChange={(value) =>
                    handleExistingObjectiveSelect(
                      value.length === 0 ? null : value,
                    )
                  }
                  onOpenChange={(open) => {
                    if (!open) {
                      setObjectiveSearchTerm("");
                    }
                  }}
                  disabled={existingObjectiveItems.length === 0 || isSaving}
                >
                  <SelectTrigger className="h-8 bg-white text-xs">
                    <SelectValue placeholder="Select an objective" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="sticky top-0 z-10 bg-popover p-1">
                      <Input
                        className="h-8 bg-white text-xs"
                        placeholder="Search objective"
                        value={objectiveSearchTerm}
                        onChange={(event) =>
                          setObjectiveSearchTerm(event.target.value)
                        }
                        onKeyDown={(event) => event.stopPropagation()}
                        autoFocus
                      />
                    </div>

                    {filteredObjectiveItems.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        No objectives found.
                      </div>
                    ) : (
                      filteredObjectiveItems.map((item) => (
                        <SelectItem
                          key={item}
                          value={item}
                        >
                          {item}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-0.5">
                <label className="text-[11px] font-medium">
                  Step 2: Strategic Objective
                </label>
                <Input
                  name="strategicObjective"
                  value={strategicObjective}
                  onChange={(event) =>
                    setStrategicObjective(event.target.value)
                  }
                  className="h-8 bg-white text-xs"
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className="space-y-0.5 rounded-md border border-amber-300 bg-amber-50 p-2 md:col-span-2">
              <label className="text-[11px] font-medium">
                Step 3: Key Initiative
              </label>
              <p className="text-[11px] text-muted-foreground">
                Add one initiative at a time under the objective above.
              </p>
              <Input
                name="keyInitiative"
                value={keyInitiative}
                onChange={(event) => setKeyInitiative(event.target.value)}
                className="h-8 bg-white text-xs"
                disabled={isSaving || !hasObjectiveContext}
              />
              {!hasObjectiveContext ? (
                <p className="text-[11px] text-amber-700">
                  Define or load a strategic objective first.
                </p>
              ) : null}
            </div>

            <div className="md:col-span-2 mt-1 rounded-md border border-cyan-300 bg-cyan-50 p-2">
              <p className="text-[11px] font-medium">
                Step 4: KPIs Under This Key Initiative
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Each KPI here belongs to the initiative above.
              </p>
              {!hasInitiativeContext ? (
                <p className="mt-1 text-[11px] text-amber-700">
                  Enter a key initiative before adding KPIs.
                </p>
              ) : null}

              <div className="mt-1 grid gap-1.5 md:grid-cols-4">
                <div className="space-y-0.5 md:col-span-2">
                  <label className="text-[11px] font-medium">KPI</label>
                  <Select
                    value={
                      kpiDefinitionId == null ? "" : String(kpiDefinitionId)
                    }
                    onValueChange={(value) => {
                      setKpiDefinitionId(Number(value));
                      setKpiSearchTerm("");
                    }}
                    onOpenChange={(open) => {
                      if (!open) {
                        setKpiSearchTerm("");
                      }
                    }}
                    disabled={
                      availableKpiOptions.length === 0 ||
                      isSaving ||
                      !hasInitiativeContext
                    }
                  >
                    <SelectTrigger className="h-8 bg-white text-xs">
                      <SelectValue placeholder="Select KPI" />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="sticky top-0 z-10 bg-popover p-1">
                        <Input
                          className="h-8 bg-white text-xs"
                          placeholder="Search KPI"
                          value={kpiSearchTerm}
                          onChange={(event) =>
                            setKpiSearchTerm(event.target.value)
                          }
                          onKeyDown={(event) => event.stopPropagation()}
                          autoFocus
                        />
                      </div>

                      {filteredKpiOptions.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          No KPIs found.
                        </div>
                      ) : (
                        filteredKpiOptions.map((option) => (
                          <SelectItem
                            key={option.kpiDefinitionId}
                            value={String(option.kpiDefinitionId)}
                          >
                            {option.kpiName}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-0.5">
                  <label className="text-[11px] font-medium">Target</label>
                  <Input
                    name="targetValue"
                    value={targetValue}
                    onChange={(event) => setTargetValue(event.target.value)}
                    className="h-8 bg-white text-xs"
                    disabled={isSaving || !hasInitiativeContext}
                  />
                </div>

                <div className="space-y-0.5">
                  <label className="text-[11px] font-medium">Tracking</label>
                  <Select
                    value={trackingFrequency}
                    onValueChange={(value) =>
                      setTrackingFrequency(value as TrackingFrequency)
                    }
                    disabled={isSaving || !hasInitiativeContext}
                  >
                    <SelectTrigger className="h-8 bg-white text-xs">
                      <SelectValue placeholder="Select tracking frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-1.5 flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={
                    isSaving ||
                    selectedKpiOption == null ||
                    !hasInitiativeContext
                  }
                  onClick={() => {
                    if (selectedKpiOption == null) {
                      setSaveMessage("Select a KPI first.");
                      return;
                    }

                    if (targetValue.trim().length === 0) {
                      setSaveMessage("Enter a KPI target value first.");
                      return;
                    }

                    const nextKpi: DraftObjectiveKpi = {
                      kpiId: selectedKpiOption.kpiId,
                      kpiDefinitionId: selectedKpiOption.kpiDefinitionId,
                      kpiName: selectedKpiOption.kpiName,
                      targetValue: targetValue.trim(),
                      trackingFrequency,
                    };

                    setCurrentInitiativeKpis((prev) => [...prev, nextKpi]);
                    setTargetValue("");
                    setSaveMessage(null);
                  }}
                >
                  Add KPI To Initiative
                </Button>
              </div>

              {currentInitiativeKpis.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {currentInitiativeKpis.map((item, index) => (
                    <li
                      key={`${item.kpiDefinitionId}-${index}`}
                      className="flex items-center justify-between rounded border px-2 py-1 text-[11px]"
                    >
                      <span>
                        {item.kpiName} | Target {item.targetValue} |{" "}
                        {item.trackingFrequency}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11px]"
                        onClick={() =>
                          setCurrentInitiativeKpis((prev) =>
                            prev.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  No KPIs added for this initiative yet.
                </p>
              )}

              <div className="mt-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  disabled={isSaving}
                  onClick={() => {
                    const initiativeDescription = keyInitiative.trim();
                    if (initiativeDescription.length === 0) {
                      setSaveMessage("Enter a key initiative.");
                      return;
                    }

                    if (currentInitiativeKpis.length === 0) {
                      setSaveMessage(
                        "Add at least one KPI to the key initiative.",
                      );
                      return;
                    }

                    const nextInitiative: DraftKeyInitiative = {
                      id: `${Date.now()}-${Math.random()}`,
                      description: initiativeDescription,
                      kpis: [...currentInitiativeKpis],
                    };

                    setCurrentObjectiveInitiatives((prev) => {
                      const existingIndex = prev.findIndex(
                        (item) =>
                          item.description.trim().toLowerCase() ===
                          initiativeDescription.toLowerCase(),
                      );

                      if (existingIndex < 0) {
                        return [...prev, nextInitiative];
                      }

                      const next = [...prev];
                      next[existingIndex] = {
                        ...nextInitiative,
                        id: prev[existingIndex].id,
                      };
                      return next;
                    });

                    setKeyInitiative("");
                    setCurrentInitiativeKpis([]);
                    setSaveMessage(
                      "Key initiative added/updated on objective.",
                    );
                  }}
                >
                  Add Initiative To Objective
                </Button>
              </div>

              <div className="mt-2 rounded-md border p-2">
                <p className="text-[11px] font-medium">
                  Key Initiatives Under Objective
                </p>
                {currentObjectiveInitiatives.length === 0 ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    No key initiatives added yet.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1.5">
                    {currentObjectiveInitiatives.map(
                      (initiative, initiativeIndex) => (
                        <li
                          key={initiative.id}
                          className="rounded border p-2"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <p className="text-[11px] font-medium">
                              Initiative {initiativeIndex + 1}:{" "}
                              {initiative.description}
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[11px]"
                              onClick={() =>
                                setCurrentObjectiveInitiatives((prev) =>
                                  prev.filter(
                                    (item) => item.id !== initiative.id,
                                  ),
                                )
                              }
                            >
                              Remove
                            </Button>
                          </div>
                          <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                            {initiative.kpis.map((kpi, index) => (
                              <li
                                key={`${initiative.id}-${kpi.kpiDefinitionId}-${index}`}
                              >
                                {kpi.kpiName}: {kpi.targetValue} (
                                {kpi.trackingFrequency})
                              </li>
                            ))}
                          </ul>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </div>

              <div className="mt-1.5 rounded-md border border-emerald-300 bg-emerald-50 p-2">
                <p className="text-[11px] font-medium">
                  Step 5: Add/Update Objective In Perspective
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  This commits all initiatives and KPIs above into the draft
                  objective list.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-1 h-8 px-2 text-xs"
                  disabled={isSaving}
                  onClick={() => {
                    const description = strategicObjective.trim();
                    if (description.length === 0) {
                      setSaveMessage(
                        "Enter a strategic objective description.",
                      );
                      return;
                    }

                    if (currentObjectiveInitiatives.length === 0) {
                      setSaveMessage(
                        "Add at least one key initiative to the objective.",
                      );
                      return;
                    }

                    const nextObjective: DraftObjective = {
                      id: `${Date.now()}-${Math.random()}`,
                      description,
                      keyInitiatives: [...currentObjectiveInitiatives],
                    };

                    setDraftObjectives((prev) => {
                      const existingIndex = prev.findIndex(
                        (item) =>
                          item.description.trim().toLowerCase() ===
                          description.toLowerCase(),
                      );

                      if (existingIndex < 0) {
                        return [...prev, nextObjective];
                      }

                      const next = [...prev];
                      next[existingIndex] = {
                        ...nextObjective,
                        id: prev[existingIndex].id,
                      };
                      return next;
                    });
                    setStrategicObjective("");
                    setKeyInitiative("");
                    setCurrentInitiativeKpis([]);
                    setCurrentObjectiveInitiatives([]);
                    setSelectedExistingObjective(null);
                    setSaveMessage("Objective added/updated in draft list.");
                  }}
                >
                  Step 5: Add/Update Objective In Perspective
                </Button>
              </div>
            </div>

            <div className="mt-2 rounded-md border p-2">
              <p className="text-[11px] font-medium">Draft Objectives</p>
              {draftObjectives.length === 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  No objectives added yet.
                </p>
              ) : (
                <ul className="mt-1 space-y-1.5">
                  {draftObjectives.map((objective, objectiveIndex) => (
                    <li
                      key={objective.id}
                      className="rounded border p-2"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <p className="text-[11px] font-medium">
                          Objective {objectiveIndex + 1}:{" "}
                          {objective.description}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[11px]"
                          onClick={() =>
                            setDraftObjectives((prev) =>
                              prev.filter((item) => item.id !== objective.id),
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                      <div className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                        {objective.keyInitiatives.map(
                          (initiative, initiativeIndex) => (
                            <div
                              key={`${objective.id}-${initiative.id}`}
                              className="rounded border p-1.5"
                            >
                              <p className="font-medium text-foreground">
                                Initiative {initiativeIndex + 1}:{" "}
                                {initiative.description}
                              </p>
                              <ul className="mt-0.5 space-y-0.5">
                                {initiative.kpis.map((kpi, index) => (
                                  <li
                                    key={`${initiative.id}-${kpi.kpiDefinitionId}-${index}`}
                                  >
                                    {kpi.kpiName}: {kpi.targetValue} (
                                    {kpi.trackingFrequency})
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ),
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={isSaving || draftObjectives.length === 0}
              onClick={async () => {
                setSaveMessage(null);
                setIsSaving(true);

                try {
                  if (draftObjectives.length === 0) {
                    throw new Error(
                      "Add at least one objective before saving.",
                    );
                  }

                  for (const objective of draftObjectives) {
                    for (const initiative of objective.keyInitiatives) {
                      for (const objectiveKpi of initiative.kpis) {
                        await saveScorecardConfig({
                          reportPeriodId: context.reportPeriodId,
                          kpiId: objectiveKpi.kpiId,
                          kpiDefinitionId: objectiveKpi.kpiDefinitionId,
                          perspectiveLevel,
                          perspectiveDescription:
                            PERSPECTIVE_LABELS[perspectiveLevel],
                          strategicObjective: objective.description,
                          keyInitiative: initiative.description,
                          trackingFrequency: objectiveKpi.trackingFrequency,
                          target: {
                            targetValue: objectiveKpi.targetValue,
                          },
                          relationships: draftRelationships,
                        });
                      }
                    }
                  }

                  setSaveMessage("Perspective objectives saved successfully.");
                  setDraftObjectives([]);
                  setCurrentInitiativeKpis([]);
                  setCurrentObjectiveInitiatives([]);
                  setStrategicObjective("");
                  setKeyInitiative("");
                  setTargetValue("");
                  setContext((current) => ({ ...current }));
                  setIsBuilderOpen(false);
                } catch (err) {
                  setSaveMessage(
                    err instanceof Error
                      ? err.message
                      : "Unable to save KPI target.",
                  );
                } finally {
                  setIsSaving(false);
                }
              }}
            >
              {isSaving ? "Saving..." : "Save Perspective"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2 text-xs"
              disabled={isSaving || !hasUnsavedRelationshipChanges}
              onClick={async () => {
                setSaveMessage(null);
                setIsSaving(true);

                try {
                  await saveScorecardRelationships({
                    reportPeriodId: context.reportPeriodId,
                    relationships: draftRelationships,
                  });

                  setScorecardRelationships(draftRelationships);
                  setSaveMessage("Relationships saved successfully.");
                  setContext((current) => ({ ...current }));
                } catch (err) {
                  setSaveMessage(
                    err instanceof Error
                      ? err.message
                      : "Unable to save relationships.",
                  );
                } finally {
                  setIsSaving(false);
                }
              }}
            >
              {isSaving ? "Saving..." : "Save Relationships Only"}
            </Button>
            {hasUnsavedRelationshipChanges ? (
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                Unsaved relationship changes
              </span>
            ) : (
              <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-800">
                Relationships are up to date
              </span>
            )}
            {saveMessage ? (
              <span className="text-[11px] text-muted-foreground">
                {saveMessage}
              </span>
            ) : null}
          </div>

          <div className="mt-2 rounded-md border p-2">
            <p className="text-[11px] font-medium">
              Cross-Hierarchy Relationships
            </p>
            <div className="mt-1 grid gap-1.5 md:grid-cols-3">
              <div className="space-y-0.5">
                <label className="text-[11px] font-medium">Source Node</label>
                <Select
                  value={relationshipSourceId}
                  onValueChange={setRelationshipSourceId}
                  disabled={isSaving || relationshipNodeOptions.length === 0}
                >
                  <SelectTrigger className="h-8 bg-white text-xs">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {relationshipNodeOptions.map((option) => (
                      <SelectItem
                        key={option.id}
                        value={option.id}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-0.5">
                <label className="text-[11px] font-medium">Relationship</label>
                <Select
                  value={relationshipType}
                  onValueChange={(value) =>
                    setRelationshipType(value as RelationshipType)
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger className="h-8 bg-white text-xs">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="influences">influences</SelectItem>
                    <SelectItem value="depends_on">depends_on</SelectItem>
                    <SelectItem value="contributes_to">
                      contributes_to
                    </SelectItem>
                    <SelectItem value="blocks">blocks</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-0.5">
                <label className="text-[11px] font-medium">Target Node</label>
                <Select
                  value={relationshipTargetId}
                  onValueChange={setRelationshipTargetId}
                  disabled={isSaving || relationshipNodeOptions.length === 0}
                >
                  <SelectTrigger className="h-8 bg-white text-xs">
                    <SelectValue placeholder="Select target" />
                  </SelectTrigger>
                  <SelectContent>
                    {relationshipNodeOptions.map((option) => (
                      <SelectItem
                        key={option.id}
                        value={option.id}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-1.5">
              <Button
                type="button"
                size="sm"
                className="h-8 px-2 text-xs"
                disabled={isSaving}
                onClick={() => {
                  const source = relationshipNodeById.get(relationshipSourceId);
                  const target = relationshipNodeById.get(relationshipTargetId);

                  if (!source || !target) {
                    setSaveMessage("Select both source and target nodes.");
                    return;
                  }

                  if (source.id === target.id) {
                    setSaveMessage(
                      "Source and target nodes must be different.",
                    );
                    return;
                  }

                  const next: ScorecardRelationship = {
                    id: `${Date.now()}-${Math.random()}`,
                    source: source.ref,
                    target: target.ref,
                    relationshipType,
                  };

                  setDraftRelationships((prev) => {
                    const exists = prev.some(
                      (item) =>
                        relationshipPairKey(
                          item.source,
                          item.target,
                          item.relationshipType,
                        ) ===
                        relationshipPairKey(
                          next.source,
                          next.target,
                          next.relationshipType,
                        ),
                    );

                    if (exists) {
                      return prev;
                    }

                    return [...prev, next];
                  });
                  setSaveMessage("Relationship added to draft.");
                }}
              >
                Add Relationship
              </Button>
            </div>

            {draftRelationships.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {draftRelationships.map((item) => {
                  const sourceId = relationshipRefId(item.source);
                  const targetId = relationshipRefId(item.target);
                  const sourceLabel =
                    relationshipNodeById.get(sourceId)?.label ?? sourceId;
                  const targetLabel =
                    relationshipNodeById.get(targetId)?.label ?? targetId;

                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded border px-2 py-1 text-[11px]"
                    >
                      <span>
                        {sourceLabel} {" -> "} {targetLabel} (
                        {item.relationshipType})
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11px]"
                        onClick={() =>
                          setDraftRelationships((prev) =>
                            prev.filter(
                              (relationship) => relationship.id !== item.id,
                            ),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                No cross-hierarchy relationships defined yet.
              </p>
            )}
          </div>

          {availableKpiOptions.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No KPI options available for this filter context.
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      {snapshot && snapshot.perspectiveScores.length > 0 ? (
        <>
          <ScorecardTree
            rows={scorecardRows}
            relationships={scorecardRelationships}
          />
          <ScorecardSummary
            overallScore={snapshot.overallScore}
            perspectiveScores={snapshot.perspectiveScores}
            onSelect={setSelectedPerspective}
          />
          <ScorecardDetailPanel perspective={selected} />
        </>
      ) : null}

      {!error && snapshot && snapshot.perspectiveScores.length === 0 ? (
        <ScorecardEmptyState />
      ) : null}
    </div>
  );
}
