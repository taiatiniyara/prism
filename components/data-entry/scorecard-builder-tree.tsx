"use client";

import { useMemo, useState } from "react";

import type { ReviewKpiFilterOptions } from "@/app/data-entry/review-kpi/types";
import type { ScorecardKpiOption } from "@/app/data-entry/balanced-scorecard/types";
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
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

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

type PerspectiveLevel = 1 | 2 | 3 | 4;
type DraftObjectivesByPerspective = Record<PerspectiveLevel, DraftObjective[]>;

type Props = {
  perspectiveLabels: Record<PerspectiveLevel, string>;
  draftObjectivesByPerspective: DraftObjectivesByPerspective;
  filterOptions: ReviewKpiFilterOptions;
  availableKpiOptions: ScorecardKpiOption[];
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

export default function ScorecardBuilderTree({
  perspectiveLabels,
  draftObjectivesByPerspective,
  filterOptions,
  availableKpiOptions,
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
    1: true,
    2: true,
    3: true,
    4: true,
  });

  const perspectiveLevels: PerspectiveLevel[] = [1, 2, 3, 4];

  const getSubcategoryParentCategoryId = (
    subcategory: ReviewKpiFilterOptions["kpiSubcategories"][number],
  ) => {
    const legacyCategoryId = (subcategory as { categoryId?: number | null })
      .categoryId;
    return subcategory.parent_id ?? legacyCategoryId ?? null;
  };

  const perspectiveCounts = useMemo(() => {
    return perspectiveLevels.reduce(
      (acc, level) => {
        const objectives = draftObjectivesByPerspective[level];
        const objectiveCount = objectives.length;
        const initiativeCount = objectives.reduce(
          (sum, objective) => sum + objective.keyInitiatives.length,
          0,
        );
        const kpiCount = objectives.reduce(
          (sum, objective) =>
            sum +
            objective.keyInitiatives.reduce(
              (inner, initiative) => inner + initiative.kpis.length,
              0,
            ),
          0,
        );

        acc[level] = { objectiveCount, initiativeCount, kpiCount };
        return acc;
      },
      {} as Record<
        PerspectiveLevel,
        { objectiveCount: number; initiativeCount: number; kpiCount: number }
      >,
    );
  }, [draftObjectivesByPerspective]);

  return (
    <TooltipProvider>
      <div className="max-h-160 space-y-2 overflow-y-auto rounded-md border border-slate-300 bg-slate-50/60 p-2">
        {perspectiveLevels.map((level) => {
          const objectives = draftObjectivesByPerspective[level];
          const counts = perspectiveCounts[level];
          const perspectiveExpanded = expandedPerspectives[level] ?? true;

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
              className="rounded-md border border-sky-300 bg-sky-50"
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

                    <div>
                      <p className="text-xs font-semibold text-sky-900">
                        {perspectiveLabels[level]}
                      </p>
                      <p className="text-[11px] text-sky-800">
                        Objectives: {counts.objectiveCount} | Initiatives:{" "}
                        {counts.initiativeCount} | KPIs: {counts.kpiCount}
                      </p>
                    </div>

                    <AddIconButton
                      tooltip="Add strategic objective"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onAddObjective(level);
                      }}
                      disabled={isProcessingTemplate}
                    />
                  </div>
                </div>
              </summary>

              <div className="space-y-2 border-t border-sky-200 p-2">
                {objectives.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    No objectives yet for this perspective.
                  </p>
                ) : (
                  objectives.map((objective) => {
                    const objectiveKey = `${level}-${objective.id}`;
                    const objectiveExpanded =
                      expandedObjectives[objectiveKey] ?? true;

                    return (
                      <div
                        key={objective.id}
                        className="ml-2 space-y-2 rounded-sm border border-sky-200 bg-sky-50/40 p-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
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

                        {objectiveExpanded ? (
                          <div className="space-y-2">
                            <div>
                              <Input
                                value={objective.description}
                                onChange={(event) =>
                                  onUpdateObjectiveDescription(
                                    level,
                                    objective.id,
                                    event.target.value,
                                  )
                                }
                                placeholder="Objective description"
                                className="h-9 rounded-none border-0 border-b border-sky-300 bg-transparent px-0 text-xs shadow-none focus-visible:border-sky-500 focus-visible:ring-0"
                                disabled={isProcessingTemplate}
                              />
                            </div>

                            <div className="space-y-2">
                              {objective.keyInitiatives.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground">
                                  No initiatives yet.
                                </p>
                              ) : (
                                objective.keyInitiatives.map((initiative) => {
                                  const initiativeKey = `${level}-${objective.id}-${initiative.id}`;
                                  const initiativeExpanded =
                                    expandedInitiatives[initiativeKey] ?? true;

                                  return (
                                    <div
                                      key={initiative.id}
                                      className="ml-3 space-y-2 rounded-sm border border-amber-200 bg-amber-50/40 p-2"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
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

                                          <AddIconButton
                                            tooltip="Add KPI"
                                            onClick={() =>
                                              onAddKpi(
                                                level,
                                                objective.id,
                                                initiative.id,
                                              )
                                            }
                                            disabled={isProcessingTemplate}
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
                                            disabled={isProcessingTemplate}
                                          />
                                        </div>
                                      </div>

                                      {initiativeExpanded ? (
                                        <div className="space-y-2">
                                          <div>
                                            <Input
                                              value={initiative.description}
                                              onChange={(event) =>
                                                onUpdateInitiativeDescription(
                                                  level,
                                                  objective.id,
                                                  initiative.id,
                                                  event.target.value,
                                                )
                                              }
                                              placeholder="Initiative description"
                                              className="h-9 rounded-none border-0 border-b border-amber-300 bg-transparent px-0 text-xs shadow-none focus-visible:border-amber-500 focus-visible:ring-0"
                                              disabled={isProcessingTemplate}
                                            />
                                          </div>

                                          <div className="space-y-2">
                                            {initiative.kpis.length === 0 ? (
                                              <p className="text-[11px] text-muted-foreground">
                                                No KPIs yet.
                                              </p>
                                            ) : (
                                              initiative.kpis.map(
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
                                                      kpiName: selected.kpiName,
                                                      kpiCategoryId:
                                                        selected.categoryId,
                                                      kpiSubcategoryId:
                                                        selected.subcategoryId,
                                                    } satisfies Partial<DraftObjectiveKpi>;
                                                  };

                                                  return (
                                                    <div
                                                      key={`${initiative.id}-${index}`}
                                                      className="ml-4 space-y-2 rounded-sm border border-lime-200 bg-lime-50/40 p-2"
                                                    >
                                                      <div className="flex items-center justify-between gap-2">
                                                        <span />
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

                                                      <div className="flex flex-wrap items-end gap-4">
                                                        <div className="min-w-40 flex-1 space-y-1">
                                                          <label className="text-[11px] font-medium text-lime-900">
                                                            Category
                                                          </label>
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
                                                                value === "all"
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
                                                            <SelectTrigger className="h-9 w-full rounded-none border-0 border-b border-lime-300 bg-transparent px-0 text-xs shadow-none focus-visible:border-lime-500 focus-visible:ring-0">
                                                              <SelectValue placeholder="Category" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                              <SelectItem value="all">
                                                                All categories
                                                              </SelectItem>
                                                              {filterOptions.kpiCategories.map(
                                                                (category) => (
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

                                                        <div className="min-w-40 flex-1 space-y-1">
                                                          <label className="text-[11px] font-medium text-lime-900">
                                                            Subcategory
                                                          </label>
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
                                                                value === "all"
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
                                                            <SelectTrigger className="h-9 w-full rounded-none border-0 border-b border-lime-300 bg-transparent px-0 text-xs shadow-none focus-visible:border-lime-500 focus-visible:ring-0">
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

                                                        <div className="min-w-56 flex-2 space-y-1">
                                                          <label className="text-[11px] font-medium text-lime-900">
                                                            KPI
                                                          </label>
                                                          <Select
                                                            value={String(
                                                              kpi.kpiDefinitionId,
                                                            )}
                                                            onValueChange={(
                                                              value,
                                                            ) => {
                                                              const selected =
                                                                availableKpiOptions.find(
                                                                  (option) =>
                                                                    option.kpiDefinitionId ===
                                                                    Number(
                                                                      value,
                                                                    ),
                                                                );
                                                              if (
                                                                selected == null
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
                                                                },
                                                              );
                                                            }}
                                                            disabled={
                                                              isProcessingTemplate
                                                            }
                                                          >
                                                            <SelectTrigger className="h-9 w-full rounded-none border-0 border-b border-lime-300 bg-transparent px-0 text-xs shadow-none focus-visible:border-lime-500 focus-visible:ring-0">
                                                              <SelectValue placeholder="KPI" />
                                                            </SelectTrigger>
                                                            <SelectContent>
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
                                                        </div>

                                                        <div className="min-w-40 flex-1 space-y-1">
                                                          <label className="text-[11px] font-medium text-lime-900">
                                                            Tracking
                                                          </label>
                                                          <Select
                                                            value={
                                                              kpi.trackingFrequency
                                                            }
                                                            onValueChange={(
                                                              value,
                                                            ) =>
                                                              onUpdateKpi(
                                                                level,
                                                                objective.id,
                                                                initiative.id,
                                                                index,
                                                                {
                                                                  trackingFrequency:
                                                                    value as TrackingFrequency,
                                                                },
                                                              )
                                                            }
                                                            disabled={
                                                              isProcessingTemplate
                                                            }
                                                          >
                                                            <SelectTrigger className="h-9 w-full rounded-none border-0 border-b border-lime-300 bg-transparent px-0 text-xs shadow-none focus-visible:border-lime-500 focus-visible:ring-0">
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
                                                      </div>
                                                    </div>
                                                  );
                                                },
                                              )
                                            )}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </details>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
