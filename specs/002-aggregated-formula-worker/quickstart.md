# Quickstart: Aggregated Formula Worker Processing

## Prerequisites

- Node.js and dependencies installed (`npm install`).
- Development database configured and reachable.
- Authenticated account with data-entry permissions.
- Input definitions include:
- aggregated formula targets (`aggregated = true`, non-empty formula),
- source inputs referenced by formula variables.

## Run

1. Start application:

```bash
npm run dev
```

2. Open data-entry flow and submit/update values in a reporting scope that has
   aggregated formulas.

3. Confirm save returns immediately (worker processing is asynchronous).

4. Verify aggregated targets and processing outcomes after worker completion.

## Validation Commands

Run before merge:

```bash
npm run lint
npm run build
npm test
```

Optional focused suites:

```bash
npm run test:unit
npm run test:integration
```

## Manual Verification Scenarios

1. Eligible calculation

- Prepare formulas with all source dependencies present.
- Save source input.
- Verify aggregated targets are calculated and persisted.

2. Missing dependency skip

- Leave one referenced source value null/undefined.
- Save source input.
- Verify affected target is skipped with reason and other eligible targets still
  compute.

3. Unknown variable skip

- Use formula containing unknown variable token.
- Trigger run.
- Verify target is skipped with unknown-variable reason.

4. Runtime evaluation error skip

- Create formula causing runtime evaluation error.
- Trigger run.
- Verify target is skipped with evaluation-error reason; run continues.

5. Snapshot semantics

- Use formulas where one aggregated target could influence another if chained.
- Trigger run.
- Verify same-run evaluations use source snapshot only; chained aggregated
  effects appear only after subsequent trigger.

6. Concurrent same-scope runs

- Trigger near-simultaneous saves in same reporting scope.
- Verify runs can overlap and final overlapping target value reflects last
  completed write.

7. Non-blocking save UX

- Measure save response behavior during heavy run.
- Verify save response is not blocked by worker completion.

## Evidence Capture

Record command outputs and verification outcomes in PR notes:

- `npm run lint`
- `npm run build`
- `npm test`
- Manual scenario results for items 1-7 above

## Operations Runbook Notes

- Review latest run summary:
  `GET /api/data-entry/aggregated-runs?reportPeriodId=<id>&serviceAreaId=<id>`.
- Review one run with target outcomes:
  `GET /api/data-entry/aggregated-runs/<runId>`.
- In-app review surfaces:
  - Data-entry flow status card on `app/data-entry/enter-data/page.tsx`.
  - Operations review page on `app/data-entry/review-kpi/page.tsx`.
- Skipped outcomes are expected when dependencies are missing/unknown or formula
  evaluation fails; skipped targets do not overwrite existing values.

## Validation Evidence (2026-03-19)

- `npm run test:unit`: PASS (10 files, 18 tests).
- `npm run test:integration`: PASS (11 files, 14 tests).
- `npm run build`: PASS.
- `npm run lint`: FAIL due pre-existing repository lint errors outside this
  feature scope (for example in `app/migration/service.ts`,
  `app/settings/inputs/uploadFromExcel.tsx`, and `components/heading.tsx`).
