"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";

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
};

export function CustomKpiReviewActions({
  requestId,
  latestDecisionId,
  canPromote,
  categoryOptions,
  subcategoryOptions,
}: CustomKpiReviewActionsProps) {
  const router = useRouter();
  const [decisionType, setDecisionType] = useState<DecisionType>("APPROVE");
  const [rationale, setRationale] = useState("");
  const [replacementKpiId, setReplacementKpiId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [override, setOverride] = useState(false);
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
            <select
              id={`decision-${requestId}`}
              className="rounded border bg-background px-2 py-1 text-xs sm:text-sm"
              value={decisionType}
              onChange={(event) =>
                setDecisionType(event.target.value as DecisionType)
              }
              aria-describedby={`decision-help-${requestId}`}
            >
              <option value="APPROVE">Approve</option>
              <option value="REJECT">Reject</option>
              <option value="REPLACE">Replace</option>
            </select>
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
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label
                  className="text-xs sm:text-sm"
                  htmlFor={`approval-category-${requestId}`}
                >
                  KPI Category
                </label>
                <select
                  id={`approval-category-${requestId}`}
                  className="rounded border bg-background px-2 py-1 text-xs sm:text-sm"
                  value={categoryId}
                  onChange={(event) => {
                    setCategoryId(event.target.value);
                    setSubcategoryId("");
                  }}
                  required
                  aria-required="true"
                >
                  <option value="">Select category</option>
                  {categoryOptions.map((option) => (
                    <option
                      key={option.id}
                      value={option.id}
                    >
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  className="text-xs sm:text-sm"
                  htmlFor={`approval-subcategory-${requestId}`}
                >
                  KPI Subcategory
                </label>
                <select
                  id={`approval-subcategory-${requestId}`}
                  className="rounded border bg-background px-2 py-1 text-xs sm:text-sm"
                  value={subcategoryId}
                  onChange={(event) => setSubcategoryId(event.target.value)}
                  required
                  aria-required="true"
                  disabled={parsedCategoryId == null}
                >
                  <option value="">Select subcategory</option>
                  {filteredSubcategoryOptions.map((option) => (
                    <option
                      key={option.id}
                      value={option.id}
                    >
                      {option.name}
                    </option>
                  ))}
                </select>
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
