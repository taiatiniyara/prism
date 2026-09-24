# Legacy `kpi` table — cutover & retirement plan

**Status:** PLANNED — executes only AFTER Step 4 (`kpi_actual` populated). **Not started.**
**Coordination:** #1 · **Compute/parity:** #3 · **Gold fact / Power BI:** #4 · **DDL/drop:** #2 · **Targets/BSC:** #5 · **RLS:** #12
**Authored:** #1 (coordination), 2026-09-24.

## Why retire `kpi`

`kpi_actual` (+ `kpi_target`) is the redesigned replacement for the legacy flat `kpi` table. The legacy table conflates **target + actual + relevance** in one row, is **submission-anchored** (`report_period_id`, not the canonical period dim), and is **utility-grain only**. The new model splits target/actual, keys on the period dim (so target ⋈ actual joins), and carries the hybrid grain address.

Keeping **both** permanently would mean **two sources of truth for actuals** — the exact dual-track drift class that wiped `data_entries` in 2026-09-04. So `kpi` must be retired after cutover.

## HARD GATE (Eugene, 2026-09-24): prove `kpi_actual` ≡ `kpi` before any drop

**`kpi` is retired ONLY after `kpi_actual` is proven to do what `kpi` does — in BOTH dimensions:**

1. **Value parity.** For the overlapping scope (KPI × utility × period that `kpi` covers), `kpi_actual`'s recomputed values match `kpi.actual_value` — OR every difference is explained and confirmed as `kpi_actual` being the *correct* one (`kpi` may hold stale / hand-entered values). **#3 defines the tolerance, the diff-review method, and signs off; Eugene approves the value-parity result.**
2. **Coverage / consumer parity.** Every current reader of `kpi` has an equivalent, working read from `kpi_actual` (+ `kpi_target` for targets, + the relevance home for `is_relevant`, + wherever comments belong). No consumer left depending on `kpi`.

No drop happens until both are demonstrated.

## Sequence

0. **(Prereq) Step 4** — `kpi_actual` full recompute populated + `period_id → period` FK. Separate campaign step; Eugene's direct go on the apply.
1. **Inventory readers of `kpi`** — enumerate everything that SELECTs/joins `kpi`: app routes/services, the kpi-worker, `gold_fact` / Power BI feeds (#4), exports, BSC/scoring (#5). (#3 leads; #4/#5 confirm their slices.)
2. **Value-parity proof** — #3 runs the `kpi` vs `kpi_actual` comparison across the overlap and produces a reconciliation (matches / explained diffs). **Eugene signs off.**
3. **Cut over readers** — repoint each reader from `kpi` → `kpi_actual` / `kpi_target`, git-first, **one at a time while BOTH tables still exist** (no big-bang), verifying each.
4. **Soak / dual-run** — both tables live in parallel for an agreed window; monitor for regressions or a missed reader. `kpi` goes read-only once the calculator writes only `kpi_actual`.
5. **Retire `kpi`** — only after 1–4 are clean: **back up** `kpi` (db-push-safe / backup snapshot), then DROP. git-first; **Eugene's DIRECT in-session go for the apply** (per the DB-apply rule); #2 executes + drift-check.

## Guardrails

- **Expand/contract:** do NOT stop writing `kpi` or drop it until readers are cut over and parity is proven — else the live app breaks (cf. the `/api/organisations` outage from a drop during a deploy lag).
- During dual-run the calculator may write both, or `kpi` is frozen — #3's call at stages 3–4.
- `kpi_actual` RLS (#12, D1) must be enabled/consistent before it is the sole actuals store.
- This plan is the tail of the kpi time-series campaign; it follows [kpi-target-actual-contract.md](kpi-target-actual-contract.md) and [kpi-time-series-spec.md](kpi-time-series-spec.md).
