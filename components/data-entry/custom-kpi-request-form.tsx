"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

type InputOption = {
  id: number;
  name: string;
  variableName: string | null;
  unit: string | null;
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
  title: string;
  formulaExpression: string;
  description: string;
  unitId: string;
  proposedUnits: ProposedUnitDraft[];
  proposedInputs: ProposedInputDraft[];
  selectedInputDefinitionIds: number[];
};

const INITIAL_STATE: FormState = {
  title: "",
  formulaExpression: "",
  description: "",
  unitId: "",
  proposedUnits: [],
  proposedInputs: [],
  selectedInputDefinitionIds: [],
};

const FORMULA_OPERATORS = ["+", "-", "*", "/", "(", ")"];

export function CustomKpiRequestForm(props: {
  inputOptions: InputOption[];
  unitOptions: UnitOption[];
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const formulaTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [inputSearch, setInputSearch] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const filteredInputOptions = useMemo(() => {
    const term = inputSearch.trim().toLowerCase();
    if (!term) {
      return props.inputOptions;
    }

    return props.inputOptions.filter((option) => {
      const variableName = option.variableName?.toLowerCase() ?? "";
      return (
        option.name.toLowerCase().includes(term) || variableName.includes(term)
      );
    });
  }, [inputSearch, props.inputOptions]);

  const selectedInputOptions = useMemo(() => {
    const selectedSet = new Set(form.selectedInputDefinitionIds);
    return props.inputOptions.filter((option) => selectedSet.has(option.id));
  }, [form.selectedInputDefinitionIds, props.inputOptions]);

  const errors = useMemo(() => {
    const next: Partial<Record<keyof FormState, string>> = {};

    if (form.title.trim().length === 0) {
      next.title = "Title is required.";
    }
    if (form.formulaExpression.trim().length === 0) {
      next.formulaExpression = "Formula expression is required.";
    }
    if (!Number.isInteger(Number(form.unitId)) || Number(form.unitId) <= 0) {
      next.unitId = "Unit is required.";
    }

    return next;
  }, [form]);

  const hasErrors = Object.keys(errors).length > 0;

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

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setSuccessMessage(null);
    setSubmitError(null);

    if (hasErrors) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/data-entry/custom-kpi/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          unitId: Number(form.unitId),
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
              unit: item.unit.trim(),
              dataType: item.dataType.trim(),
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
      setSubmitAttempted(false);
      setSuccessMessage("Custom KPI request submitted successfully.");
      router.refresh();
      props.onSubmitted?.();
    } catch {
      setSubmitError("Unable to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="space-y-3 rounded-md border p-4"
      onSubmit={onSubmit}
      noValidate
    >
      <div className="flex gap-4">
        {/* Title is the only required field, but we want to surface all validation errors on submit, so it comes first in the form. */}
        <div className="space-y-1 w-[50%]">
          <Label
            className="text-sm font-medium"
            htmlFor="custom-kpi-title"
          >
            KPI Name
          </Label>
          <Input
            required
            name="KPI Name"
            id="custom-kpi-title"
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
            aria-invalid={submitAttempted && errors.title ? true : false}
            aria-describedby={
              submitAttempted && errors.title
                ? "custom-kpi-title-error"
                : undefined
            }
          />
          {submitAttempted && errors.title ? (
            <p
              id="custom-kpi-title-error"
              className="text-xs text-destructive"
            >
              {errors.title}
            </p>
          ) : null}
        </div>

        <div className="space-y-1 w-[50%]">
          <Label
            className="text-sm font-medium"
            htmlFor="custom-kpi-unit-id"
          >
            Unit
          </Label>
          <Select
            value={form.unitId}
            onValueChange={(value) =>
              setForm((current) => ({
                ...current,
                unitId: value,
              }))
            }
          >
            <SelectTrigger
              className="w-full shadow"
              id="custom-kpi-unit-id"
              aria-invalid={submitAttempted && errors.unitId ? true : false}
              aria-describedby={
                submitAttempted && errors.unitId
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
          {submitAttempted && errors.unitId ? (
            <p
              id="custom-kpi-unit-id-error"
              className="text-xs text-destructive"
            >
              {errors.unitId}
            </p>
          ) : null}
        </div>
      </div>

      {/* Description is optional, so it comes before required fields for better UX. */}
      <div className="space-y-1 w-[50%]">
        <Label
          className="text-sm font-medium"
          htmlFor="custom-kpi-description"
        >
          Description of Use
        </Label>
        <Textarea
          placeholder="Enter description"
          name="Description"
          required
          id="custom-kpi-description"
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
      </div>

      <div className="space-y-2 rounded border p-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Proposed Units</Label>
          <Button
            type="button"
            variant="outline"
            className="h-8 px-2 text-xs"
            onClick={() =>
              setForm((current) => ({
                ...current,
                proposedUnits: [
                  ...current.proposedUnits,
                  { name: "", description: "" },
                ],
              }))
            }
          >
            Add Unit Proposal
          </Button>
        </div>
        {form.proposedUnits.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Add only when you need a new unit not in the managed list.
          </p>
        ) : null}
        {form.proposedUnits.map((item, index) => (
          <div
            key={`proposed-unit-${index}`}
            className="grid gap-2 rounded border p-2 sm:grid-cols-2"
          >
            <Input
              placeholder="Unit name"
              value={item.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  proposedUnits: current.proposedUnits.map((unit, unitIndex) =>
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
                  proposedUnits: current.proposedUnits.map((unit, unitIndex) =>
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
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded border p-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Proposed Inputs</Label>
          <Button
            type="button"
            variant="outline"
            className="h-8 px-2 text-xs"
            onClick={() =>
              setForm((current) => ({
                ...current,
                proposedInputs: [
                  ...current.proposedInputs,
                  { name: "", description: "", unit: "", dataType: "" },
                ],
              }))
            }
          >
            Add Input Proposal
          </Button>
        </div>
        {form.proposedInputs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Add only when you need a new input definition.
          </p>
        ) : null}
        {form.proposedInputs.map((item, index) => (
          <div
            key={`proposed-input-${index}`}
            className="grid gap-2 rounded border p-2 sm:grid-cols-2"
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
            <Input
              placeholder="Unit name"
              value={item.unit}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  proposedInputs: current.proposedInputs.map(
                    (input, inputIndex) =>
                      inputIndex === index
                        ? { ...input, unit: event.target.value }
                        : input,
                  ),
                }))
              }
            />
            <Input
              placeholder="Data type"
              value={item.dataType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  proposedInputs: current.proposedInputs.map(
                    (input, inputIndex) =>
                      inputIndex === index
                        ? { ...input, dataType: event.target.value }
                        : input,
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
                  proposedInputs: current.proposedInputs.filter(
                    (_, inputIndex) => inputIndex !== index,
                  ),
                }))
              }
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      {/* Input selection and formula builder are the most complex parts of the form, so they come before business context to avoid overwhelming users right away. */}
      <div className="space-y-1">
        <label
          className="text-sm font-medium"
          htmlFor="custom-kpi-inputs-search"
        >
          Select Inputs
        </label>
        <input
          id="custom-kpi-inputs-search"
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Search input definitions"
          value={inputSearch}
          onChange={(event) => setInputSearch(event.target.value)}
        />
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
          {filteredInputOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No input definitions match your search.
            </p>
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

      <div className="space-y-2">
        <label className="text-sm font-medium">Selected Inputs</label>
        {selectedInputOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Select input definitions to enable one-click insert.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedInputOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className="rounded border bg-background px-2 py-1 text-xs"
                onClick={() =>
                  insertFormulaTokenAtCursor(option.variableName ?? option.name)
                }
              >
                {option.variableName ?? option.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="flex gap-3">
          <label
            className="text-sm font-medium"
            htmlFor="custom-kpi-formula"
          >
            Formula Builder
          </label>
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
                setForm((current) => ({ ...current, formulaExpression: "" }))
              }
            >
              Clear
            </button>
          </div>
        </div>

        <textarea
          ref={formulaTextareaRef}
          id="custom-kpi-formula"
          className="w-full mt-2 rounded-md border px-3 py-2 text-sm"
          value={form.formulaExpression}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              formulaExpression: event.target.value,
            }))
          }
          aria-invalid={
            submitAttempted && errors.formulaExpression ? true : false
          }
          aria-describedby={
            submitAttempted && errors.formulaExpression
              ? "custom-kpi-formula-error"
              : undefined
          }
        />
      </div>

      {submitAttempted && errors.formulaExpression ? (
        <p
          id="custom-kpi-formula-error"
          className="text-xs text-destructive"
        >
          {errors.formulaExpression}
        </p>
      ) : null}

      <Button
        className="mt-6"
        type="submit"
        disabled={submitting}
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
    </form>
  );
}
