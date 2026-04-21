"use client";

import { useMemo, useState } from "react";

import type { ReviewKpiFilterOptions } from "@/app/data-entry/review-kpi/types";
import type {
  CustomKpiReferenceOptions,
  ScorecardKpiOption,
} from "@/app/data-entry/balanced-scorecard/types";
import { CustomKpiRequestDialog } from "@/components/data-entry/custom-kpi-request-dialog";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

type TrackingFrequency = "monthly" | "annually";

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

const RESULT_OPTIONS = ["increase", "decrease", "completed"] as const;

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

type Props = {
  perspectiveLabels: Record<PerspectiveLevel, string>;
  draftObjectivesByPerspective: DraftObjectivesByPerspective;
  filterOptions: ReviewKpiFilterOptions;
  availableKpiOptions: ScorecardKpiOption[];
  customKpiReferenceOptions: CustomKpiReferenceOptions;
  approvedCustomKpiDefinitionIds: number[];
  isProcessingTemplate: boolean;
  onAddObjective: (perspectiveLevel: PerspectiveLevel) => void;
  onUpdateObjectiveDescription: (
    perspectiveLevel: PerspectiveLevel,
    objectiveId: string,
    value: string,
  ) => void;
  onRemoveObjective: (
    perspectiveLevel: PerspectiveLevel,
    objectiveId: string,
  ) => void;
  onAddInitiative: (
    perspectiveLevel: PerspectiveLevel,
    objectiveId: string,
  ) => void;
  onUpdateInitiativeDescription: (
    perspectiveLevel: PerspectiveLevel,
    objectiveId: string,
    initiativeId: string,
    value: string,
  ) => void;
  onRemoveInitiative: (
    perspectiveLevel: PerspectiveLevel,
    objectiveId: string,
    initiativeId: string,
  ) => void;
  onAddKpi: (
    perspectiveLevel: PerspectiveLevel,
    objectiveId: string,
    initiativeId: string,
  ) => void;
  onUpdateKpi: (
    perspectiveLevel: PerspectiveLevel,
    objectiveId: string,
    initiativeId: string,
    index: number,
    patch: Partial<DraftObjectiveKpi>,
  ) => void;
  onRemoveKpi: (
    perspectiveLevel: PerspectiveLevel,
    objectiveId: string,
    initiativeId: string,
    index: number,
  ) => void;
};

