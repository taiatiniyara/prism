import { sql } from "drizzle-orm";
import { db } from "@/db/connection";
import {
  migrationRejections,
  type FailureCategory,
  type NewMigrationRejection,
} from "@/db/schema/migrationRejections";

/**
 * Migration rejection ledger helpers. The loader is expected to:
 *   1. call resetRejections() ONCE at the very start of a load run, then
 *   2. call recordRejection(...) for every source data point it cannot load.
 *
 * See db/schema/migrationRejections.ts for the table's design rationale.
 */

/** Reset the ledger before every load run — each load starts from a clean slate. */
export async function resetRejections(): Promise<void> {
  await db.execute(sql`TRUNCATE ${migrationRejections} RESTART IDENTITY`);
}

export interface RejectionInput {
  /** The load run this rejection belongs to (from startLoad()). */
  loadId?: number;
  loadRun?: string;
  sourceSystem?: string;
  sourceRef?: string;
  /** Source period (p1) — attributes the failure to a report_period for the scorecard. */
  p1ReportPeriodId?: number;
  /** Which pass failed: "shell" (relevance → address) or "value" (typed value fill). */
  stage?: "shell" | "value";
  /** The full attempted record — so the fixer sees exactly what was tried. */
  sourcePayload?: unknown;
  measureDefId?: number | null;
  measureName?: string | null;
  reportPeriod?: string | null;
  utility?: string | null;
  /** The value type this data point was headed for — lets the scorecard balance failures by type. */
  intendedValueType?: "numeric" | "boolean" | "text" | "option" | "empty";
  /** Parsed numeric value of a failed numeric row — feeds the scorecard's numeric-sum fidelity line. */
  attemptedNumeric?: number | string | null;
  category: FailureCategory;
  /** Which column(s) failed. */
  columns: string[];
  /** Why, in plain language. */
  reason: string;
  /** The constraint/validation id, e.g. "chk_one_value", "technology_id NOT NULL". */
  rule?: string;
  /** What needs to be done to fix it. */
  remediation: string;
  /** The DB/driver error text, if this rejection came from a caught exception. */
  rawError?: string;
}

/** Record one rejected data point. Never throws on a well-formed input. */
export async function recordRejection(input: RejectionInput): Promise<void> {
  const row: NewMigrationRejection = {
    load_id: input.loadId ?? null,
    load_run: input.loadRun ?? null,
    source_system: input.sourceSystem ?? null,
    source_ref: input.sourceRef ?? null,
    p1_report_period_id: input.p1ReportPeriodId ?? null,
    stage: input.stage ?? null,
    source_payload: (input.sourcePayload ?? null) as NewMigrationRejection["source_payload"],
    measure_def_id: input.measureDefId ?? null,
    measure_name: input.measureName ?? null,
    report_period: input.reportPeriod ?? null,
    utility: input.utility ?? null,
    intended_value_type: input.intendedValueType ?? null,
    attempted_numeric:
      input.attemptedNumeric == null ? null : String(input.attemptedNumeric),
    failure_category: input.category,
    failure_columns: input.columns,
    failure_reason: input.reason,
    failure_rule: input.rule ?? null,
    remediation: input.remediation,
    raw_error: input.rawError ?? null,
  };
  await db.insert(migrationRejections).values(row);
}

/**
 * Map a caught Postgres error to a failure category + the column(s) it implicates.
 * Lets the loader wrap a real INSERT in try/catch and record a precise rejection
 * without hand-classifying every failure mode. Falls back to "other".
 */
export function classifyPgError(err: unknown): {
  category: FailureCategory;
  columns: string[];
  rule?: string;
  reason: string;
} {
  // Drizzle (and pg pools) wrap the real Postgres error under `.cause` — walk down to the
  // node that actually carries a pg error `code`, so classification doesn't fall through to "other".
  type PgErrorNode = {
    code?: string;
    column?: string;
    constraint?: string;
    detail?: string;
    message?: string;
    cause?: unknown;
  };
  let e = err as PgErrorNode | null | undefined;
  for (let i = 0; i < 4 && e && e.code == null && e.cause != null; i++) e = e.cause as PgErrorNode | null | undefined;
  e = (e ?? err) as PgErrorNode;
  const detail = e?.detail || e?.message || "";
  switch (e?.code) {
    case "23502": // not_null_violation
      return { category: "not_null", columns: e.column ? [e.column] : [], rule: e.column ? `${e.column} NOT NULL` : "NOT NULL", reason: `Required column "${e.column}" was null.` };
    case "23514": // check_violation
      return { category: "check", columns: e.constraint === "chk_one_value" ? ["value_numeric", "value_boolean", "value_text", "value_option_id"] : [], rule: e.constraint, reason: `CHECK constraint "${e.constraint}" failed. ${detail}`.trim() };
    case "23505": // unique_violation
      return { category: "unique", columns: [], rule: e.constraint, reason: `Duplicate physical address (${e.constraint}). ${detail}`.trim() };
    case "23503": // foreign_key_violation
      return { category: "fk", columns: e.column ? [e.column] : [], rule: e.constraint, reason: `Referenced id does not exist. ${detail}`.trim() };
    case "22P02": // invalid_text_representation
    case "22003": // numeric_value_out_of_range
      return { category: "type_cast", columns: e.column ? [e.column] : [], reason: `Value could not be stored in its typed column. ${detail}`.trim() };
    default:
      return { category: "other", columns: [], reason: e?.message || "Unknown error." };
  }
}
