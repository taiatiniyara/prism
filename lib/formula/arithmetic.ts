/**
 * Eval-free arithmetic formula evaluator — the single source of truth for
 * evaluating PRISM formula expressions on both the client (Test harness) and
 * the server (kpi-worker). It replaces `new Function(...)` so no code path
 * depends on `'unsafe-eval'` (client CSP) or exposes a server-side eval
 * surface.
 *
 * The formula language the builder produces is pure arithmetic: variables,
 * numeric literals, `+ - * / ( )`, and unary +/-. This is a deliberately
 * tiny recursive-descent evaluator over exactly that grammar.
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
