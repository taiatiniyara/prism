"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import readXlsxFile from "read-excel-file/browser";
import ScorecardSummary from "@/components/data-entry/scorecard-summary";
import ScorecardDetailPanel from "@/components/data-entry/scorecard-detail-panel";
import ScorecardEmptyState from "@/components/data-entry/scorecard-empty-state";
import ScorecardTree from "@/components/data-entry/scorecard-tree";
import {
  fetchScorecardDrafts,
  fetchScorecard,
  fetchScorecardKpiOptions,
  isLatestRequest,
  saveScorecardConfig,
  saveScorecardDraft,
} from "@/app/data-entry/balanced-scorecard/client";
import type {
  ScorecardFilterContext,
  ScorecardInputRow,
  ScorecardKpiOption,
  ScorecardRelationship,
  ScorecardSnapshot,
} from "@/app/data-entry/balanced-scorecard/types";
import type { ReviewKpiFilterOptions } from "@/app/data-entry/review-kpi/types";
import { Button } from "@/components/ui/button";
import BorderedPanel from "@/components/ui/bordered-panel";
import BorderedGrid from "@/components/ui/bordered-grid";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { generateRandomNumber } from "@/lib/utils";
import ScorecardBuilderTree from "@/components/data-entry/scorecard-builder-tree";
import { Download, Save, Upload } from "lucide-react";

type TrackingFrequency = "monthly" | "annually";
type TemplateTrackingMode = "monthly" | "financial_year";

type DraftObjectiveKpi = {
  kpiId: string | null;
  kpiDefinitionId: number;
  kpiName: string;
  kpiCategoryId: number | null;
  kpiSubcategoryId: number | null;
  targetValue: string;
  trackingFrequency: TrackingFrequency;
  isSaved: boolean;
};

type DraftKeyInitiative = {
  id: string;
  description: string;
  kpis: DraftObjectiveKpi[];
  isSaved: boolean;
};

type DraftObjective = {
  id: string;
  description: string;
  keyInitiatives: DraftKeyInitiative[];
  isSaved: boolean;
};

type PerspectiveLevel = 1 | 2 | 3 | 4;
type DraftObjectivesByPerspective = Record<PerspectiveLevel, DraftObjective[]>;

type TemplateSeed = {
  perspectiveLevel: 1 | 2 | 3 | 4;
  strategicObjective: string;
  keyInitiative: string;
  trackingFrequency: TrackingFrequency;
  kpiDefinitionId: number;
  kpiName: string;
};

type TemplateRow = {
  perspective_level: 1 | 2 | 3 | 4;
  perspective: string;
  strategic_objective: string;
  key_initiative: string;
  tracking_frequency: TrackingFrequency;
  kpi_definition_id: number;
  kpi_name: string;
  year: number;
  month: number | null;
  target_value: string;
};

type PersistableKpi = {
  kpiDefinitionId: number;
  trackingFrequency: TrackingFrequency;
};

type PersistableInitiative = {
  description: string;
  kpis: PersistableKpi[];
};

type PersistableObjective = {
  description: string;
  keyInitiatives: PersistableInitiative[];
};

type PersistableByLevel = {
  perspectiveLevel: PerspectiveLevel;
  objectives: PersistableObjective[];
};

type AutoSaveWorkerMessage = {
  type: "status";
  status: "idle" | "saving" | "saved" | "error";
  fingerprint?: string;
  message?: string;
};

const AUTO_SAVE_DEBOUNCE_MS = 3000;
const AUTO_SAVE_MIN_CHANGE_COUNT = 1;
const AUTO_SAVE_DEBUG = true;

const PERSPECTIVE_LABELS: Record<PerspectiveLevel, string> = {
  1: "Financial",
  2: "Customer",
  3: "Operations",
  4: "Development",
};

const logAutoSave = (...args: unknown[]) => {
  if (!AUTO_SAVE_DEBUG) {
    return;
  }
  console.info("[bsc-autosave-page]", ...args);
};

const logAutoSaveError = (...args: unknown[]) => {
  if (!AUTO_SAVE_DEBUG) {
    return;
  }
  console.error("[bsc-autosave-page]", ...args);
};

