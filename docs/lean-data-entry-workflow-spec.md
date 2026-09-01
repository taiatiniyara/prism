# Lean data-entry workflow (BLO-activated) — reduce entry burden where no DAO engages

**Status:** PROPOSED (2026-08-17) · **Author:** #2/jolly (migration — owns the workflow status model) · **For:** #4 (storage/DDL), #10 (roles/permissions), #11 (entry UI), #3 (KPI outlier flags)

## 1. Problem

Small utilities often have **no engaged Data Acquisition Officer (DAO)**. The BLO then both **enters**
the data and **reviews** it — reviewing their own careful entry "from a KPI perspective" before it
goes to the CEO. That self-review is a rubber-stamp: it carries the *cost* of the maker-checker
control without the *value*, because the enterer and reviewer are the same person. It's tedious and
inflates the data-entry burden for exactly the utilities least able to bear it.

## 2. Decisions (Eugene, 2026-08-17)

1. **Lean mode is BLO-activated — an explicit toggle, NOT auto-detected from role assignment.** A DAO
   role may be *defined and even assigned* yet the person never engages, so only the BLO knows
   whether they are, in practice, doing the DAO's job. **The BLO turns lean mode on/off.**
2. **In lean mode, the BLO's entry lands directly at `Reviewed (4)`** — skipping `Entered (3)` and the
   separate self-review click. One action: enter = vouch.
3. **CEO approval (`5`) is always required** — it is the surviving independent control
   (enterer BLO ≠ approver CEO = maker-checker preserved).
4. **KPI safety net stays, exception-based:** even in lean mode, an entry whose resulting KPI is an
   **outlier / out-of-`valid_range` / rule-failing** is **held for the BLO's explicit attention**
   (does not silently auto-advance). Clean entries flow through; only risky ones stop.

## 3. Model — no new statuses, only a profile-driven transition

The status set is unchanged (`Pending 2 → Entered 3 → Reviewed 4 → Approved 5`). Only *which*
transition an entry takes changes:

| Mode | Lifecycle | Notes |
|---|---|---|
| **Standard** (lean off) | Pending → **Entered** (DAO) → **Reviewed** (BLO) → Approved (CEO) | `Entered (3)` = raw entry awaiting an independent BLO check |
| **Lean** (BLO on) | Pending → **Reviewed** (BLO enters *and* vouches) → Approved (CEO) | clean entries skip `Entered`; **outlier-flagged entries are held at `Entered (3)`** for the BLO to look at before advancing |

So `Entered (3)` keeps a clear meaning in both modes: *"entered but not yet vouched"* — it just
only occurs for DAO entries (standard) or flagged entries (lean).

## 4. Actions by owner

### #4 — storage / DDL
- Add a **`lean_mode boolean NOT NULL DEFAULT false`** at the **utility × reporting-period** grain —
  natural home is **`report_periods`** (already the per-submission record the BLO drives). This gives
  per-period control for free (a DAO may engage some periods, not others). *(Optional convenience: a
  utility-level default so the BLO needn't re-toggle every period — v2.)*
- No new status values; no `data_entries` structural change beyond what already exists
  (`updated_by_id` already captures who entered — used for the audit in §5).

### #2/jolly (me) — workflow model / transition logic
- The entry writer reads `report_periods.lean_mode`. In lean mode: set the entry's `status_id` to
  **`Reviewed (4)`** on save **unless** the KPI safety net (§ #3 below) flags it, in which case leave
  it at **`Entered (3)`** and mark it for attention.
- A **bulk "advance to Reviewed"** action so any residual DAO-`Entered` rows (e.g. a DAO started, then
  stopped) can be vouched in one pass when the BLO takes over.
- Enforce that lean mode never bypasses **CEO approval** — the `Reviewed → Approved` gate is untouched.

### #10 — roles / permissions
- Only the **BLO** role may toggle `report_periods.lean_mode` and may **enter data in lean mode**
  (in lean mode the BLO is authoritatively both enterer and reviewer).
- Confirm the role model exposes "does this user hold BLO for this utility?" for the writer/UI gates.

### #11 — entry UI (USER-IMPACT row required)
- A **lean-mode toggle** the BLO controls when opening a period's submission ("No DAO engaged — I'm
  entering and vouching").
- **One-action entry** in lean mode (no separate review step per cell).
- An **exception queue**: the handful of entries the safety net flagged (outlier KPIs) surfaced for the
  BLO's explicit review before they advance.
- A **submission-level review/confirm** step (eyeball the computed KPIs once) before sending to CEO.
- This changes what a BLO *sees and does* → **add a USER-IMPACT.md row in the same commit**.

### #3 — KPI outlier flags (the safety net)
- Provide the per-entry signal: does this entry's resulting KPI fall outside `valid_range_min/max`,
  break a rule, or read as an outlier? This is what decides "auto-advance to Reviewed" vs "hold at
  Entered for BLO attention" in lean mode. Reuses `measure_definitions.valid_range_*` + the calculator.

## 5. Governance / audit
- Lean-mode data's only independent check is **CEO approval** — so keep it mandatory and a *real*
  sign-off, never a rubber-stamp.
- **Record that enter + review were the same actor** (derivable from `updated_by_id` at `Reviewed`
  with `lean_mode = true`) so the **BMO has visibility** into which submissions used the collapsed
  path — supports spot-audits and keeps the shortcut honest.

## 6. Sequencing
1. **#4** adds `report_periods.lean_mode` (+ optional utility default).
2. **#2 (me)** implements the transition rule + bulk-advance once the flag + #3's outlier signal exist.
3. **#10 / #11** gate + surface the toggle and exception queue; #11 adds the USER-IMPACT row.
4. **#3** supplies the outlier flag (can be a simple `valid_range` check first, richer later).

Net: for a utility with no engaged DAO, the BLO **enters once and it's vouched** — the redundant
self-review disappears — while the CEO check and a risk-proportional KPI safety net remain.
