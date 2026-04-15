"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";

type InputOption = {
  id: number;
  name: string;
  variableName: string | null;
  unit: string | null;
};

type FormState = {
  title: string;
  formulaExpression: string;
  businessContext: string;
  description: string;
  selectedInputDefinitionIds: number[];
};

const INITIAL_STATE: FormState = {
  title: "",
  formulaExpression: "",
  businessContext: "",
  description: "",
  selectedInputDefinitionIds: [],
};

const FORMULA_OPERATORS = ["+", "-", "*", "/", "(", ")"];

export function CustomKpiRequestForm(props: {
  inputOptions: InputOption[];
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
    if (form.businessContext.trim().length === 0) {
      next.businessContext = "Business context is required.";
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
        body: JSON.stringify(form),
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
      <div className="space-y-1">
        <label
          className="text-sm font-medium"
          htmlFor="custom-kpi-inputs-search"
        >
          Input definitions
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
                    {option.variableName ? ` [${option.variableName}]` : ""}
                    {option.unit ? ` (${option.unit})` : ""}
                  </span>
                </label>
              );
            })
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Choose one or more input definitions to use as formula inputs.
        </p>
        <p className="text-xs text-muted-foreground">
          Selected: {form.selectedInputDefinitionIds.length}
        </p>
        {selectedInputOptions.length > 0 ? (
          <div className="space-y-1 rounded-md border bg-muted/20 p-2">
            <p className="text-xs font-medium">Selected inputs</p>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              {selectedInputOptions.map((option) => (
                <li key={option.id}>
                  {option.name}
                  {option.variableName ? ` [${option.variableName}]` : ""}
                  {option.unit ? ` (${option.unit})` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="space-y-1">
        <label
          className="text-sm font-medium"
          htmlFor="custom-kpi-title"
        >
          KPI title
        </label>
        <input
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

      <div className="space-y-1">
        <label
          className="text-sm font-medium"
          htmlFor="custom-kpi-formula"
        >
          Formula expression
        </label>
        <textarea
          ref={formulaTextareaRef}
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
            submitAttempted && errors.formulaExpression ? true : false
          }
          aria-describedby={
            submitAttempted && errors.formulaExpression
              ? "custom-kpi-formula-error"
              : undefined
          }
        />
        <div className="space-y-2 rounded-md border bg-muted/20 p-2">
          <p className="text-xs font-medium">Simple formula builder</p>
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
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Insert selected inputs
            </p>
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
                      insertFormulaTokenAtCursor(
                        option.variableName ?? option.name,
                      )
                    }
                  >
                    {option.variableName ?? option.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {submitAttempted && errors.formulaExpression ? (
          <p
            id="custom-kpi-formula-error"
            className="text-xs text-destructive"
          >
            {errors.formulaExpression}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label
          className="text-sm font-medium"
          htmlFor="custom-kpi-business-context"
        >
          Business context
        </Label>
        <Textarea
          id="custom-kpi-business-context"
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={form.businessContext}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              businessContext: event.target.value,
            }))
          }
          aria-invalid={
            submitAttempted && errors.businessContext ? true : false
          }
          aria-describedby={
            submitAttempted && errors.businessContext
              ? "custom-kpi-business-context-error"
              : undefined
          }
        />
        {submitAttempted && errors.businessContext ? (
          <p
            id="custom-kpi-business-context-error"
            className="text-xs text-destructive"
          >
            {errors.businessContext}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label
          className="text-sm font-medium"
          htmlFor="custom-kpi-description"
        >
          Description (optional)
        </Label>
        <Textarea
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

      <Button
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
