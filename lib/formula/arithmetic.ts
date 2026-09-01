/**
 * Eval-free arithmetic formula evaluator — the one thing that evaluates or
 * inspects an `arithmetic`-kind PRISM formula. Everything delegates here:
 *  - `kpi-worker/evaluator.ts` (KPI compute) — via `evaluateArithmetic`
 *  - `aggregated-worker/evaluator.ts` (calculated-measure compute) — via
 *    `evaluateArithmeticWithAliases` (multi-word variable names)
 *  - `components/formula-builder/safe-eval.ts` (the Test harness) — via
 *    `evaluateArithmetic`
 *  - `analyzeFormula` — the one "which variables / is it pure addition" query,
 *    used by both workers and the builder in place of ad-hoc regexes.
 *
 * It replaces `new Function(...)` so no code path depends on `'unsafe-eval'`
 * (client CSP) or exposes a server-side eval surface.
 *
 * The formula language is pure arithmetic: variables, numeric literals,
 * `+ - * / ( )`, and unary +/-. A deliberately tiny recursive-descent
 * evaluator over exactly that grammar.
 *
 * Scope boundary: this module owns the `arithmetic` formula kind only. The
 * named built-in kinds (spec §4.6.3, first is `block_tariff`) dispatch
 * elsewhere and do not pass through here.
 *
 * Design guarantees (security-reviewed with #12):
 *  - FAIL-CLOSED: any character/token/identifier outside the arithmetic
 *    grammar throws `FormulaError`. It never coerces, never silently returns
 *    0/NaN, and never falls back to eval.
 *  - NO PARSER DoS: input length and recursion depth are bounded, so a
 *    pathological formula (huge length, deeply nested parens/unary) throws
 *    instead of hanging or blowing the stack.
 */

/** Max characters in a formula string (guards overlong input). */
export const MAX_FORMULA_LENGTH = 4000;
/** Max recursion depth (guards deeply nested parens / unary chains). */
export const MAX_EXPRESSION_DEPTH = 64;

export type FormulaErrorKind = "syntax" | "value" | "range";

export class FormulaError extends Error {
  readonly kind: FormulaErrorKind;
  constructor(message: string, kind: FormulaErrorKind) {
    super(message);
    this.name = "FormulaError";
    this.kind = kind;
  }
}

const TOKEN_RE = /[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/]/g;

/** Split into arithmetic tokens; throws (fail-closed) on any stray character. */
function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let cursor = 0;
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(expr)) !== null) {
    const gap = expr.slice(cursor, match.index);
    if (gap.trim().length > 0) {
      throw new FormulaError(`Unexpected "${gap.trim()}" in formula.`, "syntax");
    }
    tokens.push(match[0]);
    cursor = TOKEN_RE.lastIndex;
  }
  const tail = expr.slice(cursor).trim();
  if (tail.length > 0) {
    throw new FormulaError(`Unexpected "${tail}" in formula.`, "syntax");
  }
  return tokens;
}

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUMBER_RE = /^\d+(?:\.\d+)?$/;

export interface FormulaAnalysis {
  /** Distinct variable identifiers referenced by the formula, first-seen order. */
  variables: string[];
  /**
   * True when the formula is a bare sum of variables / numbers (only `+`,
   * parens, identifiers and numeric literals — no `- * /`). Callers use this to
   * decide whether a missing input can be zero-filled (an additive term
   * contributes 0) rather than failing the whole computation.
   */
  isPureAddition: boolean;
}

/**
 * Describe a formula's shape without evaluating it: which variables it names and
 * whether it is pure addition. The single "structure of a formula" query —
 * every ad-hoc identifier regex and `isPureAdditionFormula` copy should
 * delegate here.
 *
 * Tolerant by design: a formula the tokenizer rejects still yields its
 * identifier-shaped tokens (so a broken KPI formula still surfaces its intended
 * variables to the "needs repair" check), and `isPureAddition` is `false` for
 * anything that does not cleanly tokenize.
 */
