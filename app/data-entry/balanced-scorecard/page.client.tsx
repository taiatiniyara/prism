"use client";

import Link from "next/link";
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
import { Download, Upload } from "lucide-react";

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

const PERSPECTIVE_LABELS: Record<PerspectiveLevel, string> = {
  1: "Financial",
  2: "Customer",
  3: "Operation",
  4: "Development",
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
          ? { ...objective, description: value }
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
          keyInitiatives: objective.keyInitiatives.map((initiative) =>
            initiative.id === initiativeId
              ? { ...initiative, description: value }
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

      {mode !== "builder" ? (
        <Tabs
          value={activeMainTab}
          onValueChange={(value) =>
            setActiveMainTab(value as "strategic-map" | "builder")
          }
          className="space-y-0"
        >
          <TabsList variant="line">
            <TabsTrigger value="builder">BSC Template Builder</TabsTrigger>
            <TabsTrigger value="strategic-map">Strategic Map</TabsTrigger>
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
          <div className="grid gap-4 lg:gap-12 md:gap-2 md:grid-cols-1 lg:grid-cols-3 items-end">
            <div>
              <div>
                <h2 className="text-sm font-semibold">Targets Tracking</h2>
                <div className="flex flex-wrap gap-2">
                  <div className="min-w-32 flex-1 space-y-0.5">
                    <label className="text-[11px] font-medium">
                      Start Year
                    </label>
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

                  <div className="min-w-32 flex-1 space-y-0.5">
                    <label className="text-[11px] font-medium">End Year</label>
                    <Input
                      type="number"
                      className="h-8 bg-white text-xs"
                      value={templateEndYear}
                      onChange={(event) =>
                        setTemplateEndYear(Number(event.target.value) || 0)
                      }
                      disabled={isProcessingTemplate}
                    />
                  </div>

                  <div className="min-w-40 flex-1 space-y-0.5">
                    <label className="text-[11px] font-medium">
                      Tracking Freqency
                    </label>
                    <Select
                      value={templateTrackingMode}
                      onValueChange={(value) =>
                        setTemplateTrackingMode(value as TemplateTrackingMode)
                      }
                      disabled={isProcessingTemplate}
                    >
                      <SelectTrigger className="bg-white text-xs">
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

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={"outline"}
                className="h-8 px-2 text-xs"
                onClick={() => void handleTemplateDownload()}
                disabled={!canDownloadTemplate}
              >
                <Download /> Download Excel Template
              </Button>
              <Button
                type="button"
                size="sm"
                variant={"outline"}
                className="h-8 px-2 text-xs"
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
            </div>
          </div>

          {templateBuilderOnly ? (
            <div className="space-y-4">
              <div className="space-y-4">
                <div className="rounded-md border border-slate-300 bg-slate-50/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Build top-down: add objective rows, then initiatives, then
                      KPIs under each initiative.
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
