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
  const [search, setSearch] = useState<string>("");
  const [selectedInputIds, setSelectedInputIds] = useState<number[]>([]);
  const [formula, setFormula] = useState<string>("");
  const [customToken, setCustomToken] = useState<string>("");
  const [isDraggingOverFormula, setIsDraggingOverFormula] = useState(false);

  const selectedKpi = useMemo(
    () => props.kpis.find((kpi) => kpi.id.toString() === selectedKpiId),
    [props.kpis, selectedKpiId],
  );

  const selectedInputs = useMemo(() => {
    const selectedSet = new Set(selectedInputIds);
    return props.inputs.filter((item) => selectedSet.has(item.id));
  }, [props.inputs, selectedInputIds]);

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
    });
  };

  return (
    <Card className="w-full border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle>KPI Formula Builder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="grid gap-3 md:gap-4">
          <Label>Choose KPI</Label>
          <Select
            value={selectedKpiId}
            onValueChange={handleKpiChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select KPI definition" />
            </SelectTrigger>
            <SelectContent>
              {props.kpis.map((kpi) => (
                <SelectItem
                  key={kpi.id}
                  value={kpi.id.toString()}
                >
                  {kpi.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedKpi?.description && (
            <p className="text-muted-foreground text-sm">
              {selectedKpi.description}
            </p>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)] xl:gap-6">
          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
            <Label>Search and Drag Inputs</Label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by input name or variable"
            />

            <div className="max-h-112 min-h-60 overflow-y-auto rounded-md border bg-background p-2.5">
              {filteredInputs.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No inputs match your search.
                </p>
              )}

              <div className="space-y-2">
                {filteredInputs.map((input) => {
                  const token = input.variable_name || input.name;
                  return (
                    <Button
                      key={input.id}
                      type="button"
                      variant="outline"
                      className="h-auto w-full justify-start whitespace-normal py-2 text-left"
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
            <p className="text-muted-foreground text-xs">
              Tip: drag a variable into the formula box, or click to append.
            </p>
          </div>

          <div className="space-y-4 rounded-lg border border-border/70 bg-card p-4">
            <div className="grid gap-3">
              <Label>Formula Tools</Label>
              <div className="flex flex-wrap gap-2">
                {operators.map((operator) => (
                  <Button
                    key={operator}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendToken(operator)}
                  >
                    {operator}
                  </Button>
                ))}
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Input
                    value={customToken}
                    onChange={(event) => setCustomToken(event.target.value)}
                    placeholder="Add constant/token (e.g. 100)"
                    className="sm:w-56"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={addCustomToken}
                  >
                    Add Token
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormula("")}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="grid gap-3">
              <Label>Formula</Label>
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
                    ? "min-h-56 rounded-md border bg-background p-3 ring-2 ring-primary/50"
                    : "min-h-56 rounded-md border bg-background p-3"
                }
              >
                <div className="flex min-h-48 flex-wrap items-start gap-2">
                  {formulaTokens.length === 0 && (
                    <p className="text-muted-foreground text-sm">
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
                      <Badge
                        key={`${token}-${index}`}
                        variant={isInputToken ? "secondary" : "outline"}
                        className={`gap-2 ${tokenClass}`}
                      >
                        <span className={!isInputToken ? "font-mono" : ""}>
                          {token}
                        </span>
                        <button
                          type="button"
                          className="text-xs"
                          onClick={() => removeTokenAtIndex(index)}
                          aria-label={`Remove ${token}`}
                        >
                          x
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Preview</Label>
              <Input
                readOnly
                value={formula}
                placeholder="Formula preview"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Selected Inputs</Label>
          <div className="flex min-h-10 flex-wrap gap-2 rounded-md border border-dashed bg-muted/20 p-2.5">
            {selectedInputs.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No inputs selected yet.
              </p>
            )}
            {selectedInputs.map((input) => (
              <Badge
                key={input.id}
                variant="secondary"
                className="gap-2"
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
          <p className="text-muted-foreground text-xs sm:mr-auto">
            Save after verifying selected inputs and formula syntax.
          </p>
          <Button
            type="button"
            disabled={isSaving || !selectedKpiId}
            onClick={handleSave}
            className="w-full sm:w-auto"
          >
            {isSaving ? "Saving..." : "Save Formula"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
