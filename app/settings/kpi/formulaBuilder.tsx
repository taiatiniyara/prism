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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FaSave, FaTimes } from "react-icons/fa";
import type { ManagedDimensionOption } from "./service";

export interface KpiFormulaInputOption {
  id: number;
  name: string;
  variable_name: string | null;
}

const operators = ["+", "-", "*", "/", "(", ")", "WHERE", "AND"];
const DND_TOKEN_KEY = "application/x-prism-formula-token";

interface FormulaInputFilters {
  energyProviderId?: number | null;
  energyTypeId?: number | null;
  energySourceId?: number | null;
}

const MATH_OPERATORS = new Set(["+", "-", "*", "/", "(", ")"]);
const isIdentifierToken = (token: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(token);
const tokenizeFormula = (text: string): string[] =>
  text.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];

interface ParsedInlineFormulaResult {
  cleanedFormula: string;
  filtersByToken: Record<string, FormulaInputFilters>;
  errors: string[];
}

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

function buildFormulaWithWhereClauses(
  formula: string,
  formulaInputs: FormulaInput[],
  energyProviderNameById: Map<number, string>,
  energyTypeNameById: Map<number, string>,
  energySourceNameById: Map<number, string>,
): string {
  const tokens = tokenizeFormula(formula);
  if (tokens.length === 0) {
    return formula;
  }

  const clausesByVariable = new Map<string, string>();
  for (const input of formulaInputs) {
    const parts: string[] = [];

    if (input.energy_provider_id != null) {
      const providerLabel = energyProviderNameById.get(
        input.energy_provider_id,
      );
      parts.push(
        providerLabel
          ? `provider=${JSON.stringify(providerLabel)}`
          : `provider=${input.energy_provider_id}`,
      );
    }

    if (input.energy_type_id != null) {
      const typeLabel = energyTypeNameById.get(input.energy_type_id);
      parts.push(
        typeLabel
          ? `type=${JSON.stringify(typeLabel)}`
          : `type=${input.energy_type_id}`,
      );
    }

    if (input.energy_source_id != null) {
      const sourceLabel = energySourceNameById.get(input.energy_source_id);
      parts.push(
        sourceLabel
          ? `source=${JSON.stringify(sourceLabel)}`
          : `source=${input.energy_source_id}`,
      );
    }

    if (parts.length > 0) {
      clausesByVariable.set(input.variable_name, parts.join(" AND "));
    }
  }

  if (clausesByVariable.size === 0) {
    return formula;
  }

  const outputTokens: string[] = [];
  for (const token of tokens) {
    outputTokens.push(token);
    const clause = clausesByVariable.get(token);
    if (clause) {
      outputTokens.push("WHERE", clause);
    }
  }

  return outputTokens.join(" ");
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

  const inputByToken = useMemo(() => {
    const map = new Map<string, KpiFormulaInputOption>();
    for (const input of props.inputs) {
      map.set(input.name, input);
      if (input.variable_name) {
        map.set(input.variable_name, input);
      }
    }
    return map;
  }, [props.inputs]);

  const energyProviderNameById = useMemo(() => {
    return new Map(
      props.energyProviderOptions.map((option) => [option.id, option.name]),
    );
  }, [props.energyProviderOptions]);

  const energyTypeNameById = useMemo(() => {
    return new Map(
      props.energyTypeOptions.map((option) => [option.id, option.name]),
    );
  }, [props.energyTypeOptions]);

  const energySourceNameById = useMemo(() => {
    return new Map(
      props.energySourceOptions.map((option) => [option.id, option.name]),
    );
  }, [props.energySourceOptions]);

  const energyProviderIdByName = useMemo(() => {
    return new Map(
      props.energyProviderOptions.map((option) => [
        option.name.toLowerCase(),
        option.id,
      ]),
    );
  }, [props.energyProviderOptions]);

  const energyTypeIdByName = useMemo(() => {
    return new Map(
      props.energyTypeOptions.map((option) => [
        option.name.toLowerCase(),
        option.id,
      ]),
    );
  }, [props.energyTypeOptions]);

  const energySourceIdByName = useMemo(() => {
    return new Map(
      props.energySourceOptions.map((option) => [
        option.name.toLowerCase(),
        option.id,
      ]),
    );
  }, [props.energySourceOptions]);

  const formulaTokens = useMemo(() => tokenizeFormula(formula), [formula]);

  const parseInlineFormula = (text: string): ParsedInlineFormulaResult => {
    const tokens = tokenizeFormula(text);
    const outputTokens: string[] = [];
    const filtersByToken: Record<string, FormulaInputFilters> = {};
    const errors: string[] = [];

    const resolveFilterValue = (
      rawValue: string,
      dimension: "provider" | "type" | "source",
    ): number | null | undefined => {
      const unquoted = rawValue.replace(/^['\"]|['\"]$/g, "").trim();
      const normalized = unquoted.toLowerCase();

      if (normalized === "all" || normalized === "none" || normalized === "*") {
        return null;
      }

      const asNumeric = Number(unquoted);
      if (Number.isFinite(asNumeric)) {
        return asNumeric;
      }

      if (dimension === "provider") {
        return energyProviderIdByName.get(normalized);
      }

      if (dimension === "type") {
        return energyTypeIdByName.get(normalized);
      }

      return energySourceIdByName.get(normalized);
    };

    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      const next = tokens[i + 1];

      if (
        isIdentifierToken(token) &&
        typeof next === "string" &&
        next.toUpperCase() === "WHERE"
      ) {
        outputTokens.push(token);
        i += 2;

        const currentFilters: FormulaInputFilters = {};
        let parsedAtLeastOneFilter = false;

        while (i < tokens.length) {
          const current = tokens[i];
          const currentUpper = current.toUpperCase();

          if (currentUpper === "AND" || current === ",") {
            i += 1;
            continue;
          }

          if (MATH_OPERATORS.has(current)) {
            break;
          }

          if (
            isIdentifierToken(current) &&
            typeof tokens[i + 1] === "string" &&
            tokens[i + 1].toUpperCase() === "WHERE"
          ) {
            break;
          }

          let assignmentKey: string | null = null;
          let assignmentValue: string | null = null;
          let consumedTokens = 1;

          const compactAssignment = current.match(
            /^([A-Za-z_][A-Za-z0-9_-]*)=(.+)$/,
          );

          if (compactAssignment) {
            assignmentKey = compactAssignment[1];
            assignmentValue = compactAssignment[2];
          } else if (
            /^[A-Za-z_][A-Za-z0-9_-]*$/.test(current) &&
            tokens[i + 1] === "=" &&
            typeof tokens[i + 2] === "string"
          ) {
            assignmentKey = current;
            assignmentValue = tokens[i + 2];
            consumedTokens = 3;
          }

          if (!assignmentKey || assignmentValue == null) {
            errors.push(
              `Invalid WHERE token '${current}' for '${token}'. Use provider=..., type=..., or source=... (spaces around '=' are allowed).`,
            );
            i += 1;
            continue;
          }

          const rawKey = assignmentKey.toLowerCase().replace(/[-_]/g, "");
          const rawValue = assignmentValue;

          if (rawKey === "provider" || rawKey === "energyprovider") {
            const resolved = resolveFilterValue(rawValue, "provider");
            if (typeof resolved === "undefined") {
              errors.push(
                `Unknown energy provider '${rawValue}' for '${token}'. Use a valid provider name or id.`,
              );
            } else {
              currentFilters.energyProviderId = resolved;
              parsedAtLeastOneFilter = true;
            }
          } else if (rawKey === "type" || rawKey === "energytype") {
            const resolved = resolveFilterValue(rawValue, "type");
            if (typeof resolved === "undefined") {
              errors.push(
                `Unknown energy type '${rawValue}' for '${token}'. Use a valid type name or id.`,
              );
            } else {
              currentFilters.energyTypeId = resolved;
              parsedAtLeastOneFilter = true;
            }
          } else if (rawKey === "source" || rawKey === "energysource") {
            const resolved = resolveFilterValue(rawValue, "source");
            if (typeof resolved === "undefined") {
              errors.push(
                `Unknown energy source '${rawValue}' for '${token}'. Use a valid source name or id.`,
              );
            } else {
              currentFilters.energySourceId = resolved;
              parsedAtLeastOneFilter = true;
            }
          } else {
            errors.push(
              `Unknown WHERE key '${assignmentKey}' for '${token}'. Allowed keys: provider, type, source.`,
            );
          }

          i += consumedTokens;
        }

        if (!parsedAtLeastOneFilter) {
          errors.push(`WHERE clause for '${token}' has no valid filters.`);
        } else {
          filtersByToken[token] = currentFilters;
        }

        continue;
      }

      outputTokens.push(token);
      i += 1;
    }

    return {
      cleanedFormula: outputTokens.join(" "),
      filtersByToken,
      errors,
    };
  };

  const parsedInlineFormula = useMemo(
    () => parseInlineFormula(formula),
    [formula, energyProviderIdByName, energyTypeIdByName, energySourceIdByName],
  );

  const effectiveInputFilters = useMemo(() => {
    const merged: Record<number, FormulaInputFilters> = {};

    for (const [token, filters] of Object.entries(
      parsedInlineFormula.filtersByToken,
    )) {
      const input = inputByToken.get(token);
      if (!input) {
        continue;
      }

      merged[input.id] = {
        ...merged[input.id],
        ...filters,
      };
    }

    return merged;
  }, [inputByToken, parsedInlineFormula.filtersByToken]);

  const getFilterSummaryForToken = (token: string): string | null => {
    const input = inputByToken.get(token);
    if (!input) {
      return null;
    }

    const filters = effectiveInputFilters[input.id];
    if (!filters) {
      return "All filters";
    }

    const parts: string[] = [];

    if (filters.energyProviderId != null) {
      parts.push(
        `Provider: ${energyProviderNameById.get(filters.energyProviderId) ?? "Unknown"}`,
      );
    }

    if (filters.energyTypeId != null) {
      parts.push(
        `Type: ${energyTypeNameById.get(filters.energyTypeId) ?? "Unknown"}`,
      );
    }

    if (filters.energySourceId != null) {
      parts.push(
        `Source: ${energySourceNameById.get(filters.energySourceId) ?? "Unknown"}`,
      );
    }

    return parts.length > 0 ? parts.join(" | ") : "All filters";
  };

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
    const formulaInputs = kpi?.formula_inputs ?? [];
    setFormula(
      buildFormulaWithWhereClauses(
        kpi?.formula ?? "",
        formulaInputs,
        energyProviderNameById,
        energyTypeNameById,
        energySourceNameById,
      ),
    );
    setSelectedInputIds(
      formulaInputs.map((item) => normalizeInputId(item.input_def_id)),
    );
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
        parsedInlineFormula.cleanedFormula,
        props.inputs,
        selectedInputIds,
        effectiveInputFilters,
      );

      if (parsedInlineFormula.errors.length > 0) {
        toast.error(parsedInlineFormula.errors[0]);
        return;
      }

      const response = await SaveKpiFormula({
        kpiId: Number(selectedKpiId),
        formula: parsedInlineFormula.cleanedFormula,
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
              <div className="grid gap-2.5 sm:gap-3">
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

                <div className="grid gap-2">
                  <Label className="text-xs sm:text-sm">Input Filters</Label>
                  <div className="space-y-1 rounded-md border border-dashed bg-muted/20 p-2 text-[11px] sm:p-2.5 sm:text-xs">
                    <p className="text-muted-foreground">
                      Use inline WHERE in your formula: variable WHERE
                      provider=Name AND type=Name AND source=Name
                    </p>
                    <p className="text-muted-foreground">
                      Example: kwh_sold WHERE provider="ABC Power" AND
                      source="Grid" + kwh_generated
                    </p>
                    {parsedInlineFormula.errors.length > 0 && (
                      <p className="text-red-600">
                        {parsedInlineFormula.errors[0]}
                      </p>
                    )}
                    {visibleFilterInputs.length > 0 && (
                      <p className="text-muted-foreground">
                        Filters detected for {visibleFilterInputs.length} input
                        {visibleFilterInputs.length > 1 ? "s" : ""}.
                      </p>
                    )}
                  </div>
                </div>
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
                        <span className="flex flex-col px-1 py-0.5">
                          <span
                            className={`font-black ${!isInputToken ? "font-mono" : ""}`}
                          >
                            {token}
                          </span>
                          {isInputToken && (
                            <span className="text-[10px] leading-tight opacity-80">
                              {getFilterSummaryForToken(token)}
                            </span>
                          )}
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
