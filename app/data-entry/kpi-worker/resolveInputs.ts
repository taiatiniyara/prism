import { createFactResolver } from "./fact-resolver";
import type {
  ResolveInputsRequest,
  ResolvedFormulaInputs,
} from "./fact-resolver";

export type { RollupCandidate } from "./dimension-rollup";
export { sumRollupValues } from "./dimension-rollup";
export type { ResolveInputsRequest, ResolvedFormulaInputs } from "./fact-resolver";

/**
 * Resolve a formula's input bindings to numeric values against the live
 * database. Thin wrapper over `createFactResolver()` with the default DB
 * adapters — tests construct their own resolver with fakes.
 */
export const resolveFormulaInputValues = (
  request: ResolveInputsRequest,
): Promise<ResolvedFormulaInputs> => createFactResolver().resolve(request);
