"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import readXlsxFile from "read-excel-file/browser";
import {
  fetchScorecardDrafts,
  fetchScorecard,
  fetchScorecardKpiOptions,
  isLatestRequest,
  saveScorecardConfig,
  saveScorecardDraft,
  saveScorecardRelationships,
} from "@/app/data-entry/balanced-scorecard/client";
import type {
  CustomKpiReferenceOptions,
  ScorecardDraftObjectiveInput,
  ScorecardCustomKpiRequest,
  ScorecardFilterContext,
  ScorecardInputRow,
  ScorecardKpiOption,
  ScorecardRelationship,
  ScorecardSnapshot,
} from "@/app/data-entry/balanced-scorecard/types";
import type { ReviewKpiFilterOptions } from "@/app/data-entry/review-kpi/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import ScorecardPerspectiveHierarchyFlow from "@/components/data-entry/scorecard-perspective-hierarchy-flow";
import ScorecardStrategyMap from "@/components/data-entry/scorecard-strategy-map";
import { Download, Save, Upload } from "lucide-react";

type TrackingFrequency = "monthly" | "annually";
type TemplateTrackingMode = "monthly" | "financial_year";
type DownloadTemplateScope = "subcategory" | "category";

type DraftObjectiveKpi = {
  kpiId: string | null;
  kpiDefinitionId: number | null;
  kpiName: string;
  kpiCategoryId: number | null;
  kpiSubcategoryId: number | null;
  pendingCustomKpiRequestId: string | null;
  pendingCustomKpiTitle: string | null;
  pendingCustomKpiStatus:
    | "PENDING_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "REPLACED"
    | null;
  approvedKpiDefinitionId: number | null;
  result: "increase" | "decrease" | "completed";
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
  kpiCategoryId: number | null;
  kpiSubcategoryId: number | null;
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

type WorksheetCellStyle = {
  protection?: {
    locked?: boolean;
  };
};

const normalizeTemplateHeader = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const lockTemplateWorksheet = async (
  worksheet: import("exceljs").Worksheet,
  editableHeaders: string[],
) => {
  const editableColumns = new Set<number>();
  const headerRow = worksheet.getRow(1);

  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    if (editableHeaders.includes(normalizeTemplateHeader(cell.value))) {
      editableColumns.add(col);
    }
  });

  for (let row = 2; row <= worksheet.rowCount; row += 1) {
    for (const col of editableColumns) {
      const cell = worksheet.getRow(row).getCell(col);
      const existingProtection = (cell.style as WorksheetCellStyle).protection;
      cell.protection = {
        ...existingProtection,
        locked: false,
      };
    }
  }

  await worksheet.protect("prism-template", {
    selectLockedCells: false,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: true,
    autoFilter: true,
    pivotTables: false,
    objects: false,
    scenarios: false,
  });
};

const applyBoldHeaderRow = (worksheet: import("exceljs").Worksheet) => {
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = {
      ...(cell.font ?? {}),
      bold: true,
      color: { argb: "FF1F2937" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });
};

const applyLeftAlignment = (worksheet: import("exceljs").Worksheet) => {
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = {
        ...(cell.alignment ?? {}),
        horizontal: "left",
      };
    });
  });
};

const freezeTopRow = (worksheet: import("exceljs").Worksheet) => {
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
};

const applyHeaderFilter = (
  worksheet: import("exceljs").Worksheet,
  headerCount: number,
) => {
  if (headerCount <= 0) {
    return;
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headerCount },
  };
};