export function analyzeFormula(formula: string): FormulaAnalysis {
  const text = typeof formula === "string" ? formula : "";

  let tokens: string[] | null = null;
  try {
    tokens = tokenize(text.trim());
  } catch {
    tokens = null;
  }

  const seen = new Set<string>();
  const variables: string[] = [];
  const rawIds = tokens ?? (text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  for (const tok of rawIds) {
    if (!IDENTIFIER_RE.test(tok) || seen.has(tok)) {
      continue;
    }
    seen.add(tok);
    variables.push(tok);
  }

  let isPureAddition = false;
  if (tokens !== null) {
    let hasValue = false;
    isPureAddition = tokens.every((tok) => {
      if (IDENTIFIER_RE.test(tok) || NUMBER_RE.test(tok)) {
        hasValue = true;
        return true;
      }
      return tok === "+" || tok === "(" || tok === ")";
    }) && hasValue;
  }

  return { variables, isPureAddition };
}

/**
 * Evaluate a pure-arithmetic formula. Throws `FormulaError` on any problem
 * (syntax, unknown/missing variable, non-finite result). Returns a finite
 * number on success.
 *
 * Grammar:
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := number | identifier | '(' expr ')' | ('+' | '-') factor
 */
export function evaluateArithmetic(
  formula: string,
  variables: Record<string, number>,
): number {
  if (typeof formula !== "string") {
    throw new FormulaError("Formula must be a string.", "syntax");
  }
  const clean = formula.trim();
  if (clean.length === 0) {
    throw new FormulaError("Formula is empty.", "syntax");
  }
  if (clean.length > MAX_FORMULA_LENGTH) {
    throw new FormulaError("Formula is too long to evaluate.", "range");
  }

  const tokens = tokenize(clean);
  let pos = 0;
  let depth = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr(): number {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const rhs = parseFactor();
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }

  function parseFactor(): number {
    // Every recursive step funnels through parseFactor (parens re-enter via
    // parseExpr; unary chains re-enter directly), so bounding depth here
    // bounds total recursion.
    depth += 1;
    if (depth > MAX_EXPRESSION_DEPTH) {
      throw new FormulaError("Formula is nested too deeply.", "range");
    }
    try {
      const head = peek();
      if (head === undefined) {
        throw new FormulaError("Formula ends unexpectedly.", "syntax");
      }
      if (head === "+" || head === "-") {
        next();
        const operand = parseFactor();
        return head === "-" ? -operand : operand;
      }
      if (head === "(") {
        next();
        const inner = parseExpr();
        if (next() !== ")") {
          throw new FormulaError("Unbalanced parentheses in formula.", "syntax");
        }
        return inner;
      }
      if (head === ")") {
        throw new FormulaError("Unbalanced parentheses in formula.", "syntax");
      }
      if (/^\d/.test(head)) {
        next();
        return Number(head);
      }
      // identifier → variable substitution. Only OWN properties count, so
      // inherited object members (constructor, toString, __proto__, …) are
      // never resolvable as variables — explicit belt-and-suspenders on top
      // of the numeric-value check below.
      next();
      if (!Object.hasOwn(variables, head)) {
        throw new FormulaError(`No numeric value for "${head}".`, "value");
      }
      const value = variables[head];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new FormulaError(`No numeric value for "${head}".`, "value");
      }
      return value;
    } finally {
      depth -= 1;
    }
  }

  const result = parseExpr();
  if (pos < tokens.length) {
    throw new FormulaError(`Unexpected "${tokens[pos]}" in formula.`, "syntax");
  }
  if (!Number.isFinite(result)) {
    throw new FormulaError("Formula result is not a finite number.", "value");
  }
  return result;
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Evaluate an arithmetic formula whose variable names may contain spaces or
 * other characters the grammar's identifier rule rejects (e.g. a formula
 * authored as `"Operating Expenses + Administrative Expenses"`).
 *
 * Each key in `variables` is rewritten — longest key first, on word
 * boundaries, so `"Operating Expenses"` is substituted before `"Operating"`
 * and `XY` before `X` — to a safe `__vN` token, then the result runs through
 * the strict `evaluateArithmetic` core. Keys that are already valid slug
 * identifiers pass straight through. Fail-closed and eval-free, exactly like
 * the core.
 */
export function evaluateArithmeticWithAliases(
  formula: string,
  variables: Record<string, number>,
): number {
  if (typeof formula !== "string") {
    throw new FormulaError("Formula must be a string.", "syntax");
  }

  const aliasKeys = Object.keys(variables).filter(
    (key) => !IDENTIFIER_RE.test(key),
  );

  if (aliasKeys.length === 0) {
    return evaluateArithmetic(formula, variables);
  }

  // Longest first so a name that is a prefix of another is replaced last.
  aliasKeys.sort((a, b) => b.length - a.length);

  let rewritten = formula;
  const safeVariables: Record<string, number> = {};

  // Slug keys carry through unchanged.
  for (const [key, value] of Object.entries(variables)) {
    if (IDENTIFIER_RE.test(key)) {
      safeVariables[key] = value;
    }
  }

  aliasKeys.forEach((key, index) => {
    if (!/[A-Za-z]/.test(key)) {
      // A "variable" that is punctuation only (e.g. "+") would rewrite the
      // formula's operators — refuse it rather than silently corrupt.
      throw new FormulaError(
        `Invalid formula variable name "${key}".`,
        "syntax",
      );
    }
    const safeName = `__alias_${index}`;
    const startsWord = /^\w/.test(key);
    const endsWord = /\w$/.test(key);
    // eslint-disable-next-line security/detect-non-literal-regexp -- key is escaped via escapeRegExp
    const pattern = new RegExp(
      `${startsWord ? "\\b" : ""}${escapeRegExp(key)}${endsWord ? "\\b" : ""}`,
      "g",
    );
    rewritten = rewritten.replace(pattern, safeName);
    safeVariables[safeName] = variables[key];
  });

  return evaluateArithmetic(rewritten, safeVariables);
}
