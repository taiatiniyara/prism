"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import readXlsxFile from "read-excel-file/browser";
import ScorecardSummary from "@/components/data-entry/scorecard-summary";
import ScorecardDetailPanel from "@/components/data-entry/scorecard-detail-panel";
import ScorecardEmptyState from "@/components/data-entry/scorecard-empty-state";
import ScorecardTree from "@/components/data-entry/scorecard-tree";
import {
  fetchScorecard,
  fetchScorecardKpiOptions,
  isLatestRequest,
  saveScorecardConfig,
  saveScorecardDraft,
  saveScorecardRelationships,
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
  kpiCategoryId: number | null;
  kpiSubcategoryId: number | null;
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
  filterOptions,
  kpiOptions,
}: {
  initialContext: ScorecardFilterContext;
  filterOptions: ReviewKpiFilterOptions;
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
  const [templateStartYear, setTemplateStartYear] = useState(
    new Date().getFullYear(),
  );
  const [templateStartMonth, setTemplateStartMonth] = useState(
    new Date().getMonth() + 1,
  );
  const [templateUploadFile, setTemplateUploadFile] = useState<File | null>(
    null,
  );
  const [isProcessingTemplate, setIsProcessingTemplate] = useState(false);
  const quickTemplateUploadInputRef = useRef<HTMLInputElement | null>(null);

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
  }, [draftObjectives, perspectiveLevel]);

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

  const createDraftId = () => `${Date.now()}-${Math.random()}`;

  const addObjectivePlaceholder = () => {
    setDraftObjectives((prev) => [
      ...prev,
      {
        id: createDraftId(),
        description: "",
        keyInitiatives: [],
      },
    ]);
  };

  const updateObjectiveDescription = (objectiveId: string, value: string) => {
    setDraftObjectives((prev) =>
      prev.map((objective) =>
        objective.id === objectiveId
          ? { ...objective, description: value }
          : objective,
      ),
    );
  };

  const addInitiativePlaceholder = (objectiveId: string) => {
    setDraftObjectives((prev) =>
      prev.map((objective) => {
        if (objective.id !== objectiveId) {
          return objective;
        }

        return {
          ...objective,
          keyInitiatives: [
            ...objective.keyInitiatives,
            {
              id: createDraftId(),
              description: "",
              kpis: [],
            },
          ],
        };
      }),
    );
  };

  const updateInitiativeDescription = (
    objectiveId: string,
    initiativeId: string,
    value: string,
  ) => {
    setDraftObjectives((prev) =>
      prev.map((objective) => {
        if (objective.id !== objectiveId) {
          return objective;
        }

        return {
          ...objective,
          keyInitiatives: objective.keyInitiatives.map((initiative) =>
            initiative.id === initiativeId
              ? { ...initiative, description: value }
              : initiative,
          ),
        };
      }),
    );
  };

  const addKpiPlaceholder = (objectiveId: string, initiativeId: string) => {
    const defaultKpi = selectedKpiOption ?? availableKpiOptions[0] ?? null;

    if (defaultKpi == null) {
      setSaveMessage("No KPI options available to add a placeholder row.");
      return;
    }

    setDraftObjectives((prev) =>
      prev.map((objective) => {
        if (objective.id !== objectiveId) {
          return objective;
        }

        return {
          ...objective,
          keyInitiatives: objective.keyInitiatives.map((initiative) => {
            if (initiative.id !== initiativeId) {
              return initiative;
            }

            return {
              ...initiative,
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
                },
              ],
            };
          }),
        };
      }),
    );
  };

  const updateKpiPlaceholder = (
    objectiveId: string,
    initiativeId: string,
    index: number,
    patch: Partial<DraftObjectiveKpi>,
  ) => {
    setDraftObjectives((prev) =>
      prev.map((objective) => {
        if (objective.id !== objectiveId) {
          return objective;
        }

        return {
          ...objective,
          keyInitiatives: objective.keyInitiatives.map((initiative) => {
            if (initiative.id !== initiativeId) {
              return initiative;
            }

            return {
              ...initiative,
              kpis: initiative.kpis.map((kpi, kpiIndex) =>
                kpiIndex === index
                  ? {
                      ...kpi,
                      ...patch,
                    }
                  : kpi,
              ),
            };
          }),
        };
      }),
    );
  };

  const removeInitiativePlaceholder = (
    objectiveId: string,
    initiativeId: string,
  ) => {
    setDraftObjectives((prev) =>
      prev.map((objective) => {
        if (objective.id !== objectiveId) {
          return objective;
        }

        return {
          ...objective,
          keyInitiatives: objective.keyInitiatives.filter(
            (initiative) => initiative.id !== initiativeId,
          ),
        };
      }),
    );
  };

  const removeKpiPlaceholder = (
    objectiveId: string,
    initiativeId: string,
    index: number,
  ) => {
    setDraftObjectives((prev) =>
      prev.map((objective) => {
        if (objective.id !== objectiveId) {
          return objective;
        }

        return {
          ...objective,
          keyInitiatives: objective.keyInitiatives.map((initiative) => {
            if (initiative.id !== initiativeId) {
              return initiative;
            }

            return {
              ...initiative,
              kpis: initiative.kpis.filter((_, kpiIndex) => kpiIndex !== index),
            };
          }),
        };
      }),
    );
  };

  const templateBuilderOnly = true;

  const templateSeeds = useMemo(() => {
    const seeds = new Map<string, TemplateSeed>();

    for (const objective of draftObjectives) {
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
            perspectiveLevel,
            objectiveDescription.toLowerCase(),
            initiativeDescription.toLowerCase(),
            kpi.kpiDefinitionId,
          ].join("|");

          if (seeds.has(key)) {
            continue;
          }

          seeds.set(key, {
            perspectiveLevel,
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

    return [...seeds.values()];
  }, [draftObjectives, kpiNameByDefinitionId, perspectiveLevel]);

  const templateRows = useMemo(() => {
    const rows: TemplateRow[] = [];

    for (const seed of templateSeeds) {
      if (seed.trackingFrequency === "monthly") {
        for (let offset = 0; offset < 12; offset += 1) {
          const date = new Date(
            templateStartYear,
            templateStartMonth - 1 + offset,
            1,
          );
          rows.push({
            perspective_level: seed.perspectiveLevel,
            perspective: PERSPECTIVE_LABELS[seed.perspectiveLevel],
            strategic_objective: seed.strategicObjective,
            key_initiative: seed.keyInitiative,
            tracking_frequency: seed.trackingFrequency,
            kpi_definition_id: seed.kpiDefinitionId,
            kpi_name: seed.kpiName,
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            target_value: "",
          });
        }
      } else {
        for (let yearOffset = 0; yearOffset < 3; yearOffset += 1) {
          rows.push({
            perspective_level: seed.perspectiveLevel,
            perspective: PERSPECTIVE_LABELS[seed.perspectiveLevel],
            strategic_objective: seed.strategicObjective,
            key_initiative: seed.keyInitiative,
            tracking_frequency: seed.trackingFrequency,
            kpi_definition_id: seed.kpiDefinitionId,
            kpi_name: seed.kpiName,
            year: templateStartYear + yearOffset,
            month: null,
            target_value: "",
          });
        }
      }
    }

    return rows;
  }, [templateSeeds, templateStartMonth, templateStartYear]);

  const handleTemplateDownload = async () => {
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
      link.download = `bsc-template-${templateStartYear}-${String(templateStartMonth).padStart(2, "0")}.xlsx`;
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

  const handleSaveLinkages = async () => {
    setSaveMessage(null);
    setIsSaving(true);

    try {
      await saveScorecardRelationships({
        reportPeriodId: context.reportPeriodId,
        relationships: draftRelationships,
      });

      setScorecardRelationships(draftRelationships);
      setSaveMessage("Linkages saved successfully.");
      setContext((current) => ({ ...current }));
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? err.message : "Unable to save linkages.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBuilderDraft = async () => {
    setSaveMessage(null);
    setIsSaving(true);

    try {
      const objectivesPayload = draftObjectives
        .map((objective) => ({
          description: objective.description.trim(),
          keyInitiatives: objective.keyInitiatives
            .map((initiative) => ({
              description: initiative.description.trim(),
              kpis: initiative.kpis.map((kpiItem) => ({
                kpiDefinitionId: kpiItem.kpiDefinitionId,
                trackingFrequency: kpiItem.trackingFrequency,
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

      if (objectivesPayload.length === 0) {
        throw new Error(
          "Build at least one objective with initiatives and KPIs before saving draft.",
        );
      }

      await saveScorecardDraft({
        reportPeriodId: context.reportPeriodId,
        perspectiveLevel,
        perspectiveDescription: PERSPECTIVE_LABELS[perspectiveLevel],
        objectives: objectivesPayload,
      });

      await saveScorecardRelationships({
        reportPeriodId: context.reportPeriodId,
        relationships: draftRelationships,
      });

      setScorecardRelationships(draftRelationships);
      setSaveMessage(
        "Builder draft and linkages saved. You can download/upload the template later.",
      );
      setContext((current) => ({ ...current }));
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? err.message : "Unable to save builder draft.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const perspectiveLabel = PERSPECTIVE_LABELS[perspectiveLevel];
  const objectiveName = strategicObjective.trim();
  const initiativeName = keyInitiative.trim();
  const hasObjectiveContext =
    objectiveName.length > 0 || currentObjectiveInitiatives.length > 0;
  const hasInitiativeContext =
    initiativeName.length > 0 || currentInitiativeKpis.length > 0;
  const hasDraftedObjective = draftObjectives.length > 0;
  const hierarchyInitiativeCount = draftObjectives.reduce(
    (sum, objective) => sum + objective.keyInitiatives.length,
    0,
  );
  const hierarchyKpiCount = draftObjectives.reduce(
    (sum, objective) =>
      sum +
      objective.keyInitiatives.reduce(
        (innerSum, initiative) => innerSum + initiative.kpis.length,
        0,
      ),
    0,
  );
  const canDownloadTemplate =
    !isProcessingTemplate &&
    draftObjectives.length > 0 &&
    templateRows.length > 0;
  const step1CardClass =
    "rounded border border-sky-300 bg-sky-50 px-1.5 py-1 text-[11px]";
  const step2CardClass =
    "rounded border border-indigo-300 bg-indigo-50 px-1.5 py-1 text-[11px]";
  const step3CardClass =
    "rounded border border-amber-300 bg-amber-50 px-1.5 py-1 text-[11px]";
  const step4CardClass =
    "rounded border border-cyan-300 bg-cyan-50 px-1.5 py-1 text-[11px]";
  const step5CardClass =
    "rounded border border-lime-300 bg-lime-50 px-1.5 py-1 text-[11px]";

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

      <div className="flex items-center justify-end gap-1.5">
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

            // Allow selecting the same file again in subsequent uploads.
            event.currentTarget.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2 text-xs"
          onClick={() => quickTemplateUploadInputRef.current?.click()}
          disabled={isProcessingTemplate}
        >
          {isProcessingTemplate ? "Uploading..." : "Upload Filled Template"}
        </Button>
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
        <DialogContent className="w-[98vw] max-w-[98vw] max-h-[88vh] overflow-y-auto p-4 sm:w-[95vw] sm:max-w-350 sm:p-5">
          <DialogHeader>
            <DialogTitle>BSC Template Builder</DialogTitle>
            <DialogDescription>
              Build hierarchy first, then download, fill, and upload the Excel
              template.
            </DialogDescription>
          </DialogHeader>

          {templateBuilderOnly ? (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-2">
                <p className="text-[11px] font-medium">How It Works</p>
                <div className="mt-1 flex flex-wrap items-stretch gap-1">
                  <div className="min-w-44 flex-1 rounded border border-sky-300 bg-sky-50 px-2 py-1 text-[11px]">
                    1. Choose perspective
                  </div>
                  <div className="min-w-44 flex-1 rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-[11px]">
                    2. Build hierarchy
                  </div>
                  <div className="min-w-44 flex-1 rounded border border-lime-300 bg-lime-50 px-2 py-1 text-[11px]">
                    3. Download and upload template
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-sky-300 bg-sky-50 p-2">
                <div className="flex flex-wrap items-end gap-1.5">
                  <div className="min-w-44 flex-1 space-y-0.5">
                    <label className="text-[11px] font-medium">
                      Perspective
                    </label>
                    <Select
                      value={String(perspectiveLevel)}
                      onValueChange={(value) => {
                        setPerspectiveLevel(Number(value) as 1 | 2 | 3 | 4);
                        setSelectedExistingObjective(null);
                        setStrategicObjective("");
                        setKeyInitiative("");
                        setCurrentInitiativeKpis([]);
                        setCurrentObjectiveInitiatives([]);
                      }}
                      disabled={isProcessingTemplate}
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
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Use the hierarchy rows below to add objectives, initiatives,
                  and KPIs.
                </p>
              </div>
              <div className="rounded-md border border-slate-300 bg-slate-50/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <p className="text-[11px] font-semibold tracking-wide text-slate-800">
                    Hierarchy Ready ({perspectiveLabel})
                  </p>
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    <span className="rounded border border-sky-300 bg-sky-100 px-1.5 py-0.5 text-sky-800">
                      Objective
                    </span>
                    <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-amber-800">
                      Initiative
                    </span>
                    <span className="rounded border border-lime-300 bg-lime-100 px-1.5 py-0.5 text-lime-800">
                      KPI
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Build top-down: add objective rows, then initiatives, then
                  KPIs under each initiative.
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                  <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5">
                    Objectives: {draftObjectives.length}
                  </span>
                  <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5">
                    Initiatives: {hierarchyInitiativeCount}
                  </span>
                  <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5">
                    KPIs: {hierarchyKpiCount}
                  </span>
                </div>
                <div className="mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-sky-300 bg-white px-2 text-xs text-sky-900 hover:bg-sky-50"
                    onClick={addObjectivePlaceholder}
                    disabled={isProcessingTemplate}
                  >
                    + Add Objective Row
                  </Button>
                </div>

                {draftObjectives.length === 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Build at least one objective with initiatives and KPIs
                    before downloading the template.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2.5">
                    {draftObjectives.map((objective) => (
                      <li
                        key={objective.id}
                        className="rounded-md border border-sky-300 bg-sky-50 p-2.5"
                      >
                        <div className="mb-1 flex items-center gap-1">
                          <span className="rounded border border-sky-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                            Objective
                          </span>
                        </div>
                        <div className="flex flex-wrap items-end justify-between gap-1.5">
                          <Input
                            value={objective.description}
                            onChange={(event) =>
                              updateObjectiveDescription(
                                objective.id,
                                event.target.value,
                              )
                            }
                            placeholder="Objective description"
                            className="h-8 min-w-55 flex-1 bg-white text-xs"
                            disabled={isProcessingTemplate}
                          />
                          <div className="flex flex-wrap items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 border-amber-300 bg-white px-2 text-xs text-amber-900 hover:bg-amber-50"
                              onClick={() =>
                                addInitiativePlaceholder(objective.id)
                              }
                              disabled={isProcessingTemplate}
                            >
                              + Add Initiative
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              onClick={() =>
                                setDraftObjectives((prev) =>
                                  prev.filter(
                                    (item) => item.id !== objective.id,
                                  ),
                                )
                              }
                              disabled={isProcessingTemplate}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>

                        {objective.keyInitiatives.length === 0 ? (
                          <p className="mt-2 text-[11px] text-sky-700/80">
                            No initiatives yet. Click Add Initiative.
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-2 pl-2">
                            {objective.keyInitiatives.map((initiative) => (
                              <li
                                key={`${objective.id}-${initiative.id}`}
                                className="rounded-md border border-amber-300 bg-amber-50 p-2"
                              >
                                <div className="mb-1 flex items-center gap-1">
                                  <span className="rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                    Initiative
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-end gap-1">
                                  <Input
                                    value={initiative.description}
                                    onChange={(event) =>
                                      updateInitiativeDescription(
                                        objective.id,
                                        initiative.id,
                                        event.target.value,
                                      )
                                    }
                                    placeholder="Initiative description"
                                    className="h-8 min-w-50 flex-1 bg-white text-xs"
                                    disabled={isProcessingTemplate}
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 border-lime-300 bg-white px-2 text-xs text-lime-900 hover:bg-lime-50"
                                    onClick={() =>
                                      addKpiPlaceholder(
                                        objective.id,
                                        initiative.id,
                                      )
                                    }
                                    disabled={isProcessingTemplate}
                                  >
                                    + Add KPI
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-2 text-xs"
                                    onClick={() =>
                                      removeInitiativePlaceholder(
                                        objective.id,
                                        initiative.id,
                                      )
                                    }
                                    disabled={isProcessingTemplate}
                                  >
                                    Remove
                                  </Button>
                                </div>

                                {initiative.kpis.length === 0 ? (
                                  <p className="mt-2 text-[11px] text-amber-700/80">
                                    No KPIs yet. Click Add KPI.
                                  </p>
                                ) : (
                                  <ul className="mt-2 space-y-1.5 pl-2">
                                    {initiative.kpis.map((kpi, index) => (
                                      <li
                                        key={`${initiative.id}-${kpi.kpiDefinitionId}-${index}`}
                                        className="rounded-md border border-lime-300 bg-lime-50 p-2"
                                      >
                                        <div className="mb-1 flex items-center gap-1">
                                          <span className="rounded border border-lime-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-lime-800">
                                            KPI
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          <div className="min-w-48 flex-1">
                                            <Select
                                              value={
                                                kpi.kpiCategoryId == null
                                                  ? "all"
                                                  : String(kpi.kpiCategoryId)
                                              }
                                              onValueChange={(value) =>
                                                updateKpiPlaceholder(
                                                  objective.id,
                                                  initiative.id,
                                                  index,
                                                  {
                                                    kpiCategoryId:
                                                      value === "all"
                                                        ? null
                                                        : Number(value),
                                                    kpiSubcategoryId: null,
                                                  },
                                                )
                                              }
                                              disabled={isProcessingTemplate}
                                            >
                                              <SelectTrigger className="w-full bg-white text-xs">
                                                <SelectValue placeholder="KPI category" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="all">
                                                  All categories
                                                </SelectItem>
                                                {filterOptions.kpiCategories.map(
                                                  (option) => (
                                                    <SelectItem
                                                      key={option.id}
                                                      value={String(option.id)}
                                                    >
                                                      {option.name}
                                                    </SelectItem>
                                                  ),
                                                )}
                                              </SelectContent>
                                            </Select>
                                          </div>

                                          <div className="min-w-48 flex-1">
                                            <Select
                                              value={
                                                kpi.kpiSubcategoryId == null
                                                  ? "all"
                                                  : String(kpi.kpiSubcategoryId)
                                              }
                                              onValueChange={(value) =>
                                                updateKpiPlaceholder(
                                                  objective.id,
                                                  initiative.id,
                                                  index,
                                                  {
                                                    kpiSubcategoryId:
                                                      value === "all"
                                                        ? null
                                                        : Number(value),
                                                  },
                                                )
                                              }
                                              disabled={
                                                isProcessingTemplate ||
                                                kpi.kpiCategoryId == null
                                              }
                                            >
                                              <SelectTrigger className="w-full bg-white text-xs">
                                                <SelectValue placeholder="KPI subcategory" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="all">
                                                  All subcategories
                                                </SelectItem>
                                                {filterOptions.kpiSubcategories
                                                  .filter(
                                                    (subcategory) =>
                                                      subcategory.parent_id ===
                                                      kpi.kpiCategoryId,
                                                  )
                                                  .map((option) => (
                                                    <SelectItem
                                                      key={option.id}
                                                      value={String(option.id)}
                                                    >
                                                      {option.name}
                                                    </SelectItem>
                                                  ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        </div>

                                        <div className="mt-1.5 flex flex-wrap items-end gap-1.5">
                                          <div className="min-w-64 flex-1">
                                            <Select
                                              value={String(
                                                kpi.kpiDefinitionId,
                                              )}
                                              onValueChange={(value) => {
                                                const selectedOption =
                                                  availableKpiOptions.find(
                                                    (option) => {
                                                      if (
                                                        kpi.kpiCategoryId !=
                                                          null &&
                                                        option.categoryId !==
                                                          kpi.kpiCategoryId
                                                      ) {
                                                        return false;
                                                      }

                                                      if (
                                                        kpi.kpiSubcategoryId !=
                                                          null &&
                                                        option.subcategoryId !==
                                                          kpi.kpiSubcategoryId
                                                      ) {
                                                        return false;
                                                      }

                                                      return (
                                                        option.kpiDefinitionId ===
                                                        Number(value)
                                                      );
                                                    },
                                                  ) ?? null;

                                                if (selectedOption == null) {
                                                  return;
                                                }

                                                updateKpiPlaceholder(
                                                  objective.id,
                                                  initiative.id,
                                                  index,
                                                  {
                                                    kpiId: selectedOption.kpiId,
                                                    kpiDefinitionId:
                                                      selectedOption.kpiDefinitionId,
                                                    kpiName:
                                                      selectedOption.kpiName,
                                                    kpiCategoryId:
                                                      selectedOption.categoryId,
                                                    kpiSubcategoryId:
                                                      selectedOption.subcategoryId,
                                                  },
                                                );
                                              }}
                                              disabled={isProcessingTemplate}
                                            >
                                              <SelectTrigger className="w-full bg-white text-xs">
                                                <SelectValue placeholder="Select KPI" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {availableKpiOptions
                                                  .filter((option) => {
                                                    if (
                                                      kpi.kpiCategoryId !=
                                                        null &&
                                                      option.categoryId !==
                                                        kpi.kpiCategoryId
                                                    ) {
                                                      return false;
                                                    }

                                                    if (
                                                      kpi.kpiSubcategoryId !=
                                                        null &&
                                                      option.subcategoryId !==
                                                        kpi.kpiSubcategoryId
                                                    ) {
                                                      return false;
                                                    }

                                                    return true;
                                                  })
                                                  .map((option) => (
                                                    <SelectItem
                                                      key={
                                                        option.kpiDefinitionId
                                                      }
                                                      value={String(
                                                        option.kpiDefinitionId,
                                                      )}
                                                    >
                                                      {option.kpiName}
                                                    </SelectItem>
                                                  ))}
                                              </SelectContent>
                                            </Select>
                                          </div>

                                          <div className="min-w-40">
                                            <Select
                                              value={kpi.trackingFrequency}
                                              onValueChange={(value) =>
                                                updateKpiPlaceholder(
                                                  objective.id,
                                                  initiative.id,
                                                  index,
                                                  {
                                                    trackingFrequency:
                                                      value as TrackingFrequency,
                                                  },
                                                )
                                              }
                                              disabled={isProcessingTemplate}
                                            >
                                              <SelectTrigger className="w-full bg-white text-xs">
                                                <SelectValue placeholder="Tracking" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="monthly">
                                                  Monthly
                                                </SelectItem>
                                                <SelectItem value="annually">
                                                  Annually
                                                </SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </div>

                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-8 px-2 text-xs text-rose-700 hover:text-rose-800"
                                            onClick={() =>
                                              removeKpiPlaceholder(
                                                objective.id,
                                                initiative.id,
                                                index,
                                              )
                                            }
                                            disabled={isProcessingTemplate}
                                          >
                                            Remove
                                          </Button>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <BorderedPanel className="bg-muted/30 p-3">
                <p className="text-[11px] font-medium">Template Setup</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Monthly tracking creates 12 monthly rows from the selected
                  start period. Annual tracking creates 3 yearly rows.
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    onClick={() => void handleSaveBuilderDraft()}
                    disabled={isSaving || isProcessingTemplate}
                  >
                    {isSaving ? "Saving..." : "Save Builder Draft"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Saves hierarchy and linkages first. Targets can be added
                    later via template upload.
                  </p>
                </div>
              </BorderedPanel>

              <BorderedPanel className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <p className="text-[11px] font-medium">
                    Save Linkages (Optional Before Targets)
                  </p>
                  {hasUnsavedRelationshipChanges ? (
                    <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                      Unsaved linkage changes
                    </span>
                  ) : (
                    <span className="rounded border border-lime-200 bg-lime-50 px-1.5 py-0.5 text-[11px] text-lime-800">
                      Linkages are up to date
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  You can save cross-hierarchy linkages now, then return later
                  to set KPI targets via template upload.
                </p>

                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <div className="min-w-56 flex-1 space-y-0.5">
                    <label className="text-[11px] font-medium">
                      Source Node
                    </label>
                    <Select
                      value={relationshipSourceId}
                      onValueChange={setRelationshipSourceId}
                      disabled={
                        isSaving || relationshipNodeOptions.length === 0
                      }
                    >
                      <SelectTrigger className="bg-white text-xs">
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

                  <div className="min-w-44 flex-1 space-y-0.5">
                    <label className="text-[11px] font-medium">
                      Relationship
                    </label>
                    <Select
                      value={relationshipType}
                      onValueChange={(value) =>
                        setRelationshipType(value as RelationshipType)
                      }
                      disabled={isSaving}
                    >
                      <SelectTrigger className="bg-white text-xs">
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

                  <div className="min-w-56 flex-1 space-y-0.5">
                    <label className="text-[11px] font-medium">
                      Target Node
                    </label>
                    <Select
                      value={relationshipTargetId}
                      onValueChange={setRelationshipTargetId}
                      disabled={
                        isSaving || relationshipNodeOptions.length === 0
                      }
                    >
                      <SelectTrigger className="bg-white text-xs">
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

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    disabled={isSaving}
                    onClick={() => {
                      const source =
                        relationshipNodeById.get(relationshipSourceId);
                      const target =
                        relationshipNodeById.get(relationshipTargetId);

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
                      setSaveMessage("Linkage added to draft.");
                    }}
                  >
                    Add Linkage
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    disabled={isSaving || !hasUnsavedRelationshipChanges}
                    onClick={() => void handleSaveLinkages()}
                  >
                    {isSaving ? "Saving..." : "Save Linkages"}
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
                          className="flex flex-wrap items-center justify-between gap-1 rounded border px-2 py-1 text-[11px]"
                        >
                          <span className="min-w-0 flex-1 wrap-break-word">
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
                    No cross-hierarchy linkages defined yet.
                  </p>
                )}

              <div className="flex flex-wrap gap-2">
                <div className="min-w-36 flex-1 space-y-0.5">
                  <label className="text-[11px] font-medium">Start Year</label>
                  <Input
                    type="number"
                    className="h-8 bg-white text-xs"
                    value={templateStartYear}
                    onChange={(event) =>
                      setTemplateStartYear(Number(event.target.value) || 0)
                    }
                    disabled={isProcessingTemplate}
                  />
                </div>

                <div className="min-w-36 flex-1 space-y-0.5">
                  <label className="text-[11px] font-medium">Start Month</label>
                  <Select
                    value={String(templateStartMonth)}
                    onValueChange={(value) =>
                      setTemplateStartMonth(Number(value))
                    }
                    disabled={isProcessingTemplate}
                  >
                    <SelectTrigger className="bg-white text-xs">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, index) => index + 1).map(
                        (month) => (
                          <SelectItem
                            key={month}
                            value={String(month)}
                          >
                            {month}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex min-w-44 items-end">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => void handleTemplateDownload()}
                    disabled={!canDownloadTemplate}
                  >
                    Download Excel Template
                  </Button>
                </div>
              </div>
              </BorderedPanel>

              <div className="rounded-md border p-2">
                <p className="text-[11px] font-medium">
                  Upload Filled Template
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Input
                    type="file"
                    accept=".xlsx"
                    className="h-8 bg-white text-xs"
                    onChange={(event) =>
                      setTemplateUploadFile(event.target.files?.[0] ?? null)
                    }
                    disabled={isProcessingTemplate}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => void handleTemplateUpload()}
                    disabled={
                      isProcessingTemplate ||
                      templateUploadFile == null ||
                      draftObjectives.length === 0
                    }
                  >
                    {isProcessingTemplate ? "Uploading..." : "Upload Template"}
                  </Button>
                </div>
              </div>

              <div className="rounded-md border p-2 text-[11px] text-muted-foreground">
                Template rows to generate: {templateRows.length}
              </div>

              {saveMessage ? (
                <div className="rounded-md border p-2 text-[11px] text-muted-foreground">
                  {saveMessage}
                </div>
              ) : null}
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

              <div className="space-y-1.5 rounded-md border border-indigo-300 bg-indigo-50 p-2 md:col-span-2">
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
                              prev.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
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
                          </BorderedGrid>
                        ),
                      )}
                    </ul>
                  )}
                    </BorderedPanel>

                <div className="mt-1.5 rounded-md border border-lime-300 bg-lime-50 p-2">
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
                            relationships: draftRelationships,
                          });
                        }
                      }
                    }

                    setSaveMessage(
                      "Perspective objectives saved successfully.",
                    );
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
                onClick={() => void handleSaveLinkages()}
              >
                {isSaving ? "Saving..." : "Save Relationships Only"}
              </Button>
              {hasUnsavedRelationshipChanges ? (
                <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                  Unsaved relationship changes
                </span>
              ) : (
                <span className="rounded border border-lime-200 bg-lime-50 px-1.5 py-0.5 text-[11px] text-lime-800">
                  Relationships are up to date
                </span>
              )}
              {saveMessage ? (
                <span className="text-[11px] text-muted-foreground">
                  {saveMessage}
                </span>
              ) : null}
            </div>

            <BorderedPanel className="mt-2 p-2">
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
                    <SelectTrigger className="bg-white text-xs">
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
                  <label className="text-[11px] font-medium">
                    Relationship
                  </label>
                  <Select
                    value={relationshipType}
                    onValueChange={(value) =>
                      setRelationshipType(value as RelationshipType)
                    }
                    disabled={isSaving}
                  >
                    <SelectTrigger className="bg-white text-xs">
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
                    <SelectTrigger className="bg-white text-xs">
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
                    const source =
                      relationshipNodeById.get(relationshipSourceId);
                    const target =
                      relationshipNodeById.get(relationshipTargetId);

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
            </BorderedPanel>

            {availableKpiOptions.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No KPI options available for this filter context.
              </p>
            ) : null}
          </div>
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