export default function ScorecardPageClient({
  initialContext,
  filterOptions,
  kpiOptions,
  mode = "default",
}: {
  initialContext: ScorecardFilterContext;
  filterOptions: ReviewKpiFilterOptions;
  kpiOptions: ScorecardKpiOption[];
  mode?: "default" | "builder";
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
  const [perspectiveLevel, setPerspectiveLevel] = useState<PerspectiveLevel>(1);
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
  const [draftObjectivesByPerspective, setDraftObjectivesByPerspective] =
    useState<DraftObjectivesByPerspective>({
      1: [],
      2: [],
      3: [],
      4: [],
    });
  const [selectedExistingObjective, setSelectedExistingObjective] = useState<
    string | null
  >(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasHydratedDraftHierarchy, setHasHydratedDraftHierarchy] =
    useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [templateStartYear, setTemplateStartYear] = useState(
    new Date().getFullYear(),
  );
  const [templateEndYear, setTemplateEndYear] = useState(
    new Date().getFullYear(),
  );
  const [templateTrackingMode, setTemplateTrackingMode] =
    useState<TemplateTrackingMode>("monthly");
  const [templateUploadFile, setTemplateUploadFile] = useState<File | null>(
    null,
  );
  const [isProcessingTemplate, setIsProcessingTemplate] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<
    "strategic-map" | "builder"
  >("builder");
  const quickTemplateUploadInputRef = useRef<HTMLInputElement | null>(null);
  const autoSaveWorkerRef = useRef<Worker | null>(null);
  const lastSavedFingerprintRef = useRef<string>("");

  const draftObjectives = draftObjectivesByPerspective[perspectiveLevel];

  const updateDraftObjectivesForPerspective = (
    updater: (prev: DraftObjective[]) => DraftObjective[],
  ) => {
    setDraftObjectivesByPerspective((prev) => ({
      ...prev,
      [perspectiveLevel]: updater(prev[perspectiveLevel]),
    }));
  };

  const normalizedContext = useMemo(
    () => ({ ...context, kpiCategoryId: null, kpiSubcategoryId: null }),
    [context],
  );

  const toPersistableObjectives = useCallback(
    (objectives: DraftObjective[]) => {
      return objectives
        .map((objective) => ({
          description: objective.description.trim(),
          keyInitiatives: objective.keyInitiatives
            .map((initiative) => ({
              description: initiative.description.trim(),
              kpis: initiative.kpis.map((kpi) => ({
                kpiDefinitionId: kpi.kpiDefinitionId,
                trackingFrequency: kpi.trackingFrequency,
              })),
            }))
            .filter(
              (initiative) =>
                initiative.description.length > 0 && initiative.kpis.length > 0,
            ),
        }))
        .filter(
          (objective) =>
            objective.description.length > 0 &&
            objective.keyInitiatives.length > 0,
        );
    },
    [],
  );

  const markHierarchyAsSaved = useCallback(() => {
    setDraftObjectivesByPerspective((prev) => {
      const next: DraftObjectivesByPerspective = {
        1: [],
        2: [],
        3: [],
        4: [],
      };

      for (const level of [1, 2, 3, 4] as const) {
        next[level] = prev[level].map((objective) => ({
          ...objective,
          isSaved: true,
          keyInitiatives: objective.keyInitiatives.map((initiative) => ({
            ...initiative,
            isSaved: true,
            kpis: initiative.kpis.map((kpi) => ({
              ...kpi,
              isSaved: true,
            })),
          })),
        }));
      }

      return next;
    });
  }, []);

  const buildHierarchyFingerprint = useCallback(
    (source: DraftObjectivesByPerspective): string => {
      const normalized = ([1, 2, 3, 4] as const).map((level) => ({
        perspectiveLevel: level,
        objectives: toPersistableObjectives(source[level]),
      }));
      return JSON.stringify(normalized);
    },
    [toPersistableObjectives],
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

  const loadSavedBuilds = useCallback(
    async (hydrateHierarchy = false) => {
      try {
        const { hierarchies } = await fetchScorecardDrafts();

        if (hydrateHierarchy) {
          const kpiByDefinitionId = new Map(
            availableKpiOptions.map((option) => [
              option.kpiDefinitionId,
              option,
            ]),
          );
          const nextByPerspective: DraftObjectivesByPerspective = {
            1: [],
            2: [],
            3: [],
            4: [],
          };

          for (const perspective of hierarchies) {
            nextByPerspective[perspective.perspectiveLevel] =
              perspective.objectives.map((objective) => ({
                id: `${Date.now()}-${Math.random()}`,
                description: objective.description,
                keyInitiatives: objective.keyInitiatives.map((initiative) => ({
                  id: `${Date.now()}-${Math.random()}`,
                  description: initiative.description,
                  kpis: initiative.kpis.map((kpi) => {
                    const kpiOption = kpiByDefinitionId.get(
                      kpi.kpiDefinitionId,
                    );
                    return {
                      kpiId: kpiOption?.kpiId ?? null,
                      kpiDefinitionId: kpi.kpiDefinitionId,
                      kpiName:
                        kpiOption?.kpiName ?? `KPI ${kpi.kpiDefinitionId}`,
                      kpiCategoryId: kpiOption?.categoryId ?? null,
                      kpiSubcategoryId: kpiOption?.subcategoryId ?? null,
                      targetValue: "",
                      trackingFrequency:
                        kpi.trackingFrequency === "annually"
                          ? "annually"
                          : "monthly",
                      isSaved: true,
                    };
                  }),
                  isSaved: true,
                })),
                isSaved: true,
              }));
          }

          lastSavedFingerprintRef.current =
            buildHierarchyFingerprint(nextByPerspective);
          logAutoSave("loadSavedBuilds:set-fingerprint", {
            fingerprint: lastSavedFingerprintRef.current,
          });
          autoSaveWorkerRef.current?.postMessage({
            type: "setSavedFingerprint",
            fingerprint: lastSavedFingerprintRef.current,
          });
          setDraftObjectivesByPerspective(nextByPerspective);
          setHasHydratedDraftHierarchy(true);
          setAutoSaveStatus("saved");
        }
      } catch (err) {
        logAutoSaveError("loadSavedBuilds:error", err);
        setSaveMessage(
          err instanceof Error ? err.message : "Unable to load saved builds.",
        );
        setAutoSaveStatus("error");
      }
    },
    [availableKpiOptions, buildHierarchyFingerprint],
  );

  useEffect(() => {
    if (typeof Worker === "undefined") {
      return;
    }

    const worker = new Worker(
      new URL("./autosave.worker.ts", import.meta.url),
      { type: "module" },
    );
    autoSaveWorkerRef.current = worker;
    logAutoSave("worker:created");

    const onMessage = (event: MessageEvent<AutoSaveWorkerMessage>) => {
      const message = event.data;
      if (message.type !== "status") {
        return;
      }

      logAutoSave("worker:status", message);

      setAutoSaveStatus(message.status);

      if (
        message.status === "saved" &&
        message.fingerprint != null &&
        message.fingerprint !== lastSavedFingerprintRef.current
      ) {
        lastSavedFingerprintRef.current = message.fingerprint;
        markHierarchyAsSaved();
        setContext((current) => ({ ...current }));
      }

      if (message.status === "error") {
        logAutoSaveError("worker:status:error", message);
        setSaveMessage(message.message ?? "Unable to save template.");
      }
    };

    worker.addEventListener("message", onMessage);
    worker.postMessage({
      type: "init",
      debounceMs: AUTO_SAVE_DEBOUNCE_MS,
      minChangeCount: AUTO_SAVE_MIN_CHANGE_COUNT,
      lastSavedFingerprint: lastSavedFingerprintRef.current,
      apiOrigin: window.location.origin,
    });
    logAutoSave("worker:init-posted", {
      debounceMs: AUTO_SAVE_DEBOUNCE_MS,
      minChangeCount: AUTO_SAVE_MIN_CHANGE_COUNT,
      lastSavedFingerprint: lastSavedFingerprintRef.current,
    });

    return () => {
      logAutoSave("worker:teardown");
      worker.postMessage({ type: "stop" });
      worker.removeEventListener("message", onMessage);
      worker.terminate();
      if (autoSaveWorkerRef.current === worker) {
        autoSaveWorkerRef.current = null;
      }
    };
  }, [markHierarchyAsSaved]);

  useEffect(() => {
    if (mode !== "builder" && activeMainTab !== "builder") {
      return;
    }

    void loadSavedBuilds(!hasHydratedDraftHierarchy);
  }, [activeMainTab, hasHydratedDraftHierarchy, loadSavedBuilds, mode]);

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

  const kpiOptionByDefinitionId = useMemo(
    () =>
      new Map(
        availableKpiOptions.map((option) => [option.kpiDefinitionId, option]),
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
          isSaved: true,
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
        kpiCategoryId:
          kpiOptionByDefinitionId.get(row.kpiDefinitionId)?.categoryId ?? null,
        kpiSubcategoryId:
          kpiOptionByDefinitionId.get(row.kpiDefinitionId)?.subcategoryId ??
          null,
        targetValue: row.targetValue == null ? "" : String(row.targetValue),
        trackingFrequency:
          row.trackingFrequency === "annually" ? "annually" : "monthly",
        isSaved: true,
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

  const createDraftId = () => `${Date.now()}-${Math.random()}`;

  const updateDraftObjectivesForLevel = (
    level: PerspectiveLevel,
    updater: (prev: DraftObjective[]) => DraftObjective[],
  ) => {
    setDraftObjectivesByPerspective((prev) => ({
      ...prev,
      [level]: updater(prev[level]),
    }));
  };

  const addObjectiveForLevel = (level: PerspectiveLevel) => {
    updateDraftObjectivesForLevel(level, (prev) => [
      ...prev,
      {
        id: createDraftId(),
        description: "",
        keyInitiatives: [],
        isSaved: false,
      },
    ]);
  };

  const updateObjectiveDescriptionForLevel = (
    level: PerspectiveLevel,
    objectiveId: string,
    value: string,
  ) => {
    updateDraftObjectivesForLevel(level, (prev) =>
      prev.map((objective) =>
        objective.id === objectiveId
          ? { ...objective, description: value, isSaved: false }
          : objective,
      ),
    );
  };

  const addInitiativeForLevel = (
    level: PerspectiveLevel,
    objectiveId: string,
  ) => {
    updateDraftObjectivesForLevel(level, (prev) =>
      prev.map((objective) => {
        if (objective.id !== objectiveId) {
          return objective;
        }

        return {
          ...objective,
          isSaved: false,
          keyInitiatives: [
            ...objective.keyInitiatives,
            {
              id: createDraftId(),
              description: "",
              kpis: [],
              isSaved: false,
            },
          ],
        };
      }),
    );
  };

  const updateInitiativeDescriptionForLevel = (
    level: PerspectiveLevel,
    objectiveId: string,
    initiativeId: string,
    value: string,
  ) => {
    updateDraftObjectivesForLevel(level, (prev) =>
      prev.map((objective) => {
        if (objective.id !== objectiveId) {
          return objective;
        }

        return {
          ...objective,
          isSaved: false,
          keyInitiatives: objective.keyInitiatives.map((initiative) =>
            initiative.id === initiativeId
              ? { ...initiative, description: value, isSaved: false }
              : initiative,
          ),
        };
      }),
    );
  };

  const addKpiForLevel = (
    level: PerspectiveLevel,
    objectiveId: string,
    initiativeId: string,
  ) => {
    const defaultKpi = selectedKpiOption ?? availableKpiOptions[0] ?? null;

    if (defaultKpi == null) {
      setSaveMessage("No KPI options available to add a placeholder row.");
      return;
    }

    updateDraftObjectivesForLevel(level, (prev) =>
      prev.map((objective) => {
        if (objective.id !== objectiveId) {
          return objective;
        }

        return {
          ...objective,
          isSaved: false,
          keyInitiatives: objective.keyInitiatives.map((initiative) => {
            if (initiative.id !== initiativeId) {
              return initiative;
            }

            return {
              ...initiative,
              isSaved: false,
              kpis: [
                ...initiative.kpis,
                {
                  kpiId: defaultKpi.kpiId,
                  kpiDefinitionId: defaultKpi.kpiDefinitionId,
                  kpiName: defaultKpi.kpiName,
                  kpiCategoryId: defaultKpi.categoryId,
                  kpiSubcategoryId: defaultKpi.subcategoryId,
                  targetValue: "",
                  trackingFrequency: "monthly",
                  isSaved: false,
                },
              ],
            };
          }),
        };
      }),
    );
  };

  const updateKpiForLevel = (
    level: PerspectiveLevel,
    objectiveId: string,
    initiativeId: string,
    index: number,
    patch: Partial<DraftObjectiveKpi>,
  ) => {
    updateDraftObjectivesForLevel(level, (prev) =>
      prev.map((objective) => {
        if (objective.id !== objectiveId) {
          return objective;
        }

        return {
          ...objective,
          isSaved: false,
          keyInitiatives: objective.keyInitiatives.map((initiative) => {
            if (initiative.id !== initiativeId) {
              return initiative;
            }

            return {
              ...initiative,
              isSaved: false,
              kpis: initiative.kpis.map((kpi, kpiIndex) =>
                kpiIndex === index
                  ? {
                      ...kpi,
                      ...patch,
                      isSaved: false,
                    }
                  : kpi,
              ),
            };
          }),
        };
      }),
    );
  };

  const removeInitiativeForLevel = (
    level: PerspectiveLevel,
    objectiveId: string,
    initiativeId: string,
  ) => {
    updateDraftObjectivesForLevel(level, (prev) =>
      prev.map((objective) => {
        if (objective.id !== objectiveId) {
          return objective;
        }

        return {
          ...objective,
          isSaved: false,
          keyInitiatives: objective.keyInitiatives.filter(
            (initiative) => initiative.id !== initiativeId,
          ),
        };
      }),
    );
  };

  const removeKpiForLevel = (
    level: PerspectiveLevel,
    objectiveId: string,
    initiativeId: string,
    index: number,
  ) => {
    updateDraftObjectivesForLevel(level, (prev) =>
      prev.map((objective) => {
        if (objective.id !== objectiveId) {
          return objective;
        }

        return {
          ...objective,
          isSaved: false,
          keyInitiatives: objective.keyInitiatives.map((initiative) => {
            if (initiative.id !== initiativeId) {
              return initiative;
            }

            return {
              ...initiative,
              isSaved: false,
              kpis: initiative.kpis.filter((_, kpiIndex) => kpiIndex !== index),
            };
          }),
        };
      }),
    );
  };

  const removeObjectiveForLevel = (
    level: PerspectiveLevel,
    objectiveId: string,
  ) => {
    updateDraftObjectivesForLevel(level, (prev) =>
      prev.filter((item) => item.id !== objectiveId),
    );
  };

  const templateBuilderOnly = true;

  const templateSeeds = useMemo(() => {
    const seeds = new Map<string, TemplateSeed>();
    const perspectiveLevels: PerspectiveLevel[] = [1, 2, 3, 4];

    for (const level of perspectiveLevels) {
      const objectives = draftObjectivesByPerspective[level];

      for (const objective of objectives) {
        const objectiveDescription = objective.description.trim();
        if (objectiveDescription.length === 0) {
          continue;
        }

        for (const initiative of objective.keyInitiatives) {
          const initiativeDescription = initiative.description.trim();
          if (initiativeDescription.length === 0) {
            continue;
          }

          for (const kpi of initiative.kpis) {
            if (
              !Number.isInteger(kpi.kpiDefinitionId) ||
              kpi.kpiDefinitionId <= 0
            ) {
              continue;
            }

            const key = [
              level,
              objectiveDescription.toLowerCase(),
              initiativeDescription.toLowerCase(),
              kpi.kpiDefinitionId,
            ].join("|");

            if (seeds.has(key)) {
              continue;
            }

            seeds.set(key, {
              perspectiveLevel: level,
              strategicObjective: objectiveDescription,
              keyInitiative: initiativeDescription,
              trackingFrequency:
                kpi.trackingFrequency === "annually" ? "annually" : "monthly",
              kpiDefinitionId: kpi.kpiDefinitionId,
              kpiName:
                kpi.kpiName.trim() ||
                kpiNameByDefinitionId.get(kpi.kpiDefinitionId) ||
                `KPI ${kpi.kpiDefinitionId}`,
            });
          }
        }
      }
    }

    return [...seeds.values()];
  }, [draftObjectivesByPerspective, kpiNameByDefinitionId]);

  const templateRows = useMemo(() => {
    const rows: TemplateRow[] = [];

    if (
      !Number.isInteger(templateStartYear) ||
      !Number.isInteger(templateEndYear) ||
      templateStartYear <= 0 ||
      templateEndYear < templateStartYear
    ) {
      return rows;
    }

    for (const seed of templateSeeds) {
      if (templateTrackingMode === "monthly") {
        for (let year = templateStartYear; year <= templateEndYear; year += 1) {
          for (let month = 1; month <= 12; month += 1) {
            rows.push({
              perspective_level: seed.perspectiveLevel,
              perspective: PERSPECTIVE_LABELS[seed.perspectiveLevel],
              strategic_objective: seed.strategicObjective,
              key_initiative: seed.keyInitiative,
              tracking_frequency: "monthly",
              kpi_definition_id: seed.kpiDefinitionId,
              kpi_name: seed.kpiName,
              year,
              month,
              target_value: "",
            });
          }
        }
      } else {
        for (let year = templateStartYear; year <= templateEndYear; year += 1) {
          rows.push({
            perspective_level: seed.perspectiveLevel,
            perspective: PERSPECTIVE_LABELS[seed.perspectiveLevel],
            strategic_objective: seed.strategicObjective,
            key_initiative: seed.keyInitiative,
            tracking_frequency: "annually",
            kpi_definition_id: seed.kpiDefinitionId,
            kpi_name: seed.kpiName,
            year,
            month: null,
            target_value: "",
          });
        }
      }
    }

    return rows;
  }, [templateEndYear, templateSeeds, templateStartYear, templateTrackingMode]);

  const templateYearRangeIsValid =
    Number.isInteger(templateStartYear) &&
    Number.isInteger(templateEndYear) &&
    templateStartYear > 0 &&
    templateEndYear >= templateStartYear;

  const handleTemplateDownload = async () => {
    if (!templateYearRangeIsValid) {
      setSaveMessage(
        "Provide a valid period range where End Year is not before Start Year.",
      );
      return;
    }

    if (templateRows.length === 0) {
      setSaveMessage(
        "No hierarchy rows available to generate a template. Define BSC hierarchy first.",
      );
      return;
    }

    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(templateRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, "BSC_Template");

      const output = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });

      const blob = new Blob([output], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bsc_template_#${generateRandomNumber(4)}_for_${templateStartYear}-${templateEndYear}_${templateTrackingMode}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSaveMessage(`Template downloaded with ${templateRows.length} rows.`);
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? err.message : "Unable to download template.",
      );
    }
  };

  const uploadTemplateFile = async (file: File) => {
    setIsProcessingTemplate(true);
    setSaveMessage(null);

    try {
      const [headerRow, ...dataRows] = await readXlsxFile(file);
      const headers = headerRow.map((cell: unknown) =>
        String(cell ?? "")
          .trim()
          .toLowerCase(),
      );

      const indexOf = (name: string) => headers.indexOf(name);

      const requiredHeaders = [
        "perspective_level",
        "strategic_objective",
        "key_initiative",
        "tracking_frequency",
        "kpi_definition_id",
        "year",
        "month",
        "target_value",
      ];

      for (const column of requiredHeaders) {
        if (indexOf(column) < 0) {
          throw new Error(`Template is missing required column: ${column}`);
        }
      }

      let updatedCount = 0;

      for (const row of dataRows) {
        const targetValue = String(row[indexOf("target_value")] ?? "").trim();
        if (targetValue.length === 0) {
          continue;
        }

        const perspectiveLevel = Number(row[indexOf("perspective_level")]) as
          | 1
          | 2
          | 3
          | 4;
        const strategicObjective = String(
          row[indexOf("strategic_objective")] ?? "",
        ).trim();
        const keyInitiative = String(
          row[indexOf("key_initiative")] ?? "",
        ).trim();
        const trackingFrequencyRaw = String(
          row[indexOf("tracking_frequency")] ?? "",
        ).toLowerCase();
        const trackingFrequency: TrackingFrequency =
          trackingFrequencyRaw === "annually" ? "annually" : "monthly";
        const kpiDefinitionId = Number(row[indexOf("kpi_definition_id")]);
        const year = Number(row[indexOf("year")]);
        const monthCell = row[indexOf("month")];
        const month =
          monthCell == null || String(monthCell).trim().length === 0
            ? null
            : Number(monthCell);

        if (![1, 2, 3, 4].includes(perspectiveLevel)) {
          throw new Error("Template has invalid perspective_level value.");
        }

        if (!Number.isInteger(kpiDefinitionId) || kpiDefinitionId <= 0) {
          throw new Error("Template has invalid kpi_definition_id value.");
        }

        if (!Number.isInteger(year) || year < 1900 || year > 3000) {
          throw new Error("Template has invalid year value.");
        }

        if (
          month != null &&
          (!Number.isInteger(month) || month < 1 || month > 12)
        ) {
          throw new Error("Template has invalid month value.");
        }

        const kpiOption = availableKpiOptions.find(
          (option) => option.kpiDefinitionId === kpiDefinitionId,
        );

        await saveScorecardConfig({
          kpiId: kpiOption?.kpiId ?? null,
          kpiDefinitionId,
          perspectiveLevel,
          perspectiveDescription: PERSPECTIVE_LABELS[perspectiveLevel],
          strategicObjective,
          keyInitiative,
          trackingFrequency,
          target: {
            year,
            month,
            targetValue,
          },
        });

        updatedCount += 1;
      }

      setSaveMessage(`Uploaded ${updatedCount} KPI target row(s).`);
      setContext((current) => ({ ...current }));
      setTemplateUploadFile(null);
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? err.message : "Unable to upload template.",
      );
    } finally {
      setIsProcessingTemplate(false);
    }
  };

  const handleTemplateUpload = async () => {
    if (templateUploadFile == null) {
      setSaveMessage("Select a filled template file first.");
      return;
    }

    await uploadTemplateFile(templateUploadFile);
  };

  const persistableByLevel = useMemo<PersistableByLevel[]>(
    () =>
      ([1, 2, 3, 4] as const).map((level) => ({
        perspectiveLevel: level,
        objectives: toPersistableObjectives(
          draftObjectivesByPerspective[level],
        ),
      })),
    [draftObjectivesByPerspective, toPersistableObjectives],
  );

  const persistTemplateHierarchy = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (isProcessingTemplate) {
        return;
      }

      if (!silent) {
        setSaveMessage(null);
      }
      setIsSaving(true);
      setAutoSaveStatus("saving");

      try {
        for (const item of persistableByLevel) {
          if (item.objectives.length === 0) {
            continue;
          }

          await saveScorecardDraft({
            reportPeriodId: context.reportPeriodId,
            perspectiveLevel: item.perspectiveLevel,
            perspectiveDescription: PERSPECTIVE_LABELS[item.perspectiveLevel],
            objectives: item.objectives,
          });
        }

        markHierarchyAsSaved();

        lastSavedFingerprintRef.current = JSON.stringify(persistableByLevel);
        autoSaveWorkerRef.current?.postMessage({
          type: "setSavedFingerprint",
          fingerprint: lastSavedFingerprintRef.current,
        });
        setAutoSaveStatus("saved");
        if (!silent) {
          setSaveMessage("Template hierarchy saved successfully.");
        }
        setContext((current) => ({ ...current }));
      } catch (err) {
        setAutoSaveStatus("error");
        setSaveMessage(
          err instanceof Error ? err.message : "Unable to save template.",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [
      context.reportPeriodId,
      isProcessingTemplate,
      markHierarchyAsSaved,
      persistableByLevel,
    ],
  );

  const hierarchyFingerprint = useMemo(
    () => buildHierarchyFingerprint(draftObjectivesByPerspective),
    [buildHierarchyFingerprint, draftObjectivesByPerspective],
  );

  useEffect(() => {
    if (mode !== "builder" && activeMainTab !== "builder") {
      return;
    }

    if (!hasHydratedDraftHierarchy || isProcessingTemplate || isSaving) {
      return;
    }

    autoSaveWorkerRef.current?.postMessage({
      type: "change",
      fingerprint: hierarchyFingerprint,
      reportPeriodId: context.reportPeriodId,
      persistableByLevel,
    });
    logAutoSave("worker:change-posted", {
      fingerprint: hierarchyFingerprint,
      reportPeriodId: context.reportPeriodId,
      levelObjectiveCounts: persistableByLevel.map((item) => ({
        perspectiveLevel: item.perspectiveLevel,
        objectiveCount: item.objectives.length,
      })),
    });
  }, [
    activeMainTab,
    context.reportPeriodId,
    hasHydratedDraftHierarchy,
    hierarchyFingerprint,
    isProcessingTemplate,
    isSaving,
    mode,
    persistableByLevel,
  ]);

  const handleTemplateSave = async () => {
    await persistTemplateHierarchy();
  };

  const perspectiveLabel = PERSPECTIVE_LABELS[perspectiveLevel];
  const objectiveName = strategicObjective.trim();
  const initiativeName = keyInitiative.trim();
  const hasObjectiveContext =
    objectiveName.length > 0 || currentObjectiveInitiatives.length > 0;
  const hasInitiativeContext =
    initiativeName.length > 0 || currentInitiativeKpis.length > 0;
  const hasDraftedObjective = draftObjectives.length > 0;
  const canDownloadTemplate =
    !isProcessingTemplate &&
    templateYearRangeIsValid &&
    templateRows.length > 0;
  const canSaveTemplate = Object.values(draftObjectivesByPerspective).some(
    (objectives) => objectives.length > 0,
  );
  const hasUnsavedHierarchyChanges =
    canSaveTemplate && hierarchyFingerprint !== lastSavedFingerprintRef.current;
  const step1CardClass =
    "rounded border border-white bg-slate-50 px-1.5 py-1 text-[11px]";
  const step2CardClass =
    "rounded border border-white bg-indigo-50 px-1.5 py-1 text-[11px]";
  const step3CardClass =
    "rounded border border-white bg-amber-50 px-1.5 py-1 text-[11px]";
  const step4CardClass =
    "rounded border border-white bg-cyan-50 px-1.5 py-1 text-[11px]";
  const step5CardClass =
    "rounded border border-white bg-lime-50 px-1.5 py-1 text-[11px]";

  return (
    <div className="space-y-2 p-1.5 sm:p-2">
      {!snapshot && !error ? (
        <div className="text-xs text-muted-foreground">
          Loading scorecard...
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-white bg-rose-50 p-2 text-xs text-rose-800">
          {error}
        </div>
      ) : null}

      {mode !== "builder" ? (
        <Tabs
          value={activeMainTab}
          onValueChange={(value) =>
            setActiveMainTab(value as "strategic-map" | "builder")
          }
          className="space-y-0"
        >
          <TabsList>
            <TabsTrigger value="builder">BSC Template Builder</TabsTrigger>
            <TabsTrigger value="strategic-map">BSC Strategy Map</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      <input
        ref={quickTemplateUploadInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          if (file != null) {
            void uploadTemplateFile(file);
          }

          event.currentTarget.value = "";
        }}
      />

      {mode === "builder" ? (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            asChild
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2 text-xs"
          >
            <Link href="/data-entry/balanced-scorecard">Back to Scorecard</Link>
          </Button>
        </div>
      ) : null}

      {mode === "builder" || activeMainTab === "builder" ? (
        <div className="space-y-3 rounded-md border bg-background p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <p className="mt-1 text-[11px] text-muted-foreground">
              Build top-down: add objective rows, then initiatives, then KPIs
              under each initiative.
            </p>
            <div className="flex flex-wrap gap-1 text-[10px]">
              <span className="rounded border border-white bg-slate-100 px-1.5 py-0.5 text-slate-800">
                Objective
              </span>
              <span className="rounded border border-white bg-amber-100 px-1.5 py-0.5 text-amber-800">
                Initiative
              </span>
              <span className="rounded border border-white bg-lime-100 px-1.5 py-0.5 text-lime-800">
                KPI
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div>
                <h2 className="text-sm font-semibold">Targets Tracking</h2>
                <div className="flex mt-2 gap-2">
                  <div className="flex-col flex space-y-1">
                    <label className="text-[11px] font-medium">
                      Start Year
                    </label>
                    <Input
                      type="number"
                      className="bg-white w-20 text-xs"
                      value={templateStartYear}
                      onChange={(event) =>
                        setTemplateStartYear(Number(event.target.value) || 0)
                      }
                      disabled={isProcessingTemplate}
                    />
                  </div>

                  <div className="flex-col flex space-y-1">
                    <label className="text-[11px] font-medium">End Year</label>
                    <Input
                      type="number"
                      className="bg-white w-20 text-xs"
                      value={templateEndYear}
                      onChange={(event) =>
                        setTemplateEndYear(Number(event.target.value) || 0)
                      }
                      disabled={isProcessingTemplate}
                    />
                  </div>

                  <div className="flex-col flex space-y-1">
                    <label className="text-[11px] font-medium">
                      Tracking Frequency
                    </label>
                    <Select
                      value={templateTrackingMode}
                      onValueChange={(value) =>
                        setTemplateTrackingMode(value as TemplateTrackingMode)
                      }
                      disabled={isProcessingTemplate}
                    >
                      <SelectTrigger className="bg-white shadow text-xs">
                        <SelectValue placeholder="Select tracking" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="financial_year">
                          Financial Year
                        </SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                className="text-xs"
                variant={"outline"}
                onClick={() => void handleTemplateDownload()}
                disabled={!canDownloadTemplate}
              >
                <Download /> Download Excel Template
              </Button>
              <Button
                type="button"
                size="sm"
                variant={"outline"}
                className="text-xs"
                onClick={() => {
                  if (templateUploadFile == null) {
                    quickTemplateUploadInputRef.current?.click();
                    return;
                  }

                  void handleTemplateUpload();
                }}
                disabled={isProcessingTemplate || templateRows.length === 0}
              >
                <Upload />
                {isProcessingTemplate
                  ? "Uploading..."
                  : "Upload Excel Template"}
              </Button>
              <p className="self-center text-[11px] text-muted-foreground">
                {autoSaveStatus === "saving"
                  ? "Autosaving..."
                  : autoSaveStatus === "error"
                    ? "Autosave failed"
                    : hasUnsavedHierarchyChanges
                      ? "Unsaved changes"
                      : "All changes saved"}
              </p>
              <Button
                type="button"
                size="sm"
                className="text-xs"
                variant={"outline"}
                onClick={() => void handleTemplateSave()}
                disabled={isSaving || isProcessingTemplate || !canSaveTemplate}
              >
                <Save /> {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          {templateBuilderOnly ? (
            <div className="space-y-4">
              <div className="space-y-4">
                <div className="rounded-md border border-white bg-slate-50/50 p-3">
                  <div className="mt-2">
                    <ScorecardBuilderTree
                      perspectiveLabels={PERSPECTIVE_LABELS}
                      draftObjectivesByPerspective={
                        draftObjectivesByPerspective
                      }
                      filterOptions={filterOptions}
                      availableKpiOptions={availableKpiOptions}
                      isProcessingTemplate={isProcessingTemplate}
                      onAddObjective={addObjectiveForLevel}
                      onUpdateObjectiveDescription={
                        updateObjectiveDescriptionForLevel
                      }
                      onRemoveObjective={removeObjectiveForLevel}
                      onAddInitiative={addInitiativeForLevel}
                      onUpdateInitiativeDescription={
                        updateInitiativeDescriptionForLevel
                      }
                      onRemoveInitiative={removeInitiativeForLevel}
                      onAddKpi={addKpiForLevel}
                      onUpdateKpi={updateKpiForLevel}
                      onRemoveKpi={removeKpiForLevel}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className={templateBuilderOnly ? "hidden" : "block"}>
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
                    {currentInitiativeKpis.length > 0
                      ? "In progress"
                      : "Waiting"}
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
              <div className="space-y-0.5 rounded-md border border-white bg-slate-50 p-2">
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
                  <SelectTrigger className="bg-white text-xs">
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

              <div className="space-y-1.5 rounded-md border border-white bg-indigo-50 p-2 md:col-span-2">
                <div className="space-y-0.5">
                  <label className="text-[11px] font-medium">
                    Step 2 (Optional): Load Existing Objective
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    Select an existing objective to edit its initiatives and KPI
                    targets.
                  </p>
                  <SearchableSelect
                    value={selectedExistingObjective ?? ""}
                    onValueChange={(value) =>
                      handleExistingObjectiveSelect(
                        value.length === 0 ? null : value,
                      )
                    }
                    disabled={existingObjectiveItems.length === 0 || isSaving}
                    options={existingObjectiveItems.map((item) => ({
                      value: item,
                      label: item,
                    }))}
                    placeholder="Select an objective"
                    searchPlaceholder="Search objective"
                    emptyLabel="No objectives found."
                    triggerClassName="bg-white text-xs"
                    searchContainerClassName="sticky top-0 z-10 bg-popover p-1"
                    searchInputClassName="h-8 bg-white text-xs"
                    allowEscapeKeyPropagation={false}
                  />
                </div>

                <div className="space-y-0.5">
                  <label className="text-[11px] font-medium">
                    Step 2: Strategic Objective
                  </label>
                  <Input
                    name="strategicObjective"
                    value={strategicObjective}
                    maxLength={50}
                    onChange={(event) =>
                      setStrategicObjective(event.target.value)
                    }
                    className="h-8 bg-white text-xs"
                    disabled={isSaving}
                  />
                </div>
              </div>

              <div className="space-y-0.5 rounded-md border border-white bg-amber-50 p-2 md:col-span-2">
                <label className="text-[11px] font-medium">
                  Step 3: Key Initiative
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Add one initiative at a time under the objective above.
                </p>
                <Input
                  name="keyInitiative"
                  value={keyInitiative}
                  maxLength={50}
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

              <div className="md:col-span-2 mt-1 rounded-md border border-white bg-cyan-50 p-2">
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
                    <SearchableSelect
                      value={
                        kpiDefinitionId == null ? "" : String(kpiDefinitionId)
                      }
                      onValueChange={(value) => {
                        setKpiDefinitionId(Number(value));
                      }}
                      disabled={
                        availableKpiOptions.length === 0 ||
                        isSaving ||
                        !hasInitiativeContext
                      }
                      options={availableKpiOptions.map((option) => ({
                        value: String(option.kpiDefinitionId),
                        label: option.kpiName,
                      }))}
                      placeholder="Select KPI"
                      searchPlaceholder="Search KPI"
                      emptyLabel="No KPIs found."
                      triggerClassName="bg-white text-xs"
                      searchContainerClassName="sticky top-0 z-10 bg-popover p-1"
                      searchInputClassName="h-8 bg-white text-xs"
                      allowEscapeKeyPropagation={false}
                    />
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
                      <SelectTrigger className="bg-white text-xs">
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
                        kpiCategoryId: selectedKpiOption.categoryId,
                        kpiSubcategoryId: selectedKpiOption.subcategoryId,
                        targetValue: targetValue.trim(),
                        trackingFrequency,
                        isSaved: false,
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
                  <div className="mt-1.5 overflow-hidden rounded-md border border-white bg-white">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-2 py-1 font-medium">KPI</th>
                          <th className="px-2 py-1 font-medium">Target</th>
                          <th className="px-2 py-1 font-medium">Tracking</th>
                          <th className="px-2 py-1 text-right font-medium">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentInitiativeKpis.map((item, index) => (
                          <tr
                            key={`${item.kpiDefinitionId}-${index}`}
                            className="border-t border-slate-200"
                          >
                            <td className="px-2 py-1.5">{item.kpiName}</td>
                            <td className="px-2 py-1.5">{item.targetValue}</td>
                            <td className="px-2 py-1.5 capitalize">
                              {item.trackingFrequency}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-[11px]"
                                onClick={() =>
                                  setCurrentInitiativeKpis((prev) =>
                                    prev.filter(
                                      (_, itemIndex) => itemIndex !== index,
                                    ),
                                  )
                                }
                              >
                                Remove
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                        isSaved: false,
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

                <BorderedPanel className="mt-2 p-2">
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
                          <BorderedGrid key={initiative.id}>
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
                            <div className="mt-1 overflow-hidden rounded border border-white bg-white">
                              <table className="w-full text-left text-[11px] text-slate-700">
                                <thead className="bg-slate-100">
                                  <tr>
                                    <th className="px-2 py-1 font-medium">
                                      KPI
                                    </th>
                                    <th className="px-2 py-1 font-medium">
                                      Target
                                    </th>
                                    <th className="px-2 py-1 font-medium">
                                      Tracking
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {initiative.kpis.map((kpi, index) => (
                                    <tr
                                      key={`${initiative.id}-${kpi.kpiDefinitionId}-${index}`}
                                      className="border-t border-slate-200"
                                    >
                                      <td className="px-2 py-1.5">
                                        {kpi.kpiName}
                                      </td>
                                      <td className="px-2 py-1.5">
                                        {kpi.targetValue}
                                      </td>
                                      <td className="px-2 py-1.5 capitalize">
                                        {kpi.trackingFrequency}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </BorderedGrid>
                        ),
                      )}
                    </ul>
                  )}
                </BorderedPanel>

                <div className="mt-1.5 rounded-md border border-white bg-lime-50 p-2">
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
                        isSaved: false,
                      };

                      updateDraftObjectivesForPerspective((prev) => {
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

              <BorderedPanel className="mt-2 p-2">
                <p className="text-[11px] font-medium">Draft Objectives</p>
                {draftObjectives.length === 0 ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    No objectives added yet.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1.5">
                    {draftObjectives.map((objective, objectiveIndex) => (
                      <BorderedGrid key={objective.id}>
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
                              updateDraftObjectivesForPerspective((prev) =>
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
                                <div className="mt-0.5 overflow-hidden rounded border border-white bg-white">
                                  <table className="w-full text-left text-[11px] text-slate-700">
                                    <thead className="bg-slate-100">
                                      <tr>
                                        <th className="px-2 py-1 font-medium">
                                          KPI
                                        </th>
                                        <th className="px-2 py-1 font-medium">
                                          Target
                                        </th>
                                        <th className="px-2 py-1 font-medium">
                                          Tracking
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {initiative.kpis.map((kpi, index) => (
                                        <tr
                                          key={`${initiative.id}-${kpi.kpiDefinitionId}-${index}`}
                                          className="border-t border-slate-200"
                                        >
                                          <td className="px-2 py-1.5">
                                            {kpi.kpiName}
                                          </td>
                                          <td className="px-2 py-1.5">
                                            {kpi.targetValue}
                                          </td>
                                          <td className="px-2 py-1.5 capitalize">
                                            {kpi.trackingFrequency}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </BorderedGrid>
                    ))}
                  </ul>
                )}
              </BorderedPanel>
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
                          });
                        }
                      }
                    }

                    setSaveMessage(
                      "Perspective objectives saved successfully.",
                    );
                    updateDraftObjectivesForPerspective(() => []);
                    setCurrentInitiativeKpis([]);
                    setCurrentObjectiveInitiatives([]);
                    setStrategicObjective("");
                    setKeyInitiative("");
                    setTargetValue("");
                    setContext((current) => ({ ...current }));
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
              {saveMessage ? (
                <span className="text-[11px] text-muted-foreground">
                  {saveMessage}
                </span>
              ) : null}
            </div>

            {availableKpiOptions.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No KPI options available for this filter context.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {mode !== "builder" &&
      activeMainTab === "strategic-map" &&
      snapshot &&
      snapshot.perspectiveScores.length > 0 ? (
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

      {mode !== "builder" &&
      activeMainTab === "strategic-map" &&
      !error &&
      snapshot &&
      snapshot.perspectiveScores.length === 0 ? (
        <ScorecardEmptyState />
      ) : null}
    </div>
  );
}
