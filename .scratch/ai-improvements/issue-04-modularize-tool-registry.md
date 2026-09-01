# Modularize Tool Registry

## What to build

The AI tool registry (`tools/index.ts`) is a single 1035-line file defining all 67 tools — PRISM-native diagnostics and Power BI analytics mixed together. This makes it hard to find, modify, or test individual tool groups.

Split into `tools/prism-native.ts` (39 tools) and `tools/power-bi.ts` (29 tools), with a barrel re-export from `tools/index.ts` that maintains the same public API. No behavior change.

## Acceptance criteria

- [ ] `tools/index.ts` barrel re-exports `createAiTools()` with identical signature and behavior
- [ ] `tools/prism-native.ts` contains all non-PBI tool definitions
- [ ] `tools/power-bi.ts` contains all `pbi_*` tool definitions
- [ ] All existing tests pass without modification
- [ ] No import changes needed in `service.ts`, `chat/route.ts`, or any consumer
- [ ] Shared utilities (timeout wrapping, result truncation, circuit breaker) extracted to `tools/utils.ts`

## Blocked by

None — can start immediately.
