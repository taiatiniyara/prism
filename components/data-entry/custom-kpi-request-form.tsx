"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { FieldGroup } from "../ui/field-group";
import BorderedStack from "../ui/bordered-stack";
import BorderedForm from "../ui/bordered-form";
import BorderedGrid from "../ui/bordered-grid";
import { evaluateKpiFormula } from "@/app/data-entry/kpi-worker/evaluator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type InputOption = {
  id: number;
  name: string;
  variableName: string | null;
  unit: string | null;
  category: string | null;
  subcategory: string | null;
};

type UnitOption = {
  id: number;
  name: string;
};

type ProposedUnitDraft = {
  name: string;
  description: string;
};

type ProposedInputDraft = {
  name: string;
  description: string;
  unit: string;
  dataType: string;
};

type FormState = {
  formulaExpression: string;
  proposedUnits: ProposedUnitDraft[];
  proposedInputs: ProposedInputDraft[];
  selectedInputDefinitionIds: number[];
};

const INITIAL_STATE: FormState = {
  formulaExpression: "",
  proposedUnits: [],
  proposedInputs: [],
  selectedInputDefinitionIds: [],
};

const FORMULA_OPERATORS = ["+", "-", "*", "/", "(", ")"];

export function CustomKpiRequestForm(props: {
  inputOptions: InputOption[];
  unitOptions: UnitOption[];
  dataTypeOptions: UnitOption[];
  onSubmitted?: () => void | Promise<void>;
}) {
  const formulaTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [inputSearch, setInputSearch] = useState("");
  const [selectedInputCategory, setSelectedInputCategory] =
    useState<string>("all");
  const [selectedInputSubcategory, setSelectedInputSubcategory] =
    useState<string>("all");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isProposedUnitsDialogOpen, setIsProposedUnitsDialogOpen] =
    useState(false);
  const [isProposedInputsDialogOpen, setIsProposedInputsDialogOpen] =
    useState(false);
  const [isExpectedResultConfirmed, setIsExpectedResultConfirmed] =
    useState(false);
  const [sampleInputValues, setSampleInputValues] = useState<
    Record<string, string>
  >({});
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    formulaExpression?: string;
    unitId?: string;
  }>({});

  const filteredInputOptions = useMemo(() => {
    const term = inputSearch.trim().toLowerCase();
    return props.inputOptions.filter((option) => {
      const variableName = option.variableName?.toLowerCase() ?? "";
      const matchesCategory =
        selectedInputCategory === "all" ||
        option.category === selectedInputCategory;
      const matchesSubcategory =
        selectedInputSubcategory === "all" ||
        option.subcategory === selectedInputSubcategory;
      const matchesSearch =
        term.length === 0 ||
        option.name.toLowerCase().includes(term) ||
        variableName.includes(term);

      return matchesCategory && matchesSubcategory && matchesSearch;
    });
  }, [
    inputSearch,
    props.inputOptions,
    selectedInputCategory,
    selectedInputSubcategory,
  ]);

  const availableInputCategories = useMemo(
    () =>
      [...new Set(props.inputOptions.map((option) => option.category))]
        .filter((value): value is string => !!value)
        .sort((a, b) => a.localeCompare(b)),
    [props.inputOptions],
  );

  const availableInputSubcategories = useMemo(() => {
    const scoped =
      selectedInputCategory === "all"
        ? props.inputOptions
        : props.inputOptions.filter(
            (option) => option.category === selectedInputCategory,
          );

    return [...new Set(scoped.map((option) => option.subcategory))]
      .filter((value): value is string => !!value)
      .sort((a, b) => a.localeCompare(b));
  }, [props.inputOptions, selectedInputCategory]);

  const selectedInputOptions = useMemo(() => {
    const selectedSet = new Set(form.selectedInputDefinitionIds);
    return props.inputOptions.filter((option) => selectedSet.has(option.id));
  }, [form.selectedInputDefinitionIds, props.inputOptions]);

  const unitNameById = useMemo(
    () => new Map(props.unitOptions.map((option) => [option.id, option.name])),
    [props.unitOptions],
  );

  const dataTypeNameById = useMemo(
    () =>
      new Map(props.dataTypeOptions.map((option) => [option.id, option.name])),
    [props.dataTypeOptions],
  );

  const selectedInputByToken = useMemo(() => {
    const map = new Map<string, InputOption>();
    for (const option of selectedInputOptions) {
      map.set(option.name, option);
      if (option.variableName) {
        map.set(option.variableName, option);
      }
    }
    return map;
  }, [selectedInputOptions]);

  const formulaInputTokens = useMemo(() => {
    const identifiers =
      form.formulaExpression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
    const seen = new Set<string>();

    return identifiers.filter((token) => {
      if (seen.has(token)) {
        return false;
      }
      seen.add(token);
      return selectedInputByToken.has(token);
    });
  }, [form.formulaExpression, selectedInputByToken]);

  const formulaPreview = useMemo(() => {
    const formulaExpression = form.formulaExpression.trim();

    if (formulaExpression.length === 0) {
      return {
        status: "idle" as const,
        message: "Enter a formula to preview calculation.",
      };
    }

    if (formulaInputTokens.length === 0) {
      return {
        status: "idle" as const,
        message:
          "Select and insert at least one input token to test this formula.",
      };
    }

    const variables: Record<string, number> = {};
    for (const token of formulaInputTokens) {
      const raw = (sampleInputValues[token] ?? "").trim();
      if (raw.length === 0) {
        return {
          status: "idle" as const,
          message: `Enter a sample value for '${token}' to calculate preview.`,
        };
      }

      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        return {
          status: "error" as const,
          message: `Sample value for '${token}' must be numeric.`,
        };
      }

      variables[token] = parsed;
    }

    const evaluated = evaluateKpiFormula(formulaExpression, variables);
    if (evaluated.status === "error") {
      return {
        status: "error" as const,
        message: evaluated.failureReason ?? "Unable to evaluate formula.",
      };
    }

    const numericResult = Number(evaluated.value);
    if (!Number.isFinite(numericResult)) {
      return {
        status: "error" as const,
        message: "Formula result is invalid.",
      };
    }

    return {
      status: "ok" as const,
      value: numericResult,
      message: "Preview result calculated from sample values.",
    };
  }, [sampleInputValues, form.formulaExpression, formulaInputTokens]);

  const insertFormulaTokenAtCursor = (token: string) => {
    const textarea = formulaTextareaRef.current;
    const selectionStart = textarea?.selectionStart;
    const selectionEnd = textarea?.selectionEnd;

    setForm((current) => {
      const start = selectionStart ?? current.formulaExpression.length;
      const end = selectionEnd ?? current.formulaExpression.length;
      const before = current.formulaExpression.slice(0, start);
      const after = current.formulaExpression.slice(end);
      const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
      const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
      const insertion = `${needsLeadingSpace ? " " : ""}${token}${needsTrailingSpace ? " " : ""}`;
      const nextExpression = `${before}${insertion}${after}`;
      const nextCursorPosition = before.length + insertion.length;

      // Restore cursor after React applies state update.
      setTimeout(() => {
        const target = formulaTextareaRef.current;
        if (!target) {
          return;
        }
        target.focus();
        target.setSelectionRange(nextCursorPosition, nextCursorPosition);
      }, 0);

      return {
        ...current,
        formulaExpression: nextExpression,
      };
    });
  };

  const addProposedInput = (prefillName?: string) => {
    const nextName = prefillName?.trim() ?? "";
    setForm((current) => ({
      ...current,
      proposedInputs: [
        ...current.proposedInputs,
        { name: nextName, description: "", unit: "", dataType: "" },
      ],
    }));
  };

  const addProposedUnit = (prefillName?: string) => {
    const nextName = prefillName?.trim() ?? "";
    setForm((current) => ({
      ...current,
      proposedUnits: [
        ...current.proposedUnits,
        { name: nextName, description: "" },
      ],
    }));
  };

  const openProposedUnitsDialog = () => {
    if (form.proposedUnits.length === 0) {
      addProposedUnit();
    }

    setIsProposedUnitsDialogOpen(true);
  };

  const openProposedInputsDialog = (prefillName?: string) => {
    const trimmedPrefill = prefillName?.trim() ?? "";

    if (trimmedPrefill.length > 0) {
      addProposedInput(trimmedPrefill);
    } else if (form.proposedInputs.length === 0) {
      addProposedInput();
    }

    setIsProposedInputsDialogOpen(true);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const formulaExpression = String(
      formData.get("formulaExpression") ?? "",
    ).trim();
    const description = String(formData.get("description") ?? "").trim();
    const unitIdRaw = String(formData.get("unitId") ?? "").trim();
    const parsedUnitId = Number(unitIdRaw);

    setSubmitAttempted(true);
    setSuccessMessage(null);
    setSubmitError(null);
    const nextErrors: {
      title?: string;
      formulaExpression?: string;
      unitId?: string;
    } = {};

    if (title.length === 0) {
      nextErrors.title = "Title is required.";
    }

    if (formulaExpression.length === 0) {
      nextErrors.formulaExpression = "Formula expression is required.";
    }

    if (!Number.isInteger(parsedUnitId) || parsedUnitId <= 0) {
      nextErrors.unitId = "Unit is required.";
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/data-entry/custom-kpi/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          formulaExpression,
          description,
          unitId: parsedUnitId,
          selectedInputDefinitionIds: form.selectedInputDefinitionIds,
          proposedUnits: form.proposedUnits
            .map((item) => ({
              name: item.name.trim(),
              description: item.description.trim() || null,
            }))
            .filter((item) => item.name.length > 0),
          proposedInputs: form.proposedInputs
            .map((item) => ({
              name: item.name.trim(),
              description: item.description.trim() || null,
              unit: unitNameById.get(Number(item.unit)) ?? item.unit.trim(),
              dataType:
                dataTypeNameById.get(Number(item.dataType)) ??
                item.dataType.trim(),
            }))
            .filter(
              (item) =>
                item.name.length > 0 &&
                item.unit.length > 0 &&
                item.dataType.length > 0,
            ),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        setSubmitError(payload.message ?? "Unable to submit request.");
        return;
      }

      setForm(INITIAL_STATE);
      setSelectedUnitId("");
      setSampleInputValues({});
      setIsExpectedResultConfirmed(false);
      setSubmitAttempted(false);
      setFieldErrors({});
      setSuccessMessage("Custom KPI request submitted successfully.");
      event.currentTarget.reset();

      try {
        await props.onSubmitted?.();
      } catch (callbackError) {
        console.error(
          "Custom KPI request submitted but post-submit callback failed",
          {
            error:
              callbackError instanceof Error
                ? callbackError.message
                : "Unknown error",
          },
        );
      }
    } catch {
      setSubmitError("Unable to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BorderedForm
      className="space-y-3"
      onSubmit={onSubmit}
      noValidate
    >
      <div className="flex gap-4">
        {/* Title is the only required field, but we want to surface all validation errors on submit, so it comes first in the form. */}
        <FieldGroup
          label="KPI Name"
          htmlFor="custom-kpi-title"
          containerClassName="space-y-1 w-[50%]"
          error={submitAttempted ? fieldErrors.title : undefined}
          errorId="custom-kpi-title-error"
        >
          <Input
            required
            name="title"
            id="custom-kpi-title"
            className="w-full rounded-md border px-3 py-2 text-sm"
            aria-invalid={submitAttempted && fieldErrors.title ? true : false}
            aria-describedby={
              submitAttempted && fieldErrors.title
                ? "custom-kpi-title-error"
                : undefined
            }
          />
        </FieldGroup>

        <div className="space-y-1 w-[50%]">
          <div className="flex items-center justify-between gap-2">
            <Label
              className="text-sm font-medium"
              htmlFor="custom-kpi-unit-id"
            >
              Unit
            </Label>
            <Button
              type="button"
              variant="outline"
              className="h-7 border-amber-300 bg-amber-50 px-2 text-xs text-amber-800"
              onClick={openProposedUnitsDialog}
              title="Open proposed unit form"
            >
              + Propose Unit
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            If you cannot find an existing unit, click + Propose Unit.
          </p>

          <Select
            name="unitId"
            value={selectedUnitId}
            onValueChange={setSelectedUnitId}
          >
            <SelectTrigger
              className="w-full shadow"
              id="custom-kpi-unit-id"
              aria-invalid={
                submitAttempted && fieldErrors.unitId ? true : false
              }
              aria-describedby={
                submitAttempted && fieldErrors.unitId
                  ? "custom-kpi-unit-id-error"
                  : undefined
              }
            >
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              {props.unitOptions.map((unitOption) => (
                <SelectItem
                  key={unitOption.id}
                  value={String(unitOption.id)}
                >
                  {unitOption.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {submitAttempted && fieldErrors.unitId ? (
            <p
              id="custom-kpi-unit-id-error"
              className="text-xs text-destructive"
            >
              {fieldErrors.unitId}
            </p>
          ) : null}
        </div>
      </div>

      {/* Description is optional, so it comes before required fields for better UX. */}
      <FieldGroup
        label="Description of Use"
        htmlFor="custom-kpi-description"
        containerClassName="space-y-1 w-[50%]"
      >
        <Textarea
          placeholder="Enter description"
          name="description"
          required
          id="custom-kpi-description"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </FieldGroup>

      {/* Input selection and formula builder are the most complex parts of the form, so they come before business context to avoid overwhelming users right away. */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label
            className="text-sm font-medium"
            htmlFor="custom-kpi-inputs-search"
          >
            Select Inputs
          </label>
          <Button
            type="button"
            variant="outline"
            className="h-7 border-amber-300 bg-amber-50 px-2 text-xs text-amber-800"
            onClick={() => openProposedInputsDialog()}
            title="Open proposed input form"
          >
            + Propose Input
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          If you cannot find an existing input, click + Propose Input.
        </p>
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px]">
          <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
            Found in list: select checkbox
          </span>
          <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700">
            Not found: propose a new input
          </span>
        </div>
        <input
          id="custom-kpi-inputs-search"
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Search input definitions"
          value={inputSearch}
          onChange={(event) => setInputSearch(event.target.value)}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            value={selectedInputCategory}
            onValueChange={(value) => {
              setSelectedInputCategory(value);
              setSelectedInputSubcategory("all");
            }}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {availableInputCategories.map((category) => (
                <SelectItem
                  key={`input-category-${category}`}
                  value={category}
                >
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedInputSubcategory}
            onValueChange={setSelectedInputSubcategory}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder="Filter by subcategory" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subcategories</SelectItem>
              {availableInputSubcategories.map((subcategory) => (
                <SelectItem
                  key={`input-subcategory-${subcategory}`}
                  value={subcategory}
                >
                  {subcategory}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
          {filteredInputOptions.length === 0 ? (
            <div className="space-y-2">
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                No input definitions match your search.
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-7 border-amber-300 bg-amber-50 px-2 text-xs text-amber-800"
                onClick={() => openProposedInputsDialog(inputSearch)}
              >
                {inputSearch.trim()
                  ? `Propose '${inputSearch.trim()}' as new input`
                  : "Propose a new input"}
              </Button>
            </div>
          ) : (
            filteredInputOptions.map((option) => {
              const isChecked = form.selectedInputDefinitionIds.includes(
                option.id,
              );

              return (
                <label
                  key={option.id}
                  className="flex items-center gap-2 text-sm"
                  htmlFor={`custom-kpi-input-${option.id}`}
                >
                  <input
                    id={`custom-kpi-input-${option.id}`}
                    type="checkbox"
                    checked={isChecked}
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        selectedInputDefinitionIds: event.target.checked
                          ? [...current.selectedInputDefinitionIds, option.id]
                          : current.selectedInputDefinitionIds.filter(
                              (id) => id !== option.id,
                            ),
                      }));
                    }}
                  />
                  <span>
                    {option.name}
                    {option.unit ? ` (${option.unit})` : ""}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      <Dialog
        open={isProposedUnitsDialogOpen}
        onOpenChange={setIsProposedUnitsDialogOpen}
      >
        <DialogContent className="sm:max-w-6xl!">
          <DialogHeader>
            <DialogTitle>Proposed Units</DialogTitle>
            <DialogDescription>
              Use this popup when the required unit is not available in the unit
              selector.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="h-8 px-2 text-xs"
              onClick={() => addProposedUnit()}
            >
              Add Unit Proposal
            </Button>

            {form.proposedUnits.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Add only when you need a new unit not in the managed list.
              </p>
            ) : null}

            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {form.proposedUnits.map((item, index) => (
                <BorderedGrid
                  key={`proposed-unit-${index}`}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  <Input
                    placeholder="Unit name"
                    value={item.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        proposedUnits: current.proposedUnits.map(
                          (unit, unitIndex) =>
                            unitIndex === index
                              ? { ...unit, name: event.target.value }
                              : unit,
                        ),
                      }))
                    }
                  />
                  <Input
                    placeholder="Unit description"
                    value={item.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        proposedUnits: current.proposedUnits.map(
                          (unit, unitIndex) =>
                            unitIndex === index
                              ? { ...unit, description: event.target.value }
                              : unit,
                        ),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-0 text-xs text-destructive sm:col-span-2"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        proposedUnits: current.proposedUnits.filter(
                          (_, unitIndex) => unitIndex !== index,
                        ),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </BorderedGrid>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isProposedInputsDialogOpen}
        onOpenChange={setIsProposedInputsDialogOpen}
      >
        <DialogContent className="sm:max-w-6xl!">
          <DialogHeader>
            <DialogTitle>Proposed Inputs</DialogTitle>
            <DialogDescription>
              Use this popup when an input is not available in existing inputs.
              Proposed entries are submitted for DEV review.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="h-8 px-2 text-xs"
              onClick={() => addProposedInput()}
            >
              Add Input Proposal
            </Button>

            {form.proposedInputs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Add only when you need a new input definition.
              </p>
            ) : null}

            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {form.proposedInputs.map((item, index) => (
                <BorderedGrid
                  key={`proposed-input-${index}`}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  <Input
                    placeholder="Input name"
                    value={item.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        proposedInputs: current.proposedInputs.map(
                          (input, inputIndex) =>
                            inputIndex === index
                              ? { ...input, name: event.target.value }
                              : input,
                        ),
                      }))
                    }
                  />
                  <Input
                    placeholder="Input description"
                    value={item.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        proposedInputs: current.proposedInputs.map(
                          (input, inputIndex) =>
                            inputIndex === index
                              ? { ...input, description: event.target.value }
                              : input,
                        ),
                      }))
                    }
                  />
                  <Select
                    value={item.unit}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        proposedInputs: current.proposedInputs.map(
                          (input, inputIndex) =>
                            inputIndex === index
                              ? { ...input, unit: value }
                              : input,
                        ),
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {props.unitOptions.map((option) => (
                        <SelectItem
                          key={`proposed-input-unit-${option.id}`}
                          value={String(option.id)}
                        >
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={item.dataType}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        proposedInputs: current.proposedInputs.map(
                          (input, inputIndex) =>
                            inputIndex === index
                              ? { ...input, dataType: value }
                              : input,
                        ),
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Select data type" />
                    </SelectTrigger>
                    <SelectContent>
                      {props.dataTypeOptions.map((option) => (
                        <SelectItem
                          key={`proposed-input-data-type-${option.id}`}
                          value={String(option.id)}
                        >
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-0 text-xs text-destructive sm:col-span-2"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        proposedInputs: current.proposedInputs.filter(
                          (_, inputIndex) => inputIndex !== index,
                        ),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </BorderedGrid>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="space-y-2">
        <label className="text-sm font-medium">Selected Inputs</label>
        <p className="text-xs text-muted-foreground">
          Click the Insert token button beside an input to add it into the
          formula at the current cursor position.
        </p>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-700">
            Blue: insert token action
          </span>
          <span className="rounded border border-lime-200 bg-lime-50 px-2 py-0.5 text-lime-700">
            lime: used in formula
          </span>
          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
            Amber: needs sample value
          </span>
        </div>
        {selectedInputOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Select input definitions to enable one-click insert.
          </p>
        ) : (
          <div className="space-y-2">
            {selectedInputOptions.map((option) => {
              const token = option.variableName ?? option.name;
              const isUsedInFormula = formulaInputTokens.includes(token);
              const hasSampleValue =
                (sampleInputValues[token] ?? "").trim().length > 0;

              return (
                <div
                  key={option.id}
                  className={`rounded-md border p-2 flex gap-4 ${
                    isUsedInFormula
                      ? "border-lime-200 bg-lime-50/40"
                      : "border-border bg-background"
                  }`}
                >
                  <div className="space-y-1 w-[65%]">
                    <button
                      type="button"
                      className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800"
                      onClick={() => insertFormulaTokenAtCursor(token)}
                      title={`Insert ${token} into formula`}
                    >
                      Insert token: {token}
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="text-muted-foreground">
                        {option.name}
                      </span>
                      {option.unit ? (
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-700">
                          {option.unit}
                        </span>
                      ) : null}
                      <span
                        className={`rounded border px-1.5 py-0.5 ${
                          isUsedInFormula
                            ? "border-lime-200 bg-lime-50 text-lime-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {isUsedInFormula ? "Used in formula" : "Not in formula"}
                      </span>
                    </div>
                  </div>

                  <FieldGroup
                    labelClassName="text-xs text-slate-500"
                    label="Sample value"
                    htmlFor={`custom-kpi-preview-${option.id}`}
                    containerClassName="space-y-1 w-[35%]"
                  >
                    <Input
                      id={`custom-kpi-preview-${option.id}`}
                      type="number"
                      step="any"
                      value={sampleInputValues[token] ?? ""}
                      onChange={(event) =>
                        setSampleInputValues((current) => ({
                          ...current,
                          [token]: event.target.value,
                        }))
                      }
                      placeholder="Enter sample value"
                      className={`h-8 ${
                        hasSampleValue
                          ? "border-lime-300 bg-lime-50/60"
                          : "border-amber-300 bg-amber-50/50"
                      }`}
                    />
                  </FieldGroup>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <FieldGroup
        label="Formula Builder"
        htmlFor="custom-kpi-formula"
        error={submitAttempted ? fieldErrors.formulaExpression : undefined}
        errorId="custom-kpi-formula-error"
      >
        <div className="mt-4 flex gap-4">
          <div className="space-y-2 w-[65%]">
            <div className="flex gap-3">
              <div className="flex flex-wrap gap-2">
                {FORMULA_OPERATORS.map((operator) => (
                  <button
                    key={operator}
                    type="button"
                    className="rounded border bg-background px-2 py-1 text-xs"
                    onClick={() => insertFormulaTokenAtCursor(operator)}
                  >
                    {operator}
                  </button>
                ))}
                <button
                  type="button"
                  className="rounded border bg-background px-2 py-1 text-xs"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      formulaExpression: "",
                    }))
                  }
                >
                  Clear
                </button>
              </div>
            </div>

            <textarea
              ref={formulaTextareaRef}
              name="formulaExpression"
              id="custom-kpi-formula"
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={form.formulaExpression}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  formulaExpression: event.target.value,
                }))
              }
              aria-invalid={
                submitAttempted && fieldErrors.formulaExpression ? true : false
              }
              aria-describedby={
                submitAttempted && fieldErrors.formulaExpression
                  ? "custom-kpi-formula-error"
                  : undefined
              }
            />
          </div>

          <BorderedStack className="space-y-2 p-3 w-[35%]">
            <p className="text-xs font-medium">KPI Result</p>
            <p className="mt-1 text-sm font-semibold">
              {formulaPreview.status === "ok"
                ? `${formulaPreview.value.toLocaleString(undefined, { maximumFractionDigits: 4 })}${selectedUnitId ? ` ${props.unitOptions.find((item) => String(item.id) === selectedUnitId)?.name ?? ""}` : ""}`
                : "--"}
            </p>
            <p
              className={`mt-1 text-xs ${
                formulaPreview.status === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {formulaPreview.message}
            </p>

            <label
              htmlFor="custom-kpi-expected-result-check"
              className="mt-1 flex cursor-pointer items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-900"
            >
              <input
                id="custom-kpi-expected-result-check"
                type="checkbox"
                checked={isExpectedResultConfirmed}
                onChange={(event) =>
                  setIsExpectedResultConfirmed(event.target.checked)
                }
                disabled={formulaPreview.status !== "ok"}
                className="mt-0.5"
              />
              <span>I confirm this KPI result matches what I expect.</span>
            </label>
          </BorderedStack>
        </div>
      </FieldGroup>

      <Button
        className="mt-6"
        type="submit"
        disabled={
          submitting ||
          !isExpectedResultConfirmed ||
          formulaPreview.status !== "ok"
        }
      >
        {submitting ? "Submitting..." : "Submit for review"}
      </Button>

      <div
        aria-live="polite"
        className="min-h-5"
      >
        {successMessage ? (
          <p className="text-xs text-lime-700">{successMessage}</p>
        ) : null}
      </div>

      <div
        aria-live="assertive"
        className="min-h-5"
      >
        {submitError ? (
          <p className="text-xs text-destructive">{submitError}</p>
        ) : null}
      </div>
    </BorderedForm>
  );
}