const AddIconButton = ({
  tooltip,
  onClick,
  disabled,
}: {
  tooltip: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled: boolean;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-7 w-7 p-0"
        onClick={onClick}
        disabled={disabled}
        aria-label={tooltip}
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>{tooltip}</TooltipContent>
  </Tooltip>
);

const RemoveIconButton = ({
  tooltip,
  onClick,
  disabled,
}: {
  tooltip: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled: boolean;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 p-0 text-rose-700 hover:text-rose-800"
        onClick={onClick}
        disabled={disabled}
        aria-label={tooltip}
      >
        <Trash2Icon className="h-3.5 w-3.5" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>{tooltip}</TooltipContent>
  </Tooltip>
);

const SaveStateChip = ({ saved }: { saved: boolean }) => {
  if (!saved) {
    return null;
  }

  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-lime-100 text-lime-700"
      title="Saved"
      aria-label="Saved"
    >
      <CheckIcon className="h-3.5 w-3.5" />
    </span>
  );
};

export default function ScorecardBuilderTree({
  perspectiveLabels,
  draftObjectivesByPerspective,
  filterOptions,
  availableKpiOptions,
  customKpiReferenceOptions,
  approvedCustomKpiDefinitionIds,
  isProcessingTemplate,
  onAddObjective,
  onUpdateObjectiveDescription,
  onRemoveObjective,
  onAddInitiative,
  onUpdateInitiativeDescription,
  onRemoveInitiative,
  onAddKpi,
  onUpdateKpi,
  onRemoveKpi,
}: Props) {
  const [expandedObjectives, setExpandedObjectives] = useState<
    Record<string, boolean>
  >({});
  const [expandedInitiatives, setExpandedInitiatives] = useState<
    Record<string, boolean>
  >({});
  const [expandedPerspectives, setExpandedPerspectives] = useState<
    Record<PerspectiveLevel, boolean>
  >({
    1: false,
    2: false,
    3: false,
    4: false,
  });

  const perspectiveLevels: PerspectiveLevel[] = [1, 2, 3, 4];
  const approvedCustomKpiDefinitionIdSet = useMemo(
    () => new Set(approvedCustomKpiDefinitionIds),
    [approvedCustomKpiDefinitionIds],
  );
  const getSubcategoryParentCategoryId = (
    subcategory: ReviewKpiFilterOptions["kpiSubcategories"][number],
  ) => {
    const legacyCategoryId = (subcategory as { categoryId?: number | null })
      .categoryId;
    return subcategory.parent_id ?? legacyCategoryId ?? null;
  };

  const summarizeFilledNames = (
    names: string[],
    { emptyLabel, maxItems = 3 }: { emptyLabel: string; maxItems?: number },
  ) => {
    const filledNames = names
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    if (filledNames.length === 0) {
      return emptyLabel;
    }

    const preview = filledNames.slice(0, maxItems).join(", ");
    const remaining = filledNames.length - maxItems;
    return remaining > 0 ? `${preview} +${remaining} more` : preview;
  };

  return (
    <TooltipProvider>
      <div className="max-h-160 space-y-2 overflow-y-auto rounded-md border border-white bg-slate-50/60 p-2">
        {perspectiveLevels.map((level) => {
          const objectives = draftObjectivesByPerspective[level];
          const perspectiveExpanded = expandedPerspectives[level] ?? false;
          const objectiveNamesSummary = summarizeFilledNames(
            objectives.map((objective) => objective.description),
            { emptyLabel: "No objectives filled" },
          );
          const initiativeNamesSummary = summarizeFilledNames(
            objectives.flatMap((objective) =>
              objective.keyInitiatives.map(
                (initiative) => initiative.description,
              ),
            ),
            { emptyLabel: "No initiatives filled" },
          );

          return (
            <details
              key={level}
              open={perspectiveExpanded}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setExpandedPerspectives((prev) => ({
                  ...prev,
                  [level]: isOpen,
                }));
              }}
              className="rounded-md border border-white bg-slate-300"
            >
              <summary className="cursor-pointer list-none p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setExpandedPerspectives((prev) => ({
                          ...prev,
                          [level]: !perspectiveExpanded,
                        }));
                      }}
                      aria-label={
                        perspectiveExpanded
                          ? "Collapse perspective"
                          : "Expand perspective"
                      }
                    >
                      {perspectiveExpanded ? (
                        <ChevronDownIcon className="h-4 w-4" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4" />
                      )}
                    </Button>

                    <div className="space-y-2">
                      <div className="flex gap-2 items-center">
                        <p className="text-xs font-semibold text-slate-950">
                          {perspectiveLabels[level]}
                        </p>
                        <AddIconButton
                          tooltip="Add strategic objective"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onAddObjective(level);
                          }}
                          disabled={isProcessingTemplate}
                        />
                        {perspectiveExpanded && objectives.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">
                            No objectives yet.
                          </p>
                        ) : null}
                      </div>

                      {!perspectiveExpanded ? (
                        <p className="text-[11px] text-slate-900/90">
                          {`Objectives: ${objectiveNamesSummary} | Initiatives: ${initiativeNamesSummary}`}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </summary>

              <div className="space-y-2 border-t border-white p-2">
                {objectives.length === 0
                  ? null
                  : objectives.map((objective) => {
                      const objectiveKey = `${level}-${objective.id}`;
                      const objectiveExpanded =
                        expandedObjectives[objectiveKey] ?? false;

                      return (
                        <div
                          key={objective.id}
                          className="ml-4 space-y-2 rounded-sm border border-white bg-slate-200/90 p-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {(() => {
                              const objectiveName =
                                objective.description.trim();
                              const objectiveTitle =
                                objectiveName.length > 0
                                  ? objectiveName
                                  : "Untitled objective";
                              const initiativeNamesSummary =
                                summarizeFilledNames(
                                  objective.keyInitiatives.map(
                                    (initiative) => initiative.description,
                                  ),
                                  { emptyLabel: "No initiatives filled" },
                                );

                              return (
                                <div className="flex w-full items-center gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() =>
                                      setExpandedObjectives((prev) => ({
                                        ...prev,
                                        [objectiveKey]: !objectiveExpanded,
                                      }))
                                    }
                                    aria-label={
                                      objectiveExpanded
                                        ? "Collapse objective"
                                        : "Expand objective"
                                    }
                                  >
                                    {objectiveExpanded ? (
                                      <ChevronDownIcon className="h-4 w-4" />
                                    ) : (
                                      <ChevronRightIcon className="h-4 w-4" />
                                    )}
                                  </Button>

                                  <div className="min-w-0 flex-1">
                                    {objectiveExpanded ? (
                                      <Input
                                        value={objective.description}
                                        maxLength={50}
                                        onChange={(event) =>
                                          onUpdateObjectiveDescription(
                                            level,
                                            objective.id,
                                            event.target.value,
                                          )
                                        }
                                        placeholder="Objective description"
                                        className="h-8 rounded-none border-0 border-b border-white bg-transparent px-0 text-xs shadow-none focus-visible:border-white focus-visible:ring-0"
                                        disabled={isProcessingTemplate}
                                      />
                                    ) : (
                                      <>
                                        <p className="truncate text-[11px] font-medium text-slate-900">
                                          {objectiveTitle}
                                        </p>
                                        <p className="text-[11px] text-slate-900/90">
                                          {`Initiatives: ${initiativeNamesSummary}`}
                                        </p>
                                      </>
                                    )}
                                    {objectiveExpanded &&
                                    objective.keyInitiatives.length === 0 ? (
                                      <p className="text-[11px] text-muted-foreground">
                                        No initiatives yet.
                                      </p>
                                    ) : null}
                                  </div>

                                  <div className="ml-auto flex items-center gap-2">
                                    <SaveStateChip saved={objective.isSaved} />
                                    <AddIconButton
                                      tooltip="Add initiative"
                                      onClick={() =>
                                        onAddInitiative(level, objective.id)
                                      }
                                      disabled={isProcessingTemplate}
                                    />
                                    <RemoveIconButton
                                      tooltip="Remove objective"
                                      onClick={() =>
                                        onRemoveObjective(level, objective.id)
                                      }
                                      disabled={isProcessingTemplate}
                                    />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          {objectiveExpanded ? (
                            <div className="space-y-2">
                              {objective.keyInitiatives.length === 0
                                ? null
                                : objective.keyInitiatives.map((initiative) => {
                                    const initiativeKey = `${level}-${objective.id}-${initiative.id}`;
                                    const initiativeExpanded =
                                      expandedInitiatives[initiativeKey] ??
                                      false;

                                    return (
                                      <div
                                        key={initiative.id}
                                        className="ml-6 space-y-2 rounded-sm border border-white bg-slate-100/95 p-2"
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          {(() => {
                                            const initiativeName =
                                              initiative.description.trim();
                                            const initiativeTitle =
                                              initiativeName.length > 0
                                                ? initiativeName
                                                : "Untitled initiative";
                                            const kpiNamesSummary =
                                              summarizeFilledNames(
                                                initiative.kpis.map(
                                                  (kpi) => kpi.kpiName,
                                                ),
                                                {
                                                  emptyLabel: "No KPIs filled",
                                                },
                                              );

                                            return (
                                              <div className="flex w-full items-center gap-2">
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="ghost"
                                                  className="h-7 w-7 p-0"
                                                  onClick={() =>
                                                    setExpandedInitiatives(
                                                      (prev) => ({
                                                        ...prev,
                                                        [initiativeKey]:
                                                          !initiativeExpanded,
                                                      }),
                                                    )
                                                  }
                                                  aria-label={
                                                    initiativeExpanded
                                                      ? "Collapse initiative"
                                                      : "Expand initiative"
                                                  }
                                                >
                                                  {initiativeExpanded ? (
                                                    <ChevronDownIcon className="h-4 w-4" />
                                                  ) : (
                                                    <ChevronRightIcon className="h-4 w-4" />
                                                  )}
                                                </Button>

                                                <div className="min-w-0 flex-1">
                                                  {initiativeExpanded ? (
                                                    <Input
                                                      value={
                                                        initiative.description
                                                      }
                                                      maxLength={50}
                                                      onChange={(event) =>
                                                        onUpdateInitiativeDescription(
                                                          level,
                                                          objective.id,
                                                          initiative.id,
                                                          event.target.value,
                                                        )
                                                      }
                                                      placeholder="Initiative description"
                                                      className="h-8 rounded-none border-0 border-b border-white bg-transparent px-0 text-xs shadow-none focus-visible:border-white focus-visible:ring-0"
                                                      disabled={
                                                        isProcessingTemplate
                                                      }
                                                    />
                                                  ) : (
                                                    <>
                                                      <p className="truncate text-[11px] font-medium text-slate-900">
                                                        {initiativeTitle}
                                                      </p>
                                                      <p className="text-[11px] text-slate-700/90">
                                                        {`KPIs: ${kpiNamesSummary}`}
                                                      </p>
                                                    </>
                                                  )}
                                                  {initiativeExpanded &&
                                                  initiative.kpis.length ===
                                                    0 ? (
                                                    <p className="text-[11px] text-muted-foreground">
                                                      No KPIs yet.
                                                    </p>
                                                  ) : null}
                                                </div>

                                                <div className="ml-auto flex items-center gap-2">
                                                  <SaveStateChip
                                                    saved={initiative.isSaved}
                                                  />
                                                  <AddIconButton
                                                    tooltip="Add KPI"
                                                    onClick={() =>
                                                      onAddKpi(
                                                        level,
                                                        objective.id,
                                                        initiative.id,
                                                      )
                                                    }
                                                    disabled={
                                                      isProcessingTemplate
                                                    }
                                                  />
                                                  <RemoveIconButton
                                                    tooltip="Remove initiative"
                                                    onClick={() =>
                                                      onRemoveInitiative(
                                                        level,
                                                        objective.id,
                                                        initiative.id,
                                                      )
                                                    }
                                                    disabled={
                                                      isProcessingTemplate
                                                    }
                                                  />
                                                </div>
                                              </div>
                                            );
                                          })()}
                                        </div>

                                        {initiativeExpanded ? (
                                          <div className="ml-8 overflow-hidden border border-white bg-white">
                                            {initiative.kpis.length ===
                                            0 ? null : (
                                              <div className="grid grid-cols-15 items-center gap-3 bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-700">
                                                <div className="col-span-3">
                                                  Category
                                                </div>
                                                <div className="col-span-3">
                                                  Subcategory
                                                </div>
                                                <div className="col-span-3">
                                                  KPI
                                                </div>
                                                <div className="col-span-3">
                                                  Result
                                                </div>
                                                <div className="col-span-1 text-center">
                                                  Saved
                                                </div>
                                                <div className="col-span-1 text-center">
                                                  Custom KPI
                                                </div>
                                                <div className="col-span-1 text-center">
                                                  Action
                                                </div>
                                              </div>
                                            )}
                                            {initiative.kpis.length === 0
                                              ? null
                                              : initiative.kpis.map(
                                                  (kpi, index) => {
                                                    const filteredOptions =
                                                      availableKpiOptions.filter(
                                                        (option) => {
                                                          const categoryMatch =
                                                            kpi.kpiCategoryId ==
                                                              null ||
                                                            option.categoryId ===
                                                              kpi.kpiCategoryId;
                                                          const subcategoryMatch =
                                                            kpi.kpiSubcategoryId ==
                                                              null ||
                                                            option.subcategoryId ===
                                                              kpi.kpiSubcategoryId;
                                                          return (
                                                            categoryMatch &&
                                                            subcategoryMatch
                                                          );
                                                        },
                                                      );

                                                    const syncKpiSelection = (
                                                      categoryId: number | null,
                                                      subcategoryId:
                                                        | number
                                                        | null,
                                                    ) => {
                                                      const nextOptions =
                                                        availableKpiOptions.filter(
                                                          (option) => {
                                                            const categoryMatch =
                                                              categoryId ==
                                                                null ||
                                                              option.categoryId ===
                                                                categoryId;
                                                            const subcategoryMatch =
                                                              subcategoryId ==
                                                                null ||
                                                              option.subcategoryId ===
                                                                subcategoryId;
                                                            return (
                                                              categoryMatch &&
                                                              subcategoryMatch
                                                            );
                                                          },
                                                        );

                                                      const currentStillValid =
                                                        nextOptions.find(
                                                          (option) =>
                                                            option.kpiDefinitionId ===
                                                            kpi.kpiDefinitionId,
                                                        );
                                                      const selected =
                                                        currentStillValid ??
                                                        nextOptions[0] ??
                                                        null;

                                                      if (selected == null) {
                                                        return {
                                                          kpiCategoryId:
                                                            categoryId,
                                                          kpiSubcategoryId:
                                                            subcategoryId,
                                                        } satisfies Partial<DraftObjectiveKpi>;
                                                      }

                                                      return {
                                                        kpiDefinitionId:
                                                          selected.kpiDefinitionId,
                                                        kpiId: selected.kpiId,
                                                        kpiName:
                                                          selected.kpiName,
                                                        kpiCategoryId:
                                                          selected.categoryId,
                                                        kpiSubcategoryId:
                                                          selected.subcategoryId,
                                                      } satisfies Partial<DraftObjectiveKpi>;
                                                    };

                                                    return (
                                                      <div
                                                        key={`${initiative.id}-${index}`}
                                                        className="border-t border-slate-200 px-3 py-2"
                                                      >
                                                        <div className="grid grid-cols-15 items-center gap-3">
                                                          <div className="col-span-3">
                                                            <Select
                                                              value={
                                                                kpi.kpiCategoryId ==
                                                                null
                                                                  ? "all"
                                                                  : String(
                                                                      kpi.kpiCategoryId,
                                                                    )
                                                              }
                                                              onValueChange={(
                                                                value,
                                                              ) => {
                                                                const nextCategoryId =
                                                                  value ===
                                                                  "all"
                                                                    ? null
                                                                    : Number(
                                                                        value,
                                                                      );
                                                                const patch =
                                                                  syncKpiSelection(
                                                                    nextCategoryId,
                                                                    null,
                                                                  );
                                                                onUpdateKpi(
                                                                  level,
                                                                  objective.id,
                                                                  initiative.id,
                                                                  index,
                                                                  patch,
                                                                );
                                                              }}
                                                              disabled={
                                                                isProcessingTemplate
                                                              }
                                                            >
                                                              <SelectTrigger className="h-9 w-full border border-slate-200 bg-white px-2 text-xs shadow-none focus-visible:border-slate-300 focus-visible:ring-0">
                                                                <SelectValue placeholder="Category" />
                                                              </SelectTrigger>
                                                              <SelectContent>
                                                                <SelectItem value="all">
                                                                  All categories
                                                                </SelectItem>
                                                                {filterOptions.kpiCategories.map(
                                                                  (
                                                                    category,
                                                                  ) => (
                                                                    <SelectItem
                                                                      key={
                                                                        category.id
                                                                      }
                                                                      value={String(
                                                                        category.id,
                                                                      )}
                                                                    >
                                                                      {
                                                                        category.name
                                                                      }
                                                                    </SelectItem>
                                                                  ),
                                                                )}
                                                              </SelectContent>
                                                            </Select>
                                                          </div>

                                                          <div className="col-span-3">
                                                            <Select
                                                              value={
                                                                kpi.kpiSubcategoryId ==
                                                                null
                                                                  ? "all"
                                                                  : String(
                                                                      kpi.kpiSubcategoryId,
                                                                    )
                                                              }
                                                              onValueChange={(
                                                                value,
                                                              ) => {
                                                                const nextSubcategoryId =
                                                                  value ===
                                                                  "all"
                                                                    ? null
                                                                    : Number(
                                                                        value,
                                                                      );
                                                                const patch =
                                                                  syncKpiSelection(
                                                                    kpi.kpiCategoryId,
                                                                    nextSubcategoryId,
                                                                  );
                                                                onUpdateKpi(
                                                                  level,
                                                                  objective.id,
                                                                  initiative.id,
                                                                  index,
                                                                  patch,
                                                                );
                                                              }}
                                                              disabled={
                                                                isProcessingTemplate
                                                              }
                                                            >
                                                              <SelectTrigger className="h-9 w-full border border-slate-200 bg-white px-2 text-xs shadow-none focus-visible:border-slate-300 focus-visible:ring-0">
                                                                <SelectValue placeholder="Subcategory" />
                                                              </SelectTrigger>
                                                              <SelectContent>
                                                                <SelectItem value="all">
                                                                  All
                                                                  subcategories
                                                                </SelectItem>
                                                                {filterOptions.kpiSubcategories
                                                                  .filter(
                                                                    (
                                                                      subcategory,
                                                                    ) => {
                                                                      if (
                                                                        kpi.kpiCategoryId ==
                                                                        null
                                                                      ) {
                                                                        return true;
                                                                      }
                                                                      return (
                                                                        getSubcategoryParentCategoryId(
                                                                          subcategory,
                                                                        ) ===
                                                                        kpi.kpiCategoryId
                                                                      );
                                                                    },
                                                                  )
                                                                  .map(
                                                                    (
                                                                      subcategory,
                                                                    ) => (
                                                                      <SelectItem
                                                                        key={
                                                                          subcategory.id
                                                                        }
                                                                        value={String(
                                                                          subcategory.id,
                                                                        )}
                                                                      >
                                                                        {
                                                                          subcategory.name
                                                                        }
                                                                      </SelectItem>
                                                                    ),
                                                                  )}
                                                              </SelectContent>
                                                            </Select>
                                                          </div>

                                                          <div className="col-span-3 flex items-center gap-2">
                                                            <Select
                                                              value={
                                                                kpi.kpiDefinitionId ==
                                                                null
                                                                  ? "__pending__"
                                                                  : String(
                                                                      kpi.kpiDefinitionId,
                                                                    )
                                                              }
                                                              onValueChange={(
                                                                value,
                                                              ) => {
                                                                if (
                                                                  value ===
                                                                  "__pending__"
                                                                ) {
                                                                  return;
                                                                }

                                                                const selected =
                                                                  availableKpiOptions.find(
                                                                    (option) =>
                                                                      option.kpiDefinitionId ===
                                                                      Number(
                                                                        value,
                                                                      ),
                                                                  );
                                                                if (
                                                                  selected ==
                                                                  null
                                                                ) {
                                                                  return;
                                                                }

                                                                onUpdateKpi(
                                                                  level,
                                                                  objective.id,
                                                                  initiative.id,
                                                                  index,
                                                                  {
                                                                    kpiDefinitionId:
                                                                      selected.kpiDefinitionId,
                                                                    kpiId:
                                                                      selected.kpiId,
                                                                    kpiName:
                                                                      selected.kpiName,
                                                                    kpiCategoryId:
                                                                      selected.categoryId,
                                                                    kpiSubcategoryId:
                                                                      selected.subcategoryId,
                                                                    pendingCustomKpiRequestId:
                                                                      null,
                                                                    pendingCustomKpiTitle:
                                                                      null,
                                                                    pendingCustomKpiStatus:
                                                                      null,
                                                                    approvedKpiDefinitionId:
                                                                      null,
                                                                  },
                                                                );
                                                              }}
                                                              disabled={
                                                                isProcessingTemplate
                                                              }
                                                            >
                                                              <SelectTrigger className="h-9 w-full border border-slate-200 bg-white px-2 text-xs shadow-none focus-visible:border-slate-300 focus-visible:ring-0">
                                                                <SelectValue placeholder="KPI" />
                                                              </SelectTrigger>
                                                              <SelectContent>
                                                                {kpi.kpiDefinitionId ==
                                                                null ? (
                                                                  <SelectItem
                                                                    value="__pending__"
                                                                    disabled
                                                                  >
                                                                    {kpi.pendingCustomKpiTitle ??
                                                                      "Pending custom KPI"}
                                                                  </SelectItem>
                                                                ) : null}
                                                                {filteredOptions.map(
                                                                  (option) => (
                                                                    <SelectItem
                                                                      key={
                                                                        option.kpiDefinitionId
                                                                      }
                                                                      value={String(
                                                                        option.kpiDefinitionId,
                                                                      )}
                                                                    >
                                                                      {
                                                                        option.kpiName
                                                                      }
                                                                    </SelectItem>
                                                                  ),
                                                                )}
                                                              </SelectContent>
                                                            </Select>

                                                            {kpi.kpiDefinitionId ==
                                                              null &&
                                                            kpi.pendingCustomKpiRequestId !=
                                                              null ? (
                                                              <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-amber-100 px-2 text-[10px] font-medium text-amber-800">
                                                                Pending
                                                              </span>
                                                            ) : null}

                                                            {kpi.kpiDefinitionId !=
                                                              null &&
                                                            approvedCustomKpiDefinitionIdSet.has(
                                                              kpi.kpiDefinitionId,
                                                            ) ? (
                                                              <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-lime-100 px-2 text-[10px] font-medium text-lime-800">
                                                                Approved
                                                              </span>
                                                            ) : null}
                                                          </div>

                                                          <div className="col-span-3">
                                                            <Select
                                                              value={kpi.result}
                                                              onValueChange={(
                                                                value,
                                                              ) => {
                                                                onUpdateKpi(
                                                                  level,
                                                                  objective.id,
                                                                  initiative.id,
                                                                  index,
                                                                  {
                                                                    result:
                                                                      value as DraftObjectiveKpi["result"],
                                                                  },
                                                                );
                                                              }}
                                                              disabled={
                                                                isProcessingTemplate
                                                              }
                                                            >
                                                              <SelectTrigger className="h-9 w-full border border-slate-200 bg-white px-2 text-xs capitalize shadow-none focus-visible:border-slate-300 focus-visible:ring-0">
                                                                <SelectValue placeholder="Result" />
                                                              </SelectTrigger>
                                                              <SelectContent>
                                                                {RESULT_OPTIONS.map(
                                                                  (option) => (
                                                                    <SelectItem
                                                                      key={
                                                                        option
                                                                      }
                                                                      value={
                                                                        option
                                                                      }
                                                                      className="capitalize"
                                                                    >
                                                                      {option}
                                                                    </SelectItem>
                                                                  ),
                                                                )}
                                                              </SelectContent>
                                                            </Select>
                                                          </div>

                                                          <div className="col-span-1 flex justify-center">
                                                            <SaveStateChip
                                                              saved={
                                                                kpi.isSaved
                                                              }
                                                            />
                                                          </div>

                                                          <div className="col-span-1 flex justify-center">
                                                            <div className="flex flex-col items-center gap-1">
                                                              <CustomKpiRequestDialog
                                                                inputOptions={
                                                                  customKpiReferenceOptions.availableInputDefinitions
                                                                }
                                                                unitOptions={
                                                                  customKpiReferenceOptions.availableUnits
                                                                }
                                                                dataTypeOptions={
                                                                  customKpiReferenceOptions.availableDataTypes
                                                                }
                                                                triggerLabel="Add"
                                                                triggerSize="sm"
                                                                triggerVariant="ghost"
                                                                triggerClassName="h-7 px-1 text-[10px] text-slate-600 hover:text-slate-900"
                                                                triggerDisabled={
                                                                  isProcessingTemplate
                                                                }
                                                                onRequestSubmitted={async (
                                                                  request,
                                                                ) => {
                                                                  onUpdateKpi(
                                                                    level,
                                                                    objective.id,
                                                                    initiative.id,
                                                                    index,
                                                                    {
                                                                      kpiId:
                                                                        null,
                                                                      kpiDefinitionId:
                                                                        null,
                                                                      kpiName:
                                                                        request.title,
                                                                      kpiCategoryId:
                                                                        null,
                                                                      kpiSubcategoryId:
                                                                        null,
                                                                      pendingCustomKpiRequestId:
                                                                        request.id,
                                                                      pendingCustomKpiTitle:
                                                                        request.title,
                                                                      pendingCustomKpiStatus:
                                                                        request.status,
                                                                      approvedKpiDefinitionId:
                                                                        null,
                                                                    },
                                                                  );
                                                                }}
                                                              />
                                                            </div>
                                                          </div>

                                                          <div className="col-span-1 flex justify-center">
                                                            <RemoveIconButton
                                                              tooltip="Remove KPI"
                                                              onClick={() =>
                                                                onRemoveKpi(
                                                                  level,
                                                                  objective.id,
                                                                  initiative.id,
                                                                  index,
                                                                )
                                                              }
                                                              disabled={
                                                                isProcessingTemplate
                                                              }
                                                            />
                                                          </div>
                                                        </div>
                                                      </div>
                                                    );
                                                  },
                                                )}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
              </div>
            </details>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
