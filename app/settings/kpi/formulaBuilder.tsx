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
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FaSave, FaTimes } from "react-icons/fa";

export interface KpiFormulaInputOption {
  id: number;
  name: string;
  variable_name: string | null;
}

const operators = ["+", "-", "*", "/", "(", ")"];
const DND_TOKEN_KEY = "application/x-prism-formula-token";

function getFormulaInputs(
  formula: string,
  inputs: KpiFormulaInputOption[],
  selectedInputIds: number[],
): FormulaInput[] {
  const tokenMatches = formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const tokenSet = new Set(tokenMatches);

  const fromFormula = inputs
    .filter((item) => item.variable_name && tokenSet.has(item.variable_name))
    .map((item) => ({
      input_def_id: item.id,
      variable_name: item.variable_name as string,
    }));

  const selectedSet = new Set(selectedInputIds);
  const fromSelection = inputs
    .filter((item) => selectedSet.has(item.id) && !!item.variable_name)
    .map((item) => ({
      input_def_id: item.id,
      variable_name: item.variable_name as string,
    }));

  const merged = [...fromFormula, ...fromSelection];
  const dedup = new Map<number, FormulaInput>();
  for (const item of merged) {
    dedup.set(item.input_def_id, item);
  }

  return [...dedup.values()];
}

export default function KpiFormulaBuilder(props: {
  kpis: KpiDefinition[];
  inputs: KpiFormulaInputOption[];
}) {
  const [isSaving, startTransition] = useTransition();
  const [selectedKpiId, setSelectedKpiId] = useState<string>("");
  const [kpiSearch, setKpiSearch] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [selectedInputIds, setSelectedInputIds] = useState<number[]>([]);
  const [formula, setFormula] = useState<string>("");
  const [customToken, setCustomToken] = useState<string>("");
  const [isDraggingOverFormula, setIsDraggingOverFormula] = useState(false);

  const selectedInputs = useMemo(() => {
    const selectedSet = new Set(selectedInputIds);
    return props.inputs.filter((item) => selectedSet.has(item.id));
  }, [props.inputs, selectedInputIds]);

  const filteredKpis = useMemo(() => {
    if (!kpiSearch.trim()) return props.kpis;
    const term = kpiSearch.toLowerCase();
    return props.kpis.filter((kpi) => kpi.name.toLowerCase().includes(term));
  }, [kpiSearch, props.kpis]);

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

  const handleKpiChange = (value: string) => {
    setSelectedKpiId(value);
    const kpi = props.kpis.find((item) => item.id.toString() === value);
    setFormula(kpi?.formula ?? "");
    setSelectedInputIds(
      kpi?.formula_inputs?.map((item) => item.input_def_id) ?? [],
    );
    setKpiSearch("");
    setSearch("");
  };

  const addInputToSelection = (id: number) => {
    setSelectedInputIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const removeInputFromSelection = (id: number) => {
    setSelectedInputIds((prev) => prev.filter((item) => item !== id));
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
        formula,
        props.inputs,
        selectedInputIds,
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
          <Label className="text-xs sm:text-sm">Select KPI</Label>
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
                      ? "border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : isOperatorToken
                        ? "border-sky-200 bg-sky-100 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"
                        : isNumericConstant
                          ? "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
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
          </div>
        </div>

        <div className="grid gap-2">
          <Label className="text-xs sm:text-sm">Selected Inputs</Label>
          <div className="flex min-h-9 flex-wrap gap-1.5 rounded-md border border-dashed bg-muted/20 p-2 sm:min-h-10 sm:gap-2 sm:p-2.5">
            {selectedInputs.length === 0 && (
              <p className="text-muted-foreground text-xs sm:text-sm">
                No inputs selected yet.
              </p>
            )}
            {selectedInputs.map((input) => (
              <Badge
                key={input.id}
                variant="secondary"
                className="gap-1.5 px-2 py-0.5 text-xs sm:gap-2 sm:py-1"
              >
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => appendToken(input.variable_name || input.name)}
                >
                  {input.variable_name || input.name}
                </button>
                <button
                  type="button"
                  className="text-xs"
                  onClick={() => removeInputFromSelection(input.id)}
                >
                  x
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <p className="text-muted-foreground text-[11px] sm:mr-auto sm:text-xs">
            Save after verifying selected inputs and formula syntax.
          </p>
          <Button
            type="button"
            disabled={isSaving || !selectedKpiId}
            onClick={handleSave}
            className="h-8 w-full text-xs sm:h-9 sm:w-auto sm:text-sm"
          >
            <FaSave />
            {isSaving ? "Saving..." : "Save Formula"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
