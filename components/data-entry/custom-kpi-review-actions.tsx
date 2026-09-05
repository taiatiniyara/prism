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
import { FieldGroup } from "../ui/field-group";
import BorderedBox from "../ui/bordered-box";

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
  const collapseExpandedCustomKpiRequests = () => {
    if (typeof document === "undefined") {
      return;
    }

    const expandedRequests = document.querySelectorAll<HTMLDetailsElement>(
      'details[data-custom-kpi-request-details="true"][open]',
    );
    expandedRequests.forEach((panel) => {
      panel.open = false;
    });
  };
  const [decisionType, setDecisionType] = useState<DecisionType>("APPROVE");
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
    const formData = new FormData(event.currentTarget);
    const rationale = String(formData.get("rationale") ?? "").trim();
    const replacementKpiId = String(
      formData.get("replacementKpiId") ?? "",
    ).trim();

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

    let decisionApplied = false;

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

      decisionApplied = true;
      setMessage("Decision submitted successfully.");
      setCategoryId("");
      setSubcategoryId("");
      event.currentTarget.reset();
      collapseExpandedCustomKpiRequests();
      try {
        router.refresh();
      } catch (refreshError) {
        console.error("Decision submitted but refresh failed", {
          requestId,
          error:
            refreshError instanceof Error
              ? refreshError.message
              : "Unknown error",
        });
      }
    } catch {
      if (!decisionApplied) {
        setError("Unable to submit decision.");
      }
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
      collapseExpandedCustomKpiRequests();
      router.refresh();
    } catch {
      setError("Unable to promote request visibility.");
    } finally {
      setSubmittingPromotion(false);
    }
  };

  return (
    <BorderedBox variant="panel">
      <form
        className="space-y-2"
        onSubmit={onSubmitDecision}
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">
            Custom KPI reviewer decision controls
          </legend>

          <FieldGroup
            label="Decision:"
            htmlFor={`decision-${requestId}`}
            containerClassName="flex gap-2 items-center"
            labelClassName="text-xs sm:text-sm"
          >
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
          </FieldGroup>
          <p
            id={`decision-help-${requestId}`}
            className="text-xs text-muted-foreground"
          >
            Use replace when an existing KPI should be used instead.
          </p>

          <FieldGroup
            label="Rationale:"
            htmlFor={`rationale-${requestId}`}
            containerClassName="flex flex-col"
            labelClassName="text-xs sm:text-sm"
          >
            <textarea
              name="rationale"
              placeholder="Provide rationale for your decision"
              id={`rationale-${requestId}`}
              className="min-h-20 rounded border bg-background px-2 py-1 text-xs sm:text-sm"
              required
              aria-required="true"
            />
          </FieldGroup>

          {decisionType === "REPLACE" ? (
            <FieldGroup
              label="Replacement KPI ID"
              htmlFor={`replacement-kpi-${requestId}`}
              containerClassName="grid gap-2 sm:grid-cols-2"
              labelClassName="text-xs sm:text-sm"
            >
              <input
                name="replacementKpiId"
                id={`replacement-kpi-${requestId}`}
                className="rounded border bg-background px-2 py-1 text-xs sm:text-sm"
                inputMode="numeric"
                pattern="[0-9]+"
                required
                aria-required="true"
              />
            </FieldGroup>
          ) : null}

          {decisionType === "APPROVE" ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <FieldGroup
                  label="KPI Category"
                  htmlFor={`approval-category-${requestId}`}
                  containerClassName="flex flex-col gap-1"
                  labelClassName="text-xs sm:text-sm"
                >
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
                </FieldGroup>

                <FieldGroup
                  label="KPI Subcategory"
                  htmlFor={`approval-subcategory-${requestId}`}
                  containerClassName="flex flex-col gap-1"
                  labelClassName="text-xs sm:text-sm"
                >
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
                </FieldGroup>
              </div>

              <BorderedBox variant="stack" className="space-y-2 p-2">
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
              </BorderedBox>

              <BorderedBox variant="stack" className="space-y-2 p-2">
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
              </BorderedBox>
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
          <p className="text-xs text-danger">{validationError}</p>
        ) : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </BorderedBox>
  );
}
