# Quickstart: KPI Balanced Scorecard

## Prerequisites

- Node.js environment compatible with project toolchain
- Install dependencies:

```bash
npm install
```

## 1) Implement feature slices

- Add scorecard service logic under `app/data-entry/balanced-scorecard/`.
- Add authenticated route under
  `app/api/data-entry/balanced-scorecard/route.ts`.
- Add scorecard UI shell/page and reusable components under
  `components/data-entry/`.
- Reuse existing filter context patterns from review KPI module.

## 2) Validate static quality gates

```bash
npm run lint
npm run build
```

## 3) Run automated tests

```bash
npm run test:unit
npm run test:integration
```

## 4) Minimum test coverage expectations

- Unit: weighted aggregation, dedupe (latest approved), invalid-row exclusion
  reasons, overall score computation.
- Integration: unauthorized/forbidden route behavior, validation errors,
  successful scorecard payload shape, empty state behavior.
- UI behavior: loading/empty/error rendering and last-filter-wins when filters
  change rapidly.

## 5) Manual verification checklist

- Open scorecard with valid context and verify perspective + overall values.
- Compare scorecard totals against known KPI table dataset.
- Verify excluded KPI count and reason visibility in detail view.
- Verify stale responses do not overwrite latest filter selection results.
- Verify keyboard navigation and screen-reader labels for perspective/detail
  interactions.

## 6) Validation evidence capture

- Record `npm run lint` output and timestamp.
- Record `npm run build` output and timestamp.
- Record `npm run test:unit` output and timestamp.
- Record `npm run test:integration` output and timestamp.

## 7) SC-003 pilot usability plan

## 8) SC-004 reconciliation impact plan

## 9) Execution evidence (2026-03-26)

- `npm run lint`: executed; repository has existing unrelated lint errors
  outside this feature scope.
- `npm run build`: passed.
- `npm run test:unit`: passed (22 files, 37 tests).
- `npm run test:integration`: passed (36 files, 50 tests).

## 10) Delivery status notes

- SC-003 pilot usability execution requires real pilot participants and is
  pending product scheduling.
- SC-004 post-release measurement requires baseline and post-release operational
  data collection.
- Target: at least 50% reduction from baseline.
- Owner and review cadence: Product owner and monthly review cadence.
