"use client";

import { DragEvent, useMemo, useState, useTransition } from "react";
import { SaveKpiFormula } from "./service";
import { FormulaInput } from "@/db/schema/dataEntry";
import { KpiDefinition } from "@/db/schema/kpi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FaSave, FaTimes } from "react-icons/fa";
import type { ManagedDimensionOption } from "./service";

export interface KpiFormulaInputOption {
  id: number;
  name: string;
  variable_name: string | null;
}

const operators = ["+", "-", "*", "/", "(", ")"];
const DND_TOKEN_KEY = "application/x-prism-formula-token";

interface FormulaInputFilters {
  energyProviderId?: number | null;
  energyTypeId?: number | null;
  energySourceId?: number | null;
}

const NONE_OPTION_VALUE = "__none__";

const toNullableNumber = (value: string): number | null | undefined => {
  if (value === NONE_OPTION_VALUE) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function getFormulaInputs(
  formula: string,
  inputs: KpiFormulaInputOption[],
  selectedInputIds: number[],
  selectedInputFilters: Record<number, FormulaInputFilters>,
): FormulaInput[] {
  const tokenMatches = formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const tokenSet = new Set(tokenMatches);

  const fromFormula = inputs
    .filter((item) => item.variable_name && tokenSet.has(item.variable_name))
    .map((item) => ({
      input_def_id: item.id,
      variable_name: item.variable_name as string,
    }));

  const selectedSet = new Set(selectedInputIds.map((id) => Number(id)));
  const fromSelection = inputs
    .filter((item) => selectedSet.has(item.id) && !!item.variable_name)
    .map((item) => ({
      input_def_id: item.id,
      variable_name: item.variable_name as string,
    }));

  const merged = [...fromFormula, ...fromSelection];
  const dedup = new Map<number, FormulaInput>();
  for (const item of merged) {
    const filters = selectedInputFilters[item.input_def_id];
    dedup.set(item.input_def_id, {
      ...item,
      energy_provider_id: filters?.energyProviderId ?? null,
      energy_type_id: filters?.energyTypeId ?? null,
      energy_source_id: filters?.energySourceId ?? null,
    });
  }

  return [...dedup.values()];
}

export default function KpiFormulaBuilder(props: {
  kpis: KpiDefinition[];
  inputs: KpiFormulaInputOption[];
  energyProviderOptions: ManagedDimensionOption[];
  energyTypeOptions: ManagedDimensionOption[];
  energySourceOptions: ManagedDimensionOption[];
}) {
  const [isSaving, startTransition] = useTransition();
  const [selectedKpiId, setSelectedKpiId] = useState<string>("");
  const [kpiSearch, setKpiSearch] = useState<string>("");
  const [showNoFormulaOnly, setShowNoFormulaOnly] = useState(false);
  const [search, setSearch] = useState<string>("");
  const [selectedInputIds, setSelectedInputIds] = useState<number[]>([]);
  const [selectedInputFilters, setSelectedInputFilters] = useState<
    Record<number, FormulaInputFilters>
  >({});
  const [formula, setFormula] = useState<string>("");
  const [customToken, setCustomToken] = useState<string>("");
  const [isDraggingOverFormula, setIsDraggingOverFormula] = useState(false);

  const normalizeInputId = (id: number) => Number(id);

  const filteredKpis = useMemo(() => {
    const term = kpiSearch.trim().toLowerCase();

    return props.kpis.filter((kpi) => {
      const matchesSearch = !term || kpi.name.toLowerCase().includes(term);
      const hasNoFormula = !(kpi.formula ?? "").trim();
      return matchesSearch && (!showNoFormulaOnly || hasNoFormula);
    });
  }, [kpiSearch, props.kpis, showNoFormulaOnly]);

  const filteredInputs = useMemo(() => {
    if (!search.trim()) return props.inputs;
    const term = search.toLowerCase();

    return props.inputs.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        (item.variable_name || "").toLowerCase().includes(term),
    );
  }, [props.inputs, search]);

  const inputTokenSet = useMemo(() => {
    return new Set(
      props.inputs
        .map((item) => item.variable_name || item.name)
        .filter((token): token is string => !!token),
    );
  }, [props.inputs]);

  const operatorTokenSet = useMemo(() => new Set(operators), []);

  const formulaTokens = useMemo(
    () => formula.split(/\s+/).filter((token) => token.trim().length > 0),
    [formula],
  );

  const formulaVariableSet = useMemo(() => {
    return new Set(formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  }, [formula]);

  const visibleFilterInputs = useMemo(() => {
    const selectedIdSet = new Set(
      selectedInputIds.map((id) => normalizeInputId(id)),
    );

    return props.inputs.filter(
      (item) =>
        selectedIdSet.has(item.id) ||
        (!!item.variable_name && formulaVariableSet.has(item.variable_name)),
    );
  }, [formulaVariableSet, props.inputs, selectedInputIds]);

  const handleKpiChange = (value: string) => {
    setSelectedKpiId(value);
    const kpi = props.kpis.find((item) => item.id.toString() === value);
    setFormula(kpi?.formula ?? "");
    const formulaInputs = kpi?.formula_inputs ?? [];
    setSelectedInputIds(
      formulaInputs.map((item) => normalizeInputId(item.input_def_id)),
    );
    const filterMap: Record<number, FormulaInputFilters> = {};
    for (const formulaInput of formulaInputs) {
      filterMap[normalizeInputId(formulaInput.input_def_id)] = {
        energyProviderId: formulaInput.energy_provider_id ?? null,
        energyTypeId: formulaInput.energy_type_id ?? null,
        energySourceId: formulaInput.energy_source_id ?? null,
      };
    }
    setSelectedInputFilters(filterMap);
    setKpiSearch("");
    setSearch("");
  };

  const addInputToSelection = (id: number) => {
    const normalizedId = normalizeInputId(id);
    setSelectedInputIds((prev) => {
      const normalizedPrev = prev.map((item) => normalizeInputId(item));
      return normalizedPrev.includes(normalizedId)
        ? normalizedPrev
        : [...normalizedPrev, normalizedId];
    });
  };

  const removeInputFromSelection = (id: number) => {
    const normalizedId = normalizeInputId(id);
    setSelectedInputIds((prev) =>
      prev
        .map((item) => normalizeInputId(item))
        .filter((item) => item !== normalizedId),
    );
    setSelectedInputFilters((prev) => {
      const next = { ...prev };
      delete next[normalizedId];
      return next;
    });
  };

  const updateInputFilter = (
    id: number,
    key: keyof FormulaInputFilters,
    value: string,
  ) => {
    const normalizedId = normalizeInputId(id);
    const parsed = toNullableNumber(value);
    if (parsed === undefined) {
      return;
    }

    setSelectedInputFilters((prev) => ({
      ...prev,
      [normalizedId]: {
        ...prev[normalizedId],
        [key]: parsed,
      },
    }));
  };

  const appendToken = (token: string) => {
    setFormula((prev) => `${prev}${prev ? " " : ""}${token}`);
  };

  const removeTokenAtIndex = (index: number) => {
    const nextTokens = formulaTokens.filter((_, i) => i !== index);
    setFormula(nextTokens.join(" "));
  };

  const handleDragStart = (
    event: DragEvent<HTMLButtonElement>,
    input: KpiFormulaInputOption,
  ) => {
    const token = input.variable_name || input.name;
    event.dataTransfer.setData(
      DND_TOKEN_KEY,
      JSON.stringify({ token, id: input.id }),
    );
    event.dataTransfer.effectAllowed = "copy";
  };

  const handleDropOnFormula = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOverFormula(false);

    const raw = event.dataTransfer.getData(DND_TOKEN_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as { token?: string; id?: number };
      if (!parsed.token) return;
      appendToken(parsed.token);
      if (typeof parsed.id === "number") {
        addInputToSelection(parsed.id);
      }
    } catch {
      // Ignore invalid drag payloads from external sources.
    }
  };

  const addCustomToken = () => {
    const token = customToken.trim();
    if (!token) return;
    appendToken(token);
    setCustomToken("");
  };

  const resetFormulaBuilder = () => {
    setSelectedKpiId("");
    setKpiSearch("");
    setSearch("");
    setSelectedInputIds([]);
    setSelectedInputFilters({});
    setFormula("");
    setCustomToken("");
    setIsDraggingOverFormula(false);
  };

  const handleSave = () => {
    startTransition(async () => {
      if (!selectedKpiId) {
        toast.error("Choose a KPI first.");
        return;
      }

      const formulaInputs = getFormulaInputs(
        formula,
        props.inputs,
        selectedInputIds,
        selectedInputFilters,
      );
      const response = await SaveKpiFormula({
        kpiId: Number(selectedKpiId),
        formula,
        formulaInputs,
      });

      if (!response.success) {
        toast.error(response.message);
        return;
      }

      toast.success(response.message);
      resetFormulaBuilder();
    });
  };

  return (
    <Card className="w-full border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-bold sm:text-xl">
          KPI Formula Builder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 sm:space-y-8">
        <div>
          <div>
            <Label className="text-xs sm:text-sm">Select KPI</Label>
            <div className="my-1.5 flex items-center gap-2">
              <Label
                htmlFor="kpi-no-formula-filter"
                className="text-muted-foreground text-xs sm:text-sm"
              >
                <Checkbox
                  id="kpi-no-formula-filter"
                  checked={showNoFormulaOnly}
                  onCheckedChange={(checked) =>
                    setShowNoFormulaOnly(checked === true)
                  }
                />
                Show only KPIs with no formula
              </Label>
            </div>
          </div>

          <Select
            value={selectedKpiId}
            onValueChange={handleKpiChange}
          >
            <SelectTrigger className="w-full p-2 text-xs">
              <SelectValue placeholder="Select KPI definition" />
            </SelectTrigger>
            <SelectContent>
              <div className="sticky top-0 z-10 border-b bg-popover p-1.5 sm:p-2">
                <Input
                  value={kpiSearch}
                  onChange={(event) => setKpiSearch(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="h-8 text-xs sm:h-9 sm:text-sm"
                  placeholder="Search KPI..."
                />
              </div>
              {filteredKpis.length === 0 && (
                <p className="text-muted-foreground px-2 py-2 text-sm">
                  No KPI found.
                </p>
              )}
              {filteredKpis.map((kpi) => (
                <SelectItem
                  key={kpi.id}
                  value={kpi.id.toString()}
                  className="text-xs sm:text-sm"
                >
                  <span className="block max-w-full truncate">{kpi.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:gap-4 xl:grid-cols-[340px_minmax(0,1fr)] xl:gap-6">
          <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 sm:p-4 max-[420px]:p-2">
            <Label className="text-xs sm:text-sm">Search and Drag Inputs</Label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="my-1.5 h-7 text-xs sm:my-2 sm:h-9 sm:text-sm"
              placeholder="Search by input name or variable"
            />

            <div className="max-h-72 min-h-36 overflow-y-auto rounded-md border bg-background p-1.5 sm:max-h-112 sm:min-h-60 sm:p-2.5 max-[420px]:max-h-64 max-[420px]:min-h-32">
              {filteredInputs.length === 0 && (
                <p className="text-muted-foreground text-xs sm:text-sm">
                  No inputs match your search.
                </p>
              )}

              <div className="space-y-1.5 sm:space-y-2">
                {filteredInputs.map((input) => {
                  const token = input.variable_name || input.name;
                  return (
                    <Button
                      key={input.id}
                      type="button"
                      variant="outline"
                      className="h-auto w-full justify-start whitespace-normal px-1.5 py-1 text-left text-xs sm:px-2.5 sm:py-2"
                      draggable
                      onDragStart={(event) => handleDragStart(event, input)}
                      onClick={() => {
                        appendToken(token);
                        addInputToSelection(input.id);
                      }}
                    >
                      {input.name}
                      {input.variable_name ? ` (${input.variable_name})` : ""}
                    </Button>
                  );
                })}
              </div>
            </div>
            <p className="text-muted-foreground text-[11px] sm:text-xs">
              Tip: drag a variable into the formula box, or click to append.
            </p>
          </div>

          <div className="space-y-2.5 rounded-lg border border-border/70 bg-card p-2.5 sm:space-y-4 sm:p-4 max-[420px]:p-2">
            <div className="grid gap-2.5 sm:gap-3">
              <Label className="text-xs sm:text-sm">Formula Tools</Label>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {operators.map((operator) => (
                  <Button
                    key={operator}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-1.5 text-xs sm:h-8 sm:px-3 sm:text-sm"
                    onClick={() => appendToken(operator)}
                  >
                    {operator}
                  </Button>
                ))}
                <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:flex-row sm:gap-2">
                  <Input
                    value={customToken}
                    onChange={(event) => setCustomToken(event.target.value)}
                    placeholder="Add constant/token (e.g. 100)"
                    className="h-7 text-xs sm:h-9 sm:w-56 sm:text-sm"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm"
                    onClick={addCustomToken}
                  >
                    Add Token
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs sm:h-8 sm:px-3 sm:text-sm"
                  onClick={() => setFormula("")}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  disabled={isSaving || !selectedKpiId}
                  onClick={handleSave}
                  className="ml-auto h-7 w-full text-xs sm:h-8 sm:w-auto sm:text-sm"
                >
                  <FaSave />
                  {isSaving ? "Saving..." : "Save Formula"}
                </Button>
              </div>
            </div>

            <div className="grid gap-2.5 sm:gap-3">
              <Label className="text-xs sm:text-sm">Formula</Label>
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDraggingOverFormula(true);
                }}
                onDragEnter={() => setIsDraggingOverFormula(true)}
                onDragLeave={() => setIsDraggingOverFormula(false)}
                onDrop={handleDropOnFormula}
                className={
                  isDraggingOverFormula
                    ? "min-h-40 rounded-md border bg-background p-2 ring-2 ring-primary/50 sm:min-h-56 sm:p-3"
                    : "min-h-40 rounded-md border bg-background p-2 sm:min-h-56 sm:p-3"
                }
              >
                <div className="flex min-h-32 flex-wrap items-start gap-1.5 sm:min-h-48 sm:gap-2">
                  {formulaTokens.length === 0 && (
                    <p className="text-muted-foreground text-xs sm:text-sm">
                      Drag inputs here. Inputs appear as boxes with x to remove.
                    </p>
                  )}

                  {formulaTokens.map((token, index) => {
                    const isInputToken = inputTokenSet.has(token);
                    const isOperatorToken = operatorTokenSet.has(token);
                    const isNumericConstant = /^-?\d+(\.\d+)?$/.test(token);

                    const tokenClass = isInputToken
                      ? "border-sky-200 bg-sky-100 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"
                      : isOperatorToken
                        ? "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                        : isNumericConstant
                          ? "border-green-200 bg-green-100 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
                          : "border-violet-200 bg-violet-100 text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300";

                    return (
                      <span
                        key={`${token}-${index}`}
                        className={`flex items-center text-xs rounded border ${tokenClass}`}
                      >
                        <span
                          className={`p-1 font-black ${!isInputToken ? "font-mono" : ""}`}
                        >
                          {token}
                        </span>
                        <span
                          onClick={() => removeTokenAtIndex(index)}
                          className="cursor-pointer p-1 text-red-500"
                        >
                          <FaTimes />
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs sm:text-sm">Preview</Label>
              <Input
                readOnly
                value={formula}
                className="h-8 text-xs sm:h-9 sm:text-sm"
                placeholder="Formula preview"
              />
            </div>

            <div className="grid gap-2">
              <Label>Selected Inputs</Label>
              <div className="flex min-h-9 flex-wrap gap-1.5 rounded-md border border-dashed bg-muted/20 p-2 sm:min-h-10 sm:gap-2 sm:p-2.5">
                {visibleFilterInputs.length === 0 && (
                  <p className="text-muted-foreground text-xs sm:text-sm">
                    No inputs selected yet. Add inputs from the left list or
                    reference their variable names in the formula to configure
                    provider/source filters.
                  </p>
                )}
                {visibleFilterInputs.map((input) => (
                  <div
                    key={input.id}
                    className="w-full rounded-md border bg-white shadow-md p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="gap-1.5 px-2 py-0.5 text-xs sm:gap-2 sm:py-1"
                      >
                        <button
                          type="button"
                          className="hover:underline"
                          onClick={() =>
                            appendToken(input.variable_name || input.name)
                          }
                        >
                          {input.name}
                        </button>
                        <button
                          type="button"
                          className="text-xs"
                          onClick={() => removeInputFromSelection(input.id)}
                        >
                          x
                        </button>
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-4 border-t pt-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Energy Provider</Label>
                        <Select
                          value={
                            selectedInputFilters[input.id]?.energyProviderId !=
                            null
                              ? String(
                                  selectedInputFilters[input.id]
                                    ?.energyProviderId,
                                )
                              : NONE_OPTION_VALUE
                          }
                          onValueChange={(value) =>
                            updateInputFilter(
                              input.id,
                              "energyProviderId",
                              value,
                            )
                          }
                        >
                          <SelectTrigger className="text-xs p-1 shadow">
                            <SelectValue placeholder="Energy provider (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_OPTION_VALUE}>
                              -- All --
                            </SelectItem>
                            {props.energyProviderOptions.map((option) => (
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

                      <div className="space-y-1">
                        <Label className="text-xs">Energy Type</Label>
                        <Select
                          value={
                            selectedInputFilters[input.id]?.energyTypeId != null
                              ? String(
                                  selectedInputFilters[input.id]?.energyTypeId,
                                )
                              : NONE_OPTION_VALUE
                          }
                          onValueChange={(value) =>
                            updateInputFilter(input.id, "energyTypeId", value)
                          }
                        >
                          <SelectTrigger className="text-xs p-1 shadow">
                            <SelectValue placeholder="Energy type (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_OPTION_VALUE}>
                              -- All --
                            </SelectItem>
                            {props.energyTypeOptions.map((option) => (
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

                      <div className="space-y-1">
                        <Label className="text-xs">Energy Source</Label>
                        <Select
                          value={
                            selectedInputFilters[input.id]?.energySourceId !=
                            null
                              ? String(
                                  selectedInputFilters[input.id]
                                    ?.energySourceId,
                                )
                              : NONE_OPTION_VALUE
                          }
                          onValueChange={(value) =>
                            updateInputFilter(input.id, "energySourceId", value)
                          }
                        >
                          <SelectTrigger className="text-xs p-1 shadow">
                            <SelectValue placeholder="Energy source (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_OPTION_VALUE}>
                              -- All --
                            </SelectItem>
                            {props.energySourceOptions.map((option) => (
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
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
