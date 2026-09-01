# Benchmarking Report versioning & snapshots spec (DRAFT)

_Status: DRAFT for grilling — 2026-08-03, session #2. Models the PPA annual
Benchmarking Report as a first-class, versioned, snapshotted entity — the frozen
record that gives every published KPI a verifiable source, and the integrity layer
the unit-lifecycle spec (§5.1) depends on. **Greenfield: PRISM has no report entity
today (only `report_periods`).** No DDL until grilled + ratified._

Owners / consulted: #2 (drafting) · #8 (grain/silver — snapshot of derived measures)
· #3 (calculator — KPI materialisation) · #12 (access/RLS — version visibility).

---

## 1. Context

The **Benchmarking Report** is the periodic PPA cross-utility performance report.
Today it is produced ad-hoc (last one: 2023); it is **not modelled** — there is no
report table, no versioning, no snapshot. This spec makes it first-class so that
(a) every published KPI is verifiable against the source data as it stood, and
(b) the draft→comment→final workflow is supported with transparent amendments.

**Cadence: annual** (for now) — one report set per financial year, FY2024 onward.

**Lifecycle (existing business process):** BMO/consultant (currently the DEV team)
completes edits → **releases a Draft** to PPA's CEO → CEO circulates the Draft to
Utility CEOs for comment (several weeks) → flagged utilities amend inputs → the
benchmarking team refreshes → the **Final** is presented at the annual PPA meeting
(2–4 months after the Draft).

## 2. The three report versions (per annual period)

| Version | Data source | Mutable? | Visible to others? | Purpose |
|---|---|---|---|---|
| **DRAFT** | Draft **snapshot** (frozen at Draft cut-off) | No | **No** — review-only | Circulated to Utility CEOs for the comment window |
| **FINAL** | Final **snapshot** (frozen at Final cut-off, post-comment) | No | **Yes** | Official record; presented at the PPA annual meeting |
| **Updated FINAL** | **Live** data (live inputs, live-computed KPIs) | Yes (live) | **Yes — only when ≥1 input changed vs the Final snapshot** | Transparent current view; surfaces amendments since Final |

All three cover the **same** annual period's data; they differ only by *which data
they draw from*.

## 3. Input cut-off & snapshot trigger

- A **settable Input Cut-off date** per version (Draft cut-off, Final cut-off).
- At **1 second before midnight** on the cut-off date, inputs close and
  **automatically trigger the snapshot** (a scheduled job), then **notify BMO/DEV**
  that report generation can commence — a **managed user journey** (see §7).
- The Final cut-off sits **after** the comment window (captures the amendments).

## 4. Snapshot scope (Q8 — three-layer freeze)

A snapshot freezes **three** layers, in a derive relationship:

1. **Source inputs (authoritative):** `data_entries`, the **unit activation (stint)
   timeline**, the **silver-derived measures** it feeds — incl. capacity-hours
   (#8 condition 4) — and the **formula/target versions** in force. These are the
   source of truth and power the "did any input change since Final?" diff (§6).
2. **Computed KPI outputs (materialised, derived):** the gold KPIs computed **from**
   the input layer at cut-off, stored for **byte-stable** official numbers + instant
   display.
3. **Narrations + rendered document (§5):** the per-result narrations and the
   rendered PDF, frozen with the version — they cite the frozen numbers and include
   authored text that exists nowhere else, so they cannot be regenerated later.

**Why both** (not inputs-only + recompute):
- **Stability** — storing outputs pins the published numbers even if the calculator
  *engine code* later changes (a frozen formula version doesn't freeze the
  evaluator); the Final must never drift after the PPA meeting.
- **Speed/consistency** — a Final viewed by many CEOs displays instantly + identically.
- **Verifiability preserved** — because the inputs are also frozen, any KPI is
  re-derivable (`KPI = f(frozen inputs, frozen formula)`) and checkable against the
  stored value; a mismatch is itself the audit signal, and the **stored** value is
  the record.

The Updated FINAL does the opposite: **live inputs, live-computed KPIs** (no freeze).

## 5. Report artifact & narrations

The report is delivered in **two forms** (both):
- a **PDF** — the formal, circulated/presented document (immutable per frozen version);
- a **dashboard / Power BI view** — the interactive form.

**Narrations (commentaries) are first-class content.** Each result (KPI / section)
carries an authored **narration** interpreting the number — trend, cause, caveat —
authored by the benchmarking team (BMO/DEV). They are part of the report, not an
add-on.

**Frozen per version (Draft, Final).** A version's narrations are authored and
**frozen in that version's snapshot** alongside its inputs + KPIs (they cite the
frozen numbers, so they must freeze with them). A regenerated PDF is not enough —
data, KPIs, narration, and render all pin to the version.

