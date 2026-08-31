/**
 * CSP-safe arithmetic evaluator for the Test harness.
 *
 * The production CSP intentionally omits `'unsafe-eval'`, so the browser blocks
 * `new Function(...)` — which is why the server-side evaluator
 * (`app/data-entry/kpi-worker/evaluator.ts`) cannot be reused on the client.
 * The formula language the unified builder produces is pure arithmetic
 * (variables, numeric literals, `+ - * / ( )`, unary +/-), so a small
 * recursive-descent parser evaluates it exactly with no eval.
 *
 * This mirrors the arithmetic semantics of the server evaluator for every
 * formula the builder can create; it is a preview aid, not the source of
 * truth (the worker computes the stored value).
 */

export type SafeEvalResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

const TOKEN_RE = /[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/]/g;

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let cursor = 0;
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(expr)) !== null) {
    // anything between the previous match and this one must be whitespace only
    const gap = expr.slice(cursor, match.index);
    if (gap.trim().length > 0) {
      throw new Error(`Unexpected "${gap.trim()}" in formula.`);
    }
    tokens.push(match[0]);
    cursor = TOKEN_RE.lastIndex;
  }
  if (expr.slice(cursor).trim().length > 0) {
    throw new Error(`Unexpected "${expr.slice(cursor).trim()}" in formula.`);
  }
  return tokens;
}

/**
 * Evaluate a pure-arithmetic formula with the given variable values.
 * Grammar:
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := number | identifier | '(' expr ')' | ('+' | '-') factor
 */
export function safeEvaluateFormula(
  formula: string,
  variables: Record<string, number>,
): SafeEvalResult {
  const clean = formula.trim();
  if (clean.length === 0) {
    return { ok: false, error: "Formula is empty." };
  }

  let tokens: string[];
  try {
    tokens = tokenize(clean);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid formula." };
  }

  let pos = 0;
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
    const token = peek();
    if (token === undefined) {
      throw new Error("Formula ends unexpectedly.");
    }
    if (token === "+" || token === "-") {
      next();
      const operand = parseFactor();
      return token === "-" ? -operand : operand;
    }
    if (token === "(") {
      next();
      const inner = parseExpr();
      if (next() !== ")") {
        throw new Error("Unbalanced parentheses.");
      }
      return inner;
    }
    if (token === ")") {
      throw new Error("Unbalanced parentheses.");
    }
    // number literal
    if (/^\d/.test(token)) {
      next();
      return Number(token);
    }
    // identifier → variable substitution
    if (/^[A-Za-z_]/.test(token)) {
      next();
      const value = variables[token];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`No numeric value for "${token}".`);
      }
      return value;
    }
    throw new Error(`Unexpected token "${token}".`);
  }

  let result: number;
  try {
    result = parseExpr();
    if (pos < tokens.length) {
      throw new Error(`Unexpected "${tokens[pos]}" in formula.`);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unable to evaluate formula." };
  }

  if (!Number.isFinite(result)) {
    return { ok: false, error: "Formula result is not a finite number." };
  }
  return { ok: true, value: result };
}
