"use client";

import { DragEvent, useMemo, useState, useTransition } from "react";
import { FormulaInput } from "@/db/schema/dataEntry";
import { evaluateKpiFormula } from "@/app/data-entry/kpi-worker/evaluator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FaDice, FaSave, FaTimes } from "react-icons/fa";
import {
  InputFormulaOption,
  ManagedDimensionOption,
  SaveInputFormula,
} from "./service";

const operators = ["+", "-", "*", "/", "(", ")", "WHERE", "AND", "OR"];
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

interface TokenPreviewRow {
  token: string;
  inputName: string;
  unit: string | null;
  value: number;
  filterSummary: string | null;
}

const formatPreviewNumber = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(value);
};

function getFormulaInputs(
  formula: string,
  inputs: InputFormulaOption[],
  selectedInputIds: number[],
  selectedInputFilters: Record<number, FormulaInputFilters>,
): FormulaInput[] {
  const tokenMatches = formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const tokenSet = new Set(tokenMatches);

  const fromFormula = inputs
    .filter((item) => item.variable_name && tokenSet.has(item.variable_name))
    .map((item) => ({
      measure_def_id: item.id,
      variable_name: item.variable_name as string,
    }));

  const selectedSet = new Set(selectedInputIds.map((id) => Number(id)));
  const fromSelection = inputs
    .filter((item) => selectedSet.has(item.id) && !!item.variable_name)
    .map((item) => ({
      measure_def_id: item.id,
      variable_name: item.variable_name as string,
    }));

  const merged = [...fromFormula, ...fromSelection];
  const dedup = new Map<number, FormulaInput>();
  for (const item of merged) {
    const filters = selectedInputFilters[item.measure_def_id];
    dedup.set(item.measure_def_id, {
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

export default function InputFormulaBuilder(props: {
  inputs: InputFormulaOption[];
  energyProviderOptions: ManagedDimensionOption[];
  energyTypeOptions: ManagedDimensionOption[];
  energySourceOptions: ManagedDimensionOption[];
  previewContextLabel: string | null;
}) {
  const [isSaving, startTransition] = useTransition();
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const [inputSearch, setInputSearch] = useState<string>("");
  const [showNoFormulaOnly, setShowNoFormulaOnly] = useState(false);
  const [search, setSearch] = useState<string>("");
  const [selectedDependencyIds, setSelectedDependencyIds] = useState<number[]>(
    [],
  );
  const [formula, setFormula] = useState<string>("");
  const [isFormulaTextMode, setIsFormulaTextMode] = useState(false);
  const [formulaTextDraft, setFormulaTextDraft] = useState<string>("");
  const [customToken, setCustomToken] = useState<string>("");
  const [isDraggingOverFormula, setIsDraggingOverFormula] = useState(false);
  const [sampleBaseValue, setSampleBaseValue] = useState<number>(10);
  const [sampleSeed, setSampleSeed] = useState<number>(1);

  const normalizeInputId = (id: number) => Number(id);

  const filteredMeasureDefinitions = useMemo(() => {
    const term = inputSearch.trim().toLowerCase();

    return props.inputs.filter((input) => {
      const matchesSearch = !term || input.name.toLowerCase().includes(term);
      const hasNoFormula = !(input.formula ?? "").trim();
      return matchesSearch && (!showNoFormulaOnly || hasNoFormula);
    });
  }, [inputSearch, props.inputs, showNoFormulaOnly]);

  const availableInputs = useMemo(() => {
    if (!selectedInputId) {
      return props.inputs;
    }

    return props.inputs.filter(
      (item) => item.id.toString() !== selectedInputId,
    );
  }, [props.inputs, selectedInputId]);

  const filteredInputs = useMemo(() => {
    if (!search.trim()) return availableInputs;
    const term = search.toLowerCase();

    return availableInputs.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        (item.variable_name || "").toLowerCase().includes(term),
    );
  }, [availableInputs, search]);

  const inputTokenSet = useMemo(() => {
    return new Set(
      props.inputs
        .map((item) => item.variable_name || item.name)
        .filter((token): token is string => !!token),
    );
  }, [props.inputs]);

  const operatorTokenSet = useMemo(() => new Set(operators), []);

  const inputByToken = useMemo(() => {
    const map = new Map<string, InputFormulaOption>();
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

          if (
            currentUpper === "AND" ||
            currentUpper === "OR" ||
            current === ","
          ) {
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

  const parsedInlineFormula = parseInlineFormula(formula);

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
      selectedDependencyIds.map((id) => normalizeInputId(id)),
    );

    return availableInputs.filter(
      (item) =>
        selectedIdSet.has(item.id) ||
        (!!item.variable_name && formulaVariableSet.has(item.variable_name)),
    );
  }, [availableInputs, formulaVariableSet, selectedDependencyIds]);

  const selectedInput = useMemo(() => {
    return (
      props.inputs.find((item) => item.id.toString() === selectedInputId) ??
      null
    );
  }, [props.inputs, selectedInputId]);

  const toTokenHash = (value: string): number => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash;
  };

  const resolveSampleValueForToken = (token: string): number => {
    const input = inputByToken.get(token);
    if (!input) {
      return 0;
    }

    const filters = effectiveInputFilters[input.id];
    const providerWeight = filters?.energyProviderId != null ? 3 : 0;
    const typeWeight = filters?.energyTypeId != null ? 5 : 0;
    const sourceWeight = filters?.energySourceId != null ? 7 : 0;
    const tokenWeight = (toTokenHash(`${token}:${sampleSeed}`) % 17) + 1;

    return Number(
      (
        sampleBaseValue +
        input.id * 2 +
        tokenWeight +
        providerWeight +
        typeWeight +
        sourceWeight
      ).toFixed(2),
    );
  };

  const tokenPreviewRows: TokenPreviewRow[] = (() => {
    const identifiers =
      parsedInlineFormula.cleanedFormula.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
    const seen = new Set<string>();
    const rows: TokenPreviewRow[] = [];

    for (const token of identifiers) {
      if (seen.has(token)) {
        continue;
      }

      seen.add(token);
      const input = inputByToken.get(token);
      if (!input) {
        continue;
      }

      rows.push({
        token,
        inputName: input.name,
        unit: input.unit,
        value: resolveSampleValueForToken(token),
        filterSummary: getFilterSummaryForToken(token),
      });
    }

    return rows;
  })();

  const formulaPreviewResult = useMemo(() => {
    const cleanFormula = parsedInlineFormula.cleanedFormula.trim();
    if (!cleanFormula) {
      return {
        status: "idle" as const,
        message: "Build a formula to preview a computed result.",
      };
    }

    if (parsedInlineFormula.errors.length > 0) {
      return {
        status: "error" as const,
        message: parsedInlineFormula.errors[0],
      };
    }

    const variables: Record<string, number> = {};
    for (const row of tokenPreviewRows) {
      variables[row.token] = row.value;
    }

    const evaluated = evaluateKpiFormula(cleanFormula, variables);
    if (evaluated.status === "error") {
      return {
        status: "error" as const,
        message:
          evaluated.failureReason ?? "Unable to evaluate formula preview.",
      };
    }

    return {
      status: "ok" as const,
      value: evaluated.value ?? null,
      message:
        props.previewContextLabel ?? "Preview computed from sample values.",
    };
  }, [parsedInlineFormula, tokenPreviewRows, props.previewContextLabel]);

  const handleInputChange = (value: string) => {
    setSelectedInputId(value);
    const input = props.inputs.find((item) => item.id.toString() === value);
    const formulaInputs = input?.formula_inputs ?? [];

    setFormula(
      buildFormulaWithWhereClauses(
        input?.formula ?? "",
        formulaInputs,
        energyProviderNameById,
        energyTypeNameById,
        energySourceNameById,
      ),
    );
    setSelectedDependencyIds(
      formulaInputs.map((item) => normalizeInputId(item.measure_def_id)),
    );
    setInputSearch("");
    setSearch("");
  };

  const addDependencyToSelection = (id: number) => {
    const normalizedId = normalizeInputId(id);
    setSelectedDependencyIds((prev) => {
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

  const openFormulaTextMode = () => {
    setFormulaTextDraft(formula);
    setIsFormulaTextMode(true);
  };

  const commitFormulaTextMode = () => {
    setFormula(formulaTextDraft.trim());
    setIsFormulaTextMode(false);
  };

  const cancelFormulaTextMode = () => {
    setFormulaTextDraft(formula);
    setIsFormulaTextMode(false);
  };

  const handleDragStart = (
    event: DragEvent<HTMLButtonElement>,
    input: InputFormulaOption,
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
        addDependencyToSelection(parsed.id);
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
    setSelectedInputId("");
    setInputSearch("");
    setShowNoFormulaOnly(false);
    setSearch("");
    setSelectedDependencyIds([]);
    setFormula("");
    setFormulaTextDraft("");
    setIsFormulaTextMode(false);
    setCustomToken("");
    setIsDraggingOverFormula(false);
  };

  const handleSave = () => {
    startTransition(() => {
      void (async () => {
        if (!selectedInputId) {
          toast.error("Choose an input definition first.");
          return;
        }

        if (parsedInlineFormula.errors.length > 0) {
          toast.error(parsedInlineFormula.errors[0]);
          return;
        }

        const formulaInputs = getFormulaInputs(
          parsedInlineFormula.cleanedFormula,
          availableInputs,
          selectedDependencyIds,
          effectiveInputFilters,
        );

        const response = await SaveInputFormula({
          inputId: Number(selectedInputId),
          formula: parsedInlineFormula.cleanedFormula,
          formulaInputs,
        });

        if (!response.success) {
          toast.error(response.message);
          return;
        }

        toast.success(response.message);
        resetFormulaBuilder();
      })();
    });
  };

  return (
    <Card className="w-full border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-bold sm:text-xl">
          Input Formula Builder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 sm:space-y-8">
        <div>
          <div>
            <Label className="text-xs sm:text-sm">
              Select Input Definition
            </Label>
            <div className="my-1.5 flex items-center gap-2">
              <Label
                htmlFor="input-no-formula-filter"
                className="text-muted-foreground text-xs sm:text-sm"
              >
                <Checkbox
                  id="input-no-formula-filter"
                  checked={showNoFormulaOnly}
                  onCheckedChange={(checked) =>
                    setShowNoFormulaOnly(checked === true)
                  }
                />
                Show only inputs with no formula
              </Label>
            </div>
          </div>

          <SearchableSelect
            value={selectedInputId}
            onValueChange={handleInputChange}
            options={filteredMeasureDefinitions.map((input) => ({
              value: input.id.toString(),
              label: input.name,
            }))}
            placeholder="Select input definition"
            searchPlaceholder="Search input definition..."
            emptyLabel="No input definition found."
            triggerClassName="w-full p-2 text-xs"
            searchContainerClassName="sticky top-0 z-10 border-b bg-popover p-1.5 sm:p-2"
            searchInputClassName="text-xs sm:h-9 sm:text-sm"
            itemClassName="text-xs sm:text-sm"
            allowEscapeKeyPropagation={false}
          />
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
            Input Unit: {selectedInput?.unit ?? "Not set"}
          </p>
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
                        addDependencyToSelection(input.id);
                      }}
                    >
                      <span className="flex flex-col">
                        <span>
                          {input.name}
                          {input.variable_name
                            ? ` (${input.variable_name})`
                            : ""}
                        </span>
                        <span className="text-muted-foreground text-[10px] sm:text-xs">
                          Unit: {input.unit ?? "Not set"}
                        </span>
                      </span>
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
              <div className="grid gap-2">
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
                    disabled={isSaving || !selectedInputId}
                    onClick={handleSave}
                    className="ml-auto h-7 w-full text-xs sm:h-8 sm:w-auto sm:text-sm"
                  >
                    <FaSave />
                    {isSaving ? "Saving..." : "Save Formula"}
                  </Button>
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs sm:text-sm">Input Filters</Label>
                  <div className="space-y-1 rounded-md border border-dashed bg-muted/20 p-2 text-[11px] sm:text-xs">
                    <p className="text-muted-foreground">
                      Inline filter format: variable WHERE provider=... AND/OR
                      type=... AND/OR source=...
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
                  if (isFormulaTextMode) {
                    return;
                  }
                  event.preventDefault();
                  setIsDraggingOverFormula(true);
                }}
                onDragEnter={() => {
                  if (isFormulaTextMode) {
                    return;
                  }
                  setIsDraggingOverFormula(true);
                }}
                onDragLeave={() => {
                  if (isFormulaTextMode) {
                    return;
                  }
                  setIsDraggingOverFormula(false);
                }}
                onDrop={handleDropOnFormula}
                className={
                  isDraggingOverFormula
                    ? "min-h-40 rounded-md border bg-background p-2 ring-2 ring-primary/50 sm:min-h-56 sm:p-3"
                    : "min-h-40 rounded-md border bg-background p-2 sm:min-h-56 sm:p-3"
                }
              >
                {isFormulaTextMode ? (
                  <Input
                    autoFocus
                    value={formulaTextDraft}
                    onChange={(event) =>
                      setFormulaTextDraft(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitFormulaTextMode();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelFormulaTextMode();
                      }
                    }}
                    className="h-8 text-xs sm:h-9 sm:text-sm"
                    placeholder="Edit formula text and press Enter"
                  />
                ) : (
                  <div className="flex min-h-32 flex-wrap items-start gap-1.5 sm:min-h-48 sm:gap-2">
                    {formulaTokens.length === 0 && (
                      <p className="text-muted-foreground text-xs sm:text-sm">
                        Drag inputs here. Inputs appear as boxes with x to
                        remove.
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
                            ? "border-lime-200 bg-lime-100 text-lime-900 dark:border-lime-900 dark:bg-lime-950/40 dark:text-lime-300"
                            : "border-violet-200 bg-violet-100 text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300";

                      const filterSummary = getFilterSummaryForToken(token);

                      return (
                        <span
                          key={`${token}-${index}`}
                          className={`flex items-center text-xs rounded border ${tokenClass}`}
                          onDoubleClick={openFormulaTextMode}
                        >
                          <span className="flex flex-col px-1 py-0.5">
                            <span
                              className={`font-black ${!isInputToken ? "font-mono" : ""}`}
                              onDoubleClick={openFormulaTextMode}
                            >
                              {token}
                            </span>
                            {isInputToken && (
                              <span className="text-[10px] leading-tight opacity-80">
                                {inputByToken.get(token)?.unit ?? "No unit"}
                                {filterSummary &&
                                filterSummary !== "All filters"
                                  ? ` | ${filterSummary}`
                                  : ""}
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
                )}
              </div>
              {!isFormulaTextMode && (
                <p className="text-muted-foreground text-[11px] sm:text-xs">
                  Double-click any token to edit the full formula as text.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label className="text-xs sm:text-sm">Preview</Label>
              <div className="grid gap-1.5 rounded-md border border-dashed bg-muted/20 p-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs sm:text-sm">
                    Sample Base Value
                  </Label>
                  <span className="text-muted-foreground text-xs sm:text-sm">
                    {sampleBaseValue}
                  </span>
                </div>
                <Input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={sampleBaseValue}
                  onChange={(event) =>
                    setSampleBaseValue(Number(event.target.value))
                  }
                  className="h-8"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSampleSeed((prev) => prev + 1)}
                >
                  <FaDice />
                  Randomize Sample Values
                </Button>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <div className="space-y-1.5 rounded-md border border-dashed bg-muted/20 p-2">
                  <p className="text-xs font-medium">Input Preview Values</p>
                  {tokenPreviewRows.length === 0 ? (
                    <p className="text-muted-foreground text-[11px] sm:text-xs">
                      Add at least one input variable to see preview values.
                    </p>
                  ) : (
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {tokenPreviewRows.map((row) => (
                        <div
                          key={row.token}
                          className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1 text-xs"
                          title={row.inputName}
                        >
                          <span className="truncate font-medium">
                            {row.token}
                          </span>
                          <span>
                            {formatPreviewNumber(row.value)}
                            {row.unit ? ` ${row.unit}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-dashed bg-muted/20 p-2">
                  <p className="text-xs font-medium">Actual Formula Preview</p>
                  <p className="mt-1 wrap-break-word font-mono text-[11px] text-muted-foreground sm:text-xs">
                    {parsedInlineFormula.cleanedFormula || "--"}
                  </p>
                  <p className="text-muted-foreground mt-2 text-[10px] sm:text-xs">
                    {formulaPreviewResult.message}
                  </p>
                </div>

                <div className="rounded-md border bg-background p-2">
                  <p className="text-xs font-medium">Input Result Preview</p>
                  <p className="mt-1 text-sm font-semibold sm:text-base">
                    {formulaPreviewResult.status === "ok"
                      ? `${formatPreviewNumber(Number(formulaPreviewResult.value))}${selectedInput?.unit ? ` ${selectedInput.unit}` : ""}`
                      : "--"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs sm:text-sm">Selected Inputs</Label>
              <div className="flex min-h-9 flex-wrap gap-1.5 rounded-md border border-dashed bg-muted/20 p-2 sm:min-h-10 sm:gap-2 sm:p-2.5">
                {selectedDependencyIds.length === 0 && (
                  <p className="text-muted-foreground text-xs sm:text-sm">
                    No inputs selected yet.
                  </p>
                )}
                {availableInputs
                  .filter((input) => selectedDependencyIds.includes(input.id))
                  .map((input) => (
                    <Badge
                      key={input.id}
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
                        onClick={() =>
                          setSelectedDependencyIds((prev) =>
                            prev.filter((id) => id !== input.id),
                          )
                        }
                      >
                        x
                      </button>
                    </Badge>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