**Content/layout is a later iteration.** Multiple improvements to the report's
content and layout are **deferred until the medallion framework is running** (its
silver/gold views are the report's data source). This spec covers *versioning,
snapshots, and the narration lifecycle* — not the final report design.

## 6. Updated FINAL — conditional visibility + amendments

- Drawn from **live** data; **only surfaced when a live-vs-Final-snapshot diff shows
  ≥1 changed input** — otherwise the Final stands alone.
- Surfaces the **amendments** since Final (which inputs changed → which KPIs moved)
  for transparency.

### 6.1 AI-assisted narration revision (Eugene, 2026-08-04)

Because the Updated FINAL runs on **live** data, KPIs move after Final — so a
narration that cited the Final number is now stale. Rather than silently diverge or
force a full manual re-read, **PRISM AI proposes narration updates**, per affected
result, showing the BMO/DEV:
- **(a) current phrasing** — the Final narration as it stands;
- **(b) suggested updated phrasing** — regenerated against the new data;
- **(c) rationale** — what changed (which input/KPI moved, by how much) and why the
  narration needs updating.

The BMO/DEV **reviews each** and accepts / edits / rejects; accepted revisions become
the Updated FINAL's narrations. Detection is driven by the **live-vs-Final-snapshot
diff** linked to the narrations that reference the changed results — so only affected
narrations surface. This turns "track every change since Final" into a **decision-
ready** review instead of a manual rewrite. Uses the **PRISM AI / Energy Expert**
layer; BMO/DEV stay the deciders (opinion-safety: AI proposes, human disposes).

## 7. Visibility / access (#12)

- **Draft:** review-only — BMO/DEV, and the PPA-CEO-circulated comment loop
  (Utility CEOs during the window). **Not** available to other viewers.
- **Final + Updated FINAL:** viewable by others (the general benchmarking audience).
- Needs RLS/route gating per version state (→ #12).

## 8. User journeys (to design)

- **Set cut-off dates** (Draft, Final) — who, where, guardrails.
- **Cut-off fires** → snapshot job runs → **notify BMO/DEV** "ready to generate".
- **Generate report** from the snapshot → **release Draft** to PPA CEO → circulate.
- **Comment window** → utilities amend inputs → refresh.
- **Final cut-off** → snapshot → generate + present Final.
- **Updated FINAL** surfaced automatically when inputs drift from Final.

## 9. Relationships

- **Unit-lifecycle spec §5.1:** this feature is what freezes published KPIs;
  stints stay live, integrity comes from these snapshots. Until this ships, there is
  no frozen record (stated interim gap in §5.1).
- **Medallion/gold (#8):** snapshots capture gold KPI outputs + silver-derived
  inputs (capacity-hours).
- **Calculator (#3):** the KPI materialisation at cut-off uses the calculator over
  the frozen inputs.
- **PRISM AI / Energy Expert:** powers the Updated-FINAL narration-revision proposals
  (§6.1) — current vs suggested phrasing + rationale, for BMO/DEV decision.

## 10. Open questions (next grilling)

- [ ] **Snapshot storage model** — how is a snapshot physically materialised +
      retained (a versioned copy of the input + KPI rows per report version)? Scale,
      retention, immutability.
- [ ] **Report entity scope** — one **cross-utility** report per FY (all members in
      one artifact), reviewed per-utility? Confirm.
- [x] **Cut-off scope** — RESOLVED: a **single global** cut-off date per version
      (Eugene, 2026-08-04).
- [ ] **Change-detection granularity** — what counts as "an input changed vs Final"
      (any `data_entry`/stint/derived-measure delta for any utility)? Drives Updated
      visibility.
- [x] **Report artifact** — RESOLVED (§5): **both** a PDF (formal) and a
      dashboard/Power BI view, with per-result **narrations** as first-class content.
      Content/layout improvements deferred to post-medallion.
- [ ] **Backlog** — FY2024 & FY2025 need generating (none since 2023).
- [ ] **Scheduler** — the 23:59:59 cut-off trigger mechanism.
- [ ] **Approval vs cut-off** — relationship between per-utility data-entry Approval
      status and the report cut-off/snapshot.

## 11. Decisions log

- Cadence = **annual** (Eugene, 2026-08-03).
- **3 versions** Draft/Final/Updated-Final (Eugene).
- Snapshot fires at **input cut-off**, before generation (Eugene).
- **Q8** = snapshot **source inputs** (authoritative) **+ materialised KPIs**
  (derived) **+ narrations/rendered document** — **three-layer** freeze (Eugene,
  2026-08-03/04).
- Updated FINAL = **live**, surfaced **only when inputs changed vs Final** (Eugene).
- Visibility: Draft review-only; Final + Updated FINAL viewable by others (Eugene).
- **Cut-off** = single **global** date per version (Eugene, 2026-08-04).
- **Artifact = both** PDF **and** dashboard/Power BI; **narrations first-class** &
  frozen per version (Draft/Final); content/layout deferred to post-medallion
  (Eugene, 2026-08-04).
- **Updated FINAL narration revision is AI-assisted** — PRISM AI proposes current vs
  suggested phrasing + rationale; BMO/DEV decide (Eugene, 2026-08-04).
