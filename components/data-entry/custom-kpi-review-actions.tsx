"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type DecisionType = "APPROVE" | "REJECT" | "REPLACE";

type CategoryOption = {
  id: number;
  name: string;
};

type SubcategoryOption = {
  id: number;
  name: string;
  categoryId: number | null;
};

type CustomKpiReviewActionsProps = {
  requestId: string;
  latestDecisionId: string | null;
  canPromote: boolean;
  categoryOptions: CategoryOption[];
  subcategoryOptions: SubcategoryOption[];
  existingInputOptions: Array<{ id: number; name: string }>;
  existingUnitOptions: Array<{ id: number; name: string }>;
  dataTypeOptions: Array<{ id: number; name: string }>;
  proposedUnits: Array<{ name: string; description?: string | null }>;
  proposedInputs: Array<{
    name: string;
    description?: string | null;
    unit: string;
    dataType: string;
  }>;
};

export function CustomKpiReviewActions({
  requestId,
  latestDecisionId,
  canPromote,
  categoryOptions,
  subcategoryOptions,
  existingInputOptions,
  existingUnitOptions,
  dataTypeOptions,
  proposedUnits,
  proposedInputs,
}: CustomKpiReviewActionsProps) {
  const router = useRouter();
  const [decisionType, setDecisionType] = useState<DecisionType>("APPROVE");
  const [rationale, setRationale] = useState("");
  const [replacementKpiId, setReplacementKpiId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [override, setOverride] = useState(false);
  const [unitResolutions, setUnitResolutions] = useState(
    proposedUnits.map((item) => ({
      name: item.name,
      description: item.description ?? "",
      existingUnitId: "",
    })),
  );
  const [inputResolutions, setInputResolutions] = useState(
    proposedInputs.map((item) => ({
      name: item.name,
      description: item.description ?? "",
      unit: item.unit,
      dataType: item.dataType,
      existingInputId: "",
    })),
  );
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [submittingPromotion, setSubmittingPromotion] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const parsedCategoryId =
    categoryId.trim().length > 0 ? Number.parseInt(categoryId, 10) : null;
  const filteredSubcategoryOptions = subcategoryOptions.filter(
    (item) => item.categoryId === parsedCategoryId,
  );

  const onSubmitDecision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingDecision(true);
    setMessage(null);
    setError(null);
    setValidationError(null);

    if (override && !latestDecisionId) {
      setValidationError(
        "Override requires a prior decision reference for this request.",
      );
      setSubmittingDecision(false);
      return;
    }

    if (decisionType === "APPROVE") {
      if (!parsedCategoryId || !Number.isInteger(parsedCategoryId)) {
        setValidationError("KPI category is required for approve.");
        setSubmittingDecision(false);
        return;
      }

      const parsedSubcategoryId =
        subcategoryId.trim().length > 0
          ? Number.parseInt(subcategoryId, 10)
          : null;

      if (!parsedSubcategoryId || !Number.isInteger(parsedSubcategoryId)) {
        setValidationError("KPI subcategory is required for approve.");
        setSubmittingDecision(false);
        return;
      }
    }

    const parsedSubcategoryId =
      subcategoryId.trim().length > 0
        ? Number.parseInt(subcategoryId, 10)
        : null;

    try {
      const response = await fetch(
        `/api/data-entry/custom-kpi/requests/${requestId}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decisionType,
            rationale,
            replacementKpiId,
            categoryId: parsedCategoryId,
            subcategoryId: parsedSubcategoryId,
            proposedUnits: unitResolutions,
            proposedInputs: inputResolutions,
            override,
            priorDecisionId: override ? latestDecisionId : null,
          }),
        },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        setError(payload.message ?? "Unable to submit decision.");
        return;
      }

      setMessage("Decision submitted successfully.");
      setRationale("");
      setReplacementKpiId("");
      setCategoryId("");
      setSubcategoryId("");
      router.refresh();
    } catch {
      setError("Unable to submit decision.");
    } finally {
      setSubmittingDecision(false);
    }
  };

  const onPromote = async () => {
    setSubmittingPromotion(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/data-entry/custom-kpi/requests/${requestId}/promotion`,
        {
          method: "POST",
        },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        setError(payload.message ?? "Unable to promote request visibility.");
        return;
      }

      setMessage("Visibility promoted to global.");
      router.refresh();
    } catch {
      setError("Unable to promote request visibility.");
    } finally {
      setSubmittingPromotion(false);
    }
  };

  return (
    <div className="rounded-md border p-4">
      <form
        className="space-y-2"
        onSubmit={onSubmitDecision}
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">
            Custom KPI reviewer decision controls
          </legend>

          <div className="flex gap-2 items-center">
            <label
              className="text-xs sm:text-sm"
              htmlFor={`decision-${requestId}`}
            >
              Decision:
            </label>
            <Select
              value={decisionType}
              onValueChange={(value) => setDecisionType(value as DecisionType)}
              aria-describedby={`decision-help-${requestId}`}
            >
              <SelectTrigger
                id={`decision-${requestId}`}
                className="h-9 text-xs sm:text-sm"
              >
                <SelectValue placeholder="Select decision" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVE">Approve</SelectItem>
                <SelectItem value="REJECT">Reject</SelectItem>
                <SelectItem value="REPLACE">Replace</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p
            id={`decision-help-${requestId}`}
            className="text-xs text-muted-foreground"
          >
            Use replace when an existing KPI should be used instead.
          </p>

          <div className="flex flex-col">
            <label
              className="text-xs sm:text-sm"
              htmlFor={`rationale-${requestId}`}
            >
              Rationale:
            </label>
            <textarea
              placeholder="Provide rationale for your decision"
              id={`rationale-${requestId}`}
              className="min-h-20 rounded border bg-background px-2 py-1 text-xs sm:text-sm"
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              required
              aria-required="true"
            />
          </div>

          {decisionType === "REPLACE" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <label
                className="text-xs sm:text-sm"
                htmlFor={`replacement-kpi-${requestId}`}
              >
                Replacement KPI ID
              </label>
              <input
                id={`replacement-kpi-${requestId}`}
                className="rounded border bg-background px-2 py-1 text-xs sm:text-sm"
                value={replacementKpiId}
                onChange={(event) => setReplacementKpiId(event.target.value)}
                inputMode="numeric"
                pattern="[0-9]+"
                required
                aria-required="true"
              />
            </div>
          ) : null}

          {decisionType === "APPROVE" ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs sm:text-sm"
                    htmlFor={`approval-category-${requestId}`}
                  >
                    KPI Category
                  </label>
                  <Select
                    value={categoryId}
                    onValueChange={(value) => {
                      setCategoryId(value);
                      setSubcategoryId("");
                    }}
                    required
                    aria-required="true"
                  >
                    <SelectTrigger
                      id={`approval-category-${requestId}`}
                      className="h-9 text-xs sm:text-sm"
                    >
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((option) => (
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

                <div className="flex flex-col gap-1">
                  <label
                    className="text-xs sm:text-sm"
                    htmlFor={`approval-subcategory-${requestId}`}
                  >
                    KPI Subcategory
                  </label>
                  <Select
                    value={subcategoryId}
                    onValueChange={setSubcategoryId}
                    required
                    aria-required="true"
                    disabled={parsedCategoryId == null}
                  >
                    <SelectTrigger
                      id={`approval-subcategory-${requestId}`}
                      className="h-9 text-xs sm:text-sm"
                    >
                      <SelectValue placeholder="Select subcategory" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredSubcategoryOptions.map((option) => (
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

              <div className="space-y-2 rounded border p-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Proposed units resolution
                </p>
                {unitResolutions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No proposed units.
                  </p>
                ) : (
                  unitResolutions.map((item, index) => (
                    <div
                      key={`unit-resolution-${index}`}
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      <input
                        className="rounded border bg-background px-2 py-1 text-xs sm:text-sm"
                        value={item.name}
                        placeholder="Unit name"
                        onChange={(event) =>
                          setUnitResolutions((current) =>
                            current.map((unit, unitIndex) =>
                              unitIndex === index
                                ? { ...unit, name: event.target.value }
                                : unit,
                            ),
                          )
                        }
                      />
                      <Select
                        value={item.existingUnitId}
                        onValueChange={(value) =>
                          setUnitResolutions((current) =>
                            current.map((unit, unitIndex) =>
                              unitIndex === index
                                ? { ...unit, existingUnitId: value }
                                : unit,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="h-9 text-xs sm:text-sm">
                          <SelectValue placeholder="Use existing unit (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__create_new__">
                            Create new unit
                          </SelectItem>
                          {existingUnitOptions.map((option) => (
                            <SelectItem
                              key={option.id}
                              value={String(option.id)}
                            >
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <input
                        className="rounded border bg-background px-2 py-1 text-xs sm:text-sm sm:col-span-2"
                        value={item.description}
                        placeholder="Unit description"
                        onChange={(event) =>
                          setUnitResolutions((current) =>
                            current.map((unit, unitIndex) =>
                              unitIndex === index
                                ? { ...unit, description: event.target.value }
                                : unit,
                            ),
                          )
                        }
                      />
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2 rounded border p-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Proposed inputs resolution
                </p>
                {inputResolutions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No proposed inputs.
                  </p>
                ) : (
                  inputResolutions.map((item, index) => (
                    <div
                      key={`input-resolution-${index}`}
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      <input
                        className="rounded border bg-background px-2 py-1 text-xs sm:text-sm"
                        value={item.name}
                        placeholder="Input name"
                        onChange={(event) =>
                          setInputResolutions((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, name: event.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                      <Select
                        value={item.existingInputId}
                        onValueChange={(value) =>
                          setInputResolutions((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, existingInputId: value }
                                : row,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="h-9 text-xs sm:text-sm">
                          <SelectValue placeholder="Use existing input (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__create_new__">
                            Create new input
                          </SelectItem>
                          {existingInputOptions.map((option) => (
                            <SelectItem
                              key={option.id}
                              value={String(option.id)}
                            >
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <input
                        className="rounded border bg-background px-2 py-1 text-xs sm:text-sm sm:col-span-2"
                        value={item.description}
                        placeholder="Input description"
                        onChange={(event) =>
                          setInputResolutions((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, description: event.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                      <input
                        className="rounded border bg-background px-2 py-1 text-xs sm:text-sm"
                        value={item.unit}
                        placeholder="Unit name"
                        onChange={(event) =>
                          setInputResolutions((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, unit: event.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                      <Select
                        value={item.dataType}
                        onValueChange={(value) =>
                          setInputResolutions((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index
                                ? { ...row, dataType: value }
                                : row,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="h-9 text-xs sm:text-sm">
                          <SelectValue placeholder="Data type" />
                        </SelectTrigger>
                        <SelectContent>
                          {dataTypeOptions.map((option) => (
                            <SelectItem
                              key={option.id}
                              value={option.name}
                            >
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-xs sm:text-sm">
            <input
              type="checkbox"
              checked={override}
              onChange={(event) => setOverride(event.target.checked)}
            />
            Override existing decision
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              disabled={submittingDecision}
            >
              {submittingDecision ? "Submitting..." : "Submit Decision"}
            </Button>

            <Button
              variant={"outline"}
              type="button"
              onClick={onPromote}
              disabled={!canPromote || submittingPromotion}
            >
              {submittingPromotion ? "Promoting..." : "Promote Visibility"}
            </Button>
          </div>
        </fieldset>
      </form>

      <div
        className="mt-2 min-h-5"
        role="status"
        aria-live="polite"
      >
        {message ? <p className="text-xs text-lime-700">{message}</p> : null}
      </div>
      <div
        className="min-h-5"
        aria-live="assertive"
      >
        {validationError ? (
          <p className="text-xs text-red-700">{validationError}</p>
        ) : null}
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}
