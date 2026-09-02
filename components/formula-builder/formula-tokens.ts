/**
 * Formula token helpers for the unified builder — split out of
 * `FormulaEditor.tsx` so they can be unit-tested without pulling React in.
 *
 * `tokenizeFormula` here is a *display* tokeniser (whitespace-split, keeps
 * quotes) driving the drag-reorder chip row — deliberately looser than the
 * grammar in `lib/formula/arithmetic.ts`. "What variables does this formula
 * reference" is answered by `analyzeFormula` there; `formulaVariables` is a
 * thin alias kept for the editor's call sites.
 */

import { analyzeFormula } from "@/lib/formula/arithmetic";

/** Operators the unified builder offers. WHERE/AND/OR are intentionally absent —
 *  per-variable dimension scope lives in the tag cards, not the formula. */
export const OPERATORS = ["+", "-", "*", "/", "(", ")"] as const;
export const DND_TOKEN_KEY = "application/x-prism-formula-token";

export const OPERATOR_SET = new Set<string>(OPERATORS);

export const isIdentifierToken = (token: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(token);

export const isNumericToken = (token: string): boolean =>
  /^-?\d+(\.\d+)?$/.test(token);

export const tokenizeFormula = (text: string): string[] =>
  text.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];

/** Unique variable identifiers referenced by a formula, in first-seen order. */
export const formulaVariables = (formula: string): string[] =>
  analyzeFormula(formula).variables;