type PersistableObjective = ScorecardDraftObjectiveInput;

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
  customKpiReferenceOptions,
  mode = "default",
}: {
  initialContext: ScorecardFilterContext;
  filterOptions: ReviewKpiFilterOptions;
  kpiOptions: ScorecardKpiOption[];
  customKpiReferenceOptions: CustomKpiReferenceOptions;
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
  const [availableKpiOptions, setAvailableKpiOptions] =
    useState<ScorecardKpiOption[]>(kpiOptions);
  const [kpiDefinitionId, setKpiDefinitionId] = useState<number | null>(
    kpiOptions[0]?.kpiDefinitionId ?? null,
  );
  const [draftObjectivesByPerspective, setDraftObjectivesByPerspective] =
    useState<DraftObjectivesByPerspective>({
      1: [],
      2: [],
      3: [],
      4: [],
    });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [customKpiRequests, setCustomKpiRequests] = useState<
    ScorecardCustomKpiRequest[]
  >([]);
  const approvedCustomKpiDefinitionIds = useMemo(
    () =>
      Array.from(
        new Set(
          customKpiRequests
            .filter(
              (request) =>
                request.status === "APPROVED" &&
                request.replacementKpiDefinitionId != null,
            )
            .map((request) => request.replacementKpiDefinitionId!)
            .filter((id): id is number => Number.isInteger(id) && id > 0),
        ),
      ),
    [customKpiRequests],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [hasHydratedDraftHierarchy, setHasHydratedDraftHierarchy] =
    useState(false);
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
  const [
    isTemplateDownloadScopeDialogOpen,
    setIsTemplateDownloadScopeDialogOpen,
  ] = useState(false);
  const [isProcessingTemplate, setIsProcessingTemplate] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<
    "strategic-map" | "builder" | "strategy-tracker" | "tree-view"
  >("builder");
  const quickTemplateUploadInputRef = useRef<HTMLInputElement | null>(null);
  const autoSaveWorkerRef = useRef<Worker | null>(null);
  const lastSavedFingerprintRef = useRef<string>("");

  const normalizedContext = useMemo(
    () => ({ ...context, kpiCategoryId: null, kpiSubcategoryId: null }),
    [context],
  );

  const toPersistableObjectives = useCallback(
    (objectives: DraftObjective[]): PersistableObjective[] => {
      return objectives
        .map((objective) => ({
          description: objective.description.trim(),
          keyInitiatives: objective.keyInitiatives
            .map((initiative) => ({
              description: initiative.description.trim(),
              kpis: initiative.kpis
                .filter(
                  (kpi) =>
                    kpi.kpiDefinitionId != null ||
                    kpi.pendingCustomKpiRequestId != null,
                )
                .map((kpi) => ({
                  kpiDefinitionId: kpi.kpiDefinitionId,
                  trackingFrequency: kpi.trackingFrequency,
                  pendingCustomKpiRequestId: kpi.pendingCustomKpiRequestId,
                  pendingCustomKpiTitle: kpi.pendingCustomKpiTitle,
                  pendingCustomKpiStatus:
                    kpi.pendingCustomKpiStatus ?? undefined,
                  approvedKpiDefinitionId: kpi.approvedKpiDefinitionId,
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

  useEffect(() => {
    let active = true;

    const loadCustomKpiRequests = () => {
      return fetch("/api/data-entry/custom-kpi/requests", {
        method: "GET",
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("Unable to load pending custom KPI requests.");
          }

          const payload = (await response.json()) as {
            items?: Array<{
              id: string;
              title: string;
              status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "REPLACED";
              replacement_kpi_def_id: number | null;
            }>;
          };

          if (!active) {
            return;
          }

          const nextRequests = (payload.items ?? []).map((item) => ({
            id: item.id,
            title: item.title,
            status: item.status,
            replacementKpiDefinitionId: item.replacement_kpi_def_id,
          }));

          setCustomKpiRequests(nextRequests);
        })
        .catch(() => {
          if (!active) {
            return;
          }

          setCustomKpiRequests([]);
        });
    };

    void loadCustomKpiRequests();
    const pollId = window.setInterval(() => {
      void loadCustomKpiRequests();
    }, 30000);

    return () => {
      active = false;
      window.clearInterval(pollId);
    };
  }, []);

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
                    const requestMatch =
                      kpi.pendingCustomKpiRequestId == null
                        ? null
                        : (customKpiRequests.find(
                            (request) =>
                              request.id === kpi.pendingCustomKpiRequestId,
                          ) ?? null);
                    const resolvedDefinitionId =
                      kpi.kpiDefinitionId ??
                      kpi.approvedKpiDefinitionId ??
                      requestMatch?.replacementKpiDefinitionId ??
                      null;
                    const kpiOption =
                      resolvedDefinitionId == null
                        ? null
                        : (kpiByDefinitionId.get(resolvedDefinitionId) ?? null);
                    return {
                      kpiId: kpiOption?.kpiId ?? null,
                      kpiDefinitionId: resolvedDefinitionId,
                      kpiName:
                        kpiOption?.kpiName ??
                        kpi.pendingCustomKpiTitle ??
                        (resolvedDefinitionId == null
                          ? "Pending custom KPI"
                          : `KPI ${resolvedDefinitionId}`),
                      kpiCategoryId: kpiOption?.categoryId ?? null,
                      kpiSubcategoryId: kpiOption?.subcategoryId ?? null,
                      pendingCustomKpiRequestId:
                        resolvedDefinitionId == null
                          ? (kpi.pendingCustomKpiRequestId ?? null)
                          : null,
                      pendingCustomKpiTitle:
                        resolvedDefinitionId == null
                          ? (kpi.pendingCustomKpiTitle ?? null)
                          : null,
                      pendingCustomKpiStatus:
                        resolvedDefinitionId == null
                          ? (kpi.pendingCustomKpiStatus ??
                            requestMatch?.status ??
                            "PENDING_REVIEW")
                          : null,
                      approvedKpiDefinitionId:
                        resolvedDefinitionId == null
                          ? (kpi.approvedKpiDefinitionId ??
                            requestMatch?.replacementKpiDefinitionId ??
                            null)
                          : null,
                      result: "increase",
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
        }
      } catch (err) {
        logAutoSaveError("loadSavedBuilds:error", err);
        setSaveMessage(
          err instanceof Error ? err.message : "Unable to load saved builds.",
        );
      }
    },
    [availableKpiOptions, buildHierarchyFingerprint, customKpiRequests],
  );

  useEffect(() => {
    if (customKpiRequests.length === 0) {
      return;
    }

    const approvedDefinitionByRequestId = new Map(
      customKpiRequests
        .filter((request) => request.replacementKpiDefinitionId != null)
        .map((request) => [request.id, request.replacementKpiDefinitionId]),
    );

    if (approvedDefinitionByRequestId.size === 0) {
      return;
    }

    setDraftObjectivesByPerspective((prev) => {
      let changed = false;
      const next: DraftObjectivesByPerspective = {
        1: [],
        2: [],
        3: [],
        4: [],
      };

      for (const level of [1, 2, 3, 4] as const) {
        next[level] = prev[level].map((objective) => ({
          ...objective,
          keyInitiatives: objective.keyInitiatives.map((initiative) => ({
            ...initiative,
            kpis: initiative.kpis.map((entry) => {
              const requestId = entry.pendingCustomKpiRequestId;
              if (!requestId) {
                return entry;
              }

              const approvedDefinitionId =
                approvedDefinitionByRequestId.get(requestId) ?? null;
              if (approvedDefinitionId == null) {
                return entry;
              }

              const approvedOption =
                availableKpiOptions.find(
                  (option) => option.kpiDefinitionId === approvedDefinitionId,
                ) ?? null;

              changed = true;
              return {
                ...entry,
                kpiId: approvedOption?.kpiId ?? null,
                kpiDefinitionId: approvedDefinitionId,
                kpiName:
                  approvedOption?.kpiName ??
                  entry.kpiName ??
                  `KPI ${approvedDefinitionId}`,
                kpiCategoryId: approvedOption?.categoryId ?? null,
                kpiSubcategoryId: approvedOption?.subcategoryId ?? null,
                pendingCustomKpiRequestId: null,
                pendingCustomKpiTitle: null,
                pendingCustomKpiStatus: null,
                approvedKpiDefinitionId: approvedDefinitionId,
                isSaved: false,
              };
            }),
          })),
        }));
      }

      return changed ? next : prev;
    });
  }, [availableKpiOptions, customKpiRequests]);

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
                  kpiId: defaultKpi?.kpiId ?? null,
                  kpiDefinitionId: defaultKpi?.kpiDefinitionId ?? null,
                  kpiName: defaultKpi?.kpiName ?? "Pending custom KPI",
                  kpiCategoryId: defaultKpi?.categoryId ?? null,
                  kpiSubcategoryId: defaultKpi?.subcategoryId ?? null,
                  pendingCustomKpiRequestId: null,
                  pendingCustomKpiTitle: null,
                  pendingCustomKpiStatus: null,
                  approvedKpiDefinitionId: null,
                  result: "increase",
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
            const kpiDefinitionId = kpi.kpiDefinitionId;
            if (
              typeof kpiDefinitionId !== "number" ||
              !Number.isInteger(kpiDefinitionId) ||
              kpiDefinitionId <= 0
            ) {
              continue;
            }

            const key = [
              level,
              objectiveDescription.toLowerCase(),
              initiativeDescription.toLowerCase(),
              kpiDefinitionId,
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
              kpiDefinitionId,
              kpiName:
                kpi.kpiName.trim() ||
                kpiNameByDefinitionId.get(kpiDefinitionId) ||
                `KPI ${kpiDefinitionId}`,
              kpiCategoryId: kpi.kpiCategoryId,
              kpiSubcategoryId: kpi.kpiSubcategoryId,
            });
          }
        }
      }
    }

    return [...seeds.values()];
  }, [draftObjectivesByPerspective, kpiNameByDefinitionId]);

  const buildTemplateRowsForSeeds = useCallback(
    (seeds: TemplateSeed[]): TemplateRow[] => {
      const rows: TemplateRow[] = [];

      if (
        !Number.isInteger(templateStartYear) ||
        !Number.isInteger(templateEndYear) ||
        templateStartYear <= 0 ||
        templateEndYear < templateStartYear
      ) {
        return rows;
      }

      for (const seed of seeds) {
        if (templateTrackingMode === "monthly") {
          for (
            let year = templateStartYear;
            year <= templateEndYear;
            year += 1
          ) {
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
          for (
            let year = templateStartYear;
            year <= templateEndYear;
            year += 1
          ) {
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
    },
    [templateEndYear, templateStartYear, templateTrackingMode],
  );

  const templateRows = useMemo(
    () => buildTemplateRowsForSeeds(templateSeeds),
    [buildTemplateRowsForSeeds, templateSeeds],
  );

  const templateYearRangeIsValid =
    Number.isInteger(templateStartYear) &&
    Number.isInteger(templateEndYear) &&
    templateStartYear > 0 &&
    templateEndYear >= templateStartYear;

  const handleTemplateDownload = async (scope: DownloadTemplateScope) => {
    if (!templateYearRangeIsValid) {
      setSaveMessage(
        "Provide a valid period range where End Year is not before Start Year.",
      );
      return;
    }

    let scopedSeeds = templateSeeds;
    if (context.kpiCategoryId != null) {
      scopedSeeds = scopedSeeds.filter(
        (seed) => seed.kpiCategoryId === context.kpiCategoryId,
      );
    }

    if (scope === "subcategory") {
      if (context.kpiSubcategoryId == null) {
        setSaveMessage(
          "Select a KPI subcategory first to download a subcategory-only template.",
        );
        return;
      }

      scopedSeeds = scopedSeeds.filter(
        (seed) => seed.kpiSubcategoryId === context.kpiSubcategoryId,
      );
    }

    const rowsForDownload = buildTemplateRowsForSeeds(scopedSeeds);

    if (rowsForDownload.length === 0) {
      setSaveMessage(
        "No hierarchy rows available to generate a template. Define BSC hierarchy first.",
      );
      return;
    }

    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("BSC_Template");
      const headers = Object.keys(rowsForDownload[0] ?? {});

      worksheet.addRow(headers);
      applyBoldHeaderRow(worksheet);
      rowsForDownload.forEach((row) => {
        worksheet.addRow(
          headers.map((header) => row[header as keyof TemplateRow]),
        );
      });
      applyLeftAlignment(worksheet);
      freezeTopRow(worksheet);
      applyHeaderFilter(worksheet, headers.length);

      await lockTemplateWorksheet(worksheet, ["target_value"]);

      const output = await workbook.xlsx.writeBuffer();

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
      setSaveMessage(
        `Template downloaded with ${rowsForDownload.length} rows.`,
      );
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
        if (!silent) {
          setSaveMessage("Template hierarchy saved successfully.");
        }
        setContext((current) => ({ ...current }));
      } catch (err) {
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
  const canDownloadTemplate =
    !isProcessingTemplate &&
    templateYearRangeIsValid &&
    templateRows.length > 0;
  const canSaveTemplate = Object.values(draftObjectivesByPerspective).some(
    (objectives) => objectives.length > 0,
  );

  const strategyMapHierarchy = useMemo(
    () => ({
      1: draftObjectivesByPerspective[1].map((objective) => ({
        description: objective.description,
        keyInitiatives: objective.keyInitiatives.map((initiative) => ({
          description: initiative.description,
          kpis: initiative.kpis.map((kpi) => kpi.kpiName),
        })),
      })),
      2: draftObjectivesByPerspective[2].map((objective) => ({
        description: objective.description,
        keyInitiatives: objective.keyInitiatives.map((initiative) => ({
          description: initiative.description,
          kpis: initiative.kpis.map((kpi) => kpi.kpiName),
        })),
      })),
      3: draftObjectivesByPerspective[3].map((objective) => ({
        description: objective.description,
        keyInitiatives: objective.keyInitiatives.map((initiative) => ({
          description: initiative.description,
          kpis: initiative.kpis.map((kpi) => kpi.kpiName),
        })),
      })),
      4: draftObjectivesByPerspective[4].map((objective) => ({
        description: objective.description,
        keyInitiatives: objective.keyInitiatives.map((initiative) => ({
          description: initiative.description,
          kpis: initiative.kpis.map((kpi) => kpi.kpiName),
        })),
      })),
    }),
    [draftObjectivesByPerspective],
  );

  const handleCreateRelationship = useCallback(
    async (input: Omit<ScorecardRelationship, "id">) => {
      let nextRelationships: ScorecardRelationship[] = [];

      setScorecardRelationships((prev) => {
        const duplicate = prev.some(
          (relationship) =>
            relationship.relationshipType === input.relationshipType &&
            JSON.stringify(relationship.source) ===
              JSON.stringify(input.source) &&
            JSON.stringify(relationship.target) ===
              JSON.stringify(input.target),
        );

        if (duplicate) {
          nextRelationships = prev;
          return prev;
        }

        const next: ScorecardRelationship[] = [
          ...prev,
          {
            id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ...input,
          },
        ];

        nextRelationships = next;
        return next;
      });

      if (nextRelationships.length === 0) {
        return;
      }

      try {
        await saveScorecardRelationships({
          reportPeriodId: context.reportPeriodId,
          relationships: nextRelationships,
        });
        setSaveMessage("Relationship saved.");
      } catch (error) {
        setSaveMessage(
          error instanceof Error
            ? error.message
            : "Unable to persist relationship.",
        );
      }
    },
    [context.reportPeriodId],
  );

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
            setActiveMainTab(
              value as
                | "strategic-map"
                | "builder"
                | "strategy-tracker"
                | "tree-view",
            )
          }
          className="space-y-0"
        >
          <TabsList>
            <TabsTrigger value="builder">BSC Strategy Builder</TabsTrigger>
            <TabsTrigger value="strategic-map">BSC Strategy Map</TabsTrigger>
            <TabsTrigger value="tree-view">BSC Tree View</TabsTrigger>
            <TabsTrigger value="strategy-tracker">
              BSC Strategy Tracker
            </TabsTrigger>
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

      {mode === "builder" || activeMainTab === "builder" ? (
        <div className="space-y-3 rounded-md border bg-background p-3 sm:p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <p className="text-[11px] text-muted-foreground lg:max-w-sm">
              Build top-down: add objective rows, then initiatives, then KPIs
              under each initiative.
            </p>

            <div className="flex flex-wrap items-end justify-end gap-x-3 gap-y-2 lg:ml-auto">
              <div>
                <h2 className="text-sm font-semibold">Targets Tracking</h2>
                <div className="mt-2 flex gap-2">
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

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="text-xs"
                  variant={"outline"}
                  onClick={() => setIsTemplateDownloadScopeDialogOpen(true)}
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
                <Button
                  type="button"
                  size="sm"
                  className="text-xs w-20"
                  onClick={() => void handleTemplateSave()}
                  disabled={
                    isSaving || isProcessingTemplate || !canSaveTemplate
                  }
                >
                  <Save /> {isSaving ? "Saving..." : "Save"}
                </Button>

                <Dialog
                  open={isTemplateDownloadScopeDialogOpen}
                  onOpenChange={setIsTemplateDownloadScopeDialogOpen}
                >
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Download template scope</DialogTitle>
                      <DialogDescription>
                        Choose whether to download rows for the selected
                        subcategory only or for the whole category.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-wrap justify-end gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsTemplateDownloadScopeDialogOpen(false);
                          void handleTemplateDownload("subcategory");
                        }}
                      >
                        Subcategory only
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          setIsTemplateDownloadScopeDialogOpen(false);
                          void handleTemplateDownload("category");
                        }}
                      >
                        Whole category
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
          <ScorecardBuilderTree
            perspectiveLabels={PERSPECTIVE_LABELS}
            draftObjectivesByPerspective={draftObjectivesByPerspective}
            filterOptions={filterOptions}
            availableKpiOptions={availableKpiOptions}
            customKpiReferenceOptions={customKpiReferenceOptions}
            approvedCustomKpiDefinitionIds={approvedCustomKpiDefinitionIds}
            isProcessingTemplate={isProcessingTemplate}
            onAddObjective={addObjectiveForLevel}
            onUpdateObjectiveDescription={updateObjectiveDescriptionForLevel}
            onRemoveObjective={removeObjectiveForLevel}
            onAddInitiative={addInitiativeForLevel}
            onUpdateInitiativeDescription={updateInitiativeDescriptionForLevel}
            onRemoveInitiative={removeInitiativeForLevel}
            onAddKpi={addKpiForLevel}
            onUpdateKpi={updateKpiForLevel}
            onRemoveKpi={removeKpiForLevel}
          />

          {saveMessage ? (
            <p className="text-[11px] text-muted-foreground">{saveMessage}</p>
          ) : null}
        </div>
      ) : null}

      {mode !== "builder" && activeMainTab === "strategic-map" ? (
        <ScorecardStrategyMap
          rows={scorecardRows}
          relationships={scorecardRelationships}
          hierarchyByPerspective={strategyMapHierarchy}
          onCreateRelationship={handleCreateRelationship}
        />
      ) : null}

      {mode !== "builder" && activeMainTab === "tree-view" ? (
        <ScorecardPerspectiveHierarchyFlow
          snapshot={snapshot}
          rows={scorecardRows}
          isLoading={!snapshot && !error}
        />
      ) : null}
    </div>
  );
}
