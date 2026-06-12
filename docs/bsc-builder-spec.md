# BSC Builder — Specification

> Status: **Approved (design)** · Owner: product + engineering · Last updated: 2026-06-10
> Supersedes: the existing **BSC Strategy Builder** (4-level free-text model). Ships alongside it first; old builder retired in a follow-up.

## 1. Purpose

A new **"BSC Builder"** surface lets each Utility build its Balanced Scorecard from a shared, PPA-maintained **Master Template**. The BSC is a **strategy-formulation tool** — it encourages utilities to develop holistic strategy across the four perspectives — and is **not** a benchmarking artifact. It therefore favours flexibility (custom nodes) over strict cross-utility comparability.

Source of the framework: `BSC Hierarchy Structure.pdf` (DHI/PPA).

## 2. Two-part model

1. **Master Template** — the canonical PPA framework, shared across all utilities. Maintained centrally.
2. **Per-Utility overlay** — each Utility selects which optional template nodes apply and adds its own custom nodes, then authors the lower levels. **Selecting = building.**

## 3. Hierarchy (8 levels)

| # | Level | Source | Cardinality / notes |
|---|---|---|---|
| 1 | Perspective | Fixed (4: Financial, Customer, Processes, Learning & Growth) | — |
| 2 | Overall Objective | Fixed (1 per perspective) | — |
| 3 | Key Focus Area | Template + custom | many |
| 4 | Strategic Objective | Template + custom | many |
| 5 | Strategic Lever | Template + custom | many — **prescriptive template ends here** |
| 6 | Specific Objective | Utility-authored | many per Lever; qualitative aim, **no measure of its own** |
| 7 | Initiative / Project | Utility-authored | many per Specific Objective (it may take several to move one objective) |
| 8 | KPI (+ trajectory + targets) | Selected from KPI list (incl. custom) | many per Initiative |

Rules:
- KPIs **always** hang under an activity (Initiative or Project). At least one is required under a Specific Objective before KPIs can be assigned.
- The **same KPI may appear under multiple activities** (a real project often pushes several measures; several activities push one measure). For roll-up/scoring, KPIs are **deduped** so they aren't double-counted.
- The Specific Objective carries no measure of its own; achievement is derived (later) from its activities' KPIs if needed.

### 3a. Initiatives vs Projects (level 7)

Level 7 activities carry a `kind` discriminator: **`initiative`** (ongoing improvement effort) or **`project`** (discrete, time-bound work). Both sit under a Specific Objective and carry KPIs identically — the distinction is a **type on the same level**, not a separate hierarchy level (they're structurally identical, so splitting them would duplicate machinery for no gain).

- **Initiative**: name + description only.
- **Project**: name + description **plus light strategic fields** — `start_date`, `target_completion_date`, and `status` (planned / in_progress / complete / on_hold). Deliberately *not* a full project-management module (no milestones, % complete, budget) — BSC stays a strategy tool.
- UI: separate **"+ Initiative"** and **"+ Project"** buttons under each Specific Objective.
- KPIs/targets/trajectory work the same for both kinds.

## 4. Template semantics

- **Mandatory** node = pre-ticked and **locked** — present on every scorecard, cannot be unticked.
- **Optional** node = unticked by default; Utility opts in.
- **Red text in the PDF has no meaning** — ignore it.
- **Custom nodes** allowed at **any** level. They live in the Utility's overlay, never in the shared template.

## 5. Trajectory & targets

- **Trajectory** (Increase / Decrease / Same) is a short summary of the target trend. It is a **per-(Utility, KPI)** value — set once and repeated everywhere that KPI is used in that Utility's BSC.
- **Targets** use the **existing** capability (`app/settings/kpi/targetsEditor.tsx` → `kpiDefinitions.targets`, keyed by `utility_id`, `year`, optional `month`/"fy"). Granularity of **year + optional month is adequate**; there is **no separate target end-date** field — multiple year rows express the trajectory over time.
- Trajectory is stored **with** the targets (per-Utility, per-KPI), not per-placement.
- Targets + trajectory are editable **inline** in BSC Builder, writing through to the **same shared store** used by Settings → KPI. Editing in either place is equivalent and propagates to every placement.

## 6. Behaviour

- **Cascade (select):** ticking a child auto-includes its ancestors (ancestors can't be excluded while a descendant is active).
- **Cascade (deselect):** unticking a parent that has selected children or authored content **warns and cascades** via a confirm dialog ("This will remove N objectives and M KPIs"). Mandatory nodes can't be unticked.
- **Save:** autosave for selections/tree edits; **destructive cascades require an explicit confirm** (not silent autosave).

## 7. Two modes (toggle within the tab)

1. **Build** — full template skeleton: mandatory pre-ticked/locked, optional nodes listed and tickable, "+ Add custom…" at each level; author Specific Objective → Initiative → KPI/trajectory/targets. Implemented as an **indented collapsible tree** with branch styling.
2. **BSC Preview** — read-only view showing **only mandatory + selected/populated nodes** (unselected optional nodes hidden). This is the basis for the later **Strategy Map** merge.

## 8. Data model (normalized, evergreen)

A Utility's scorecard is a **single evergreen structure** (no per-period structural versioning). The time dimension comes from period-keyed targets/actuals. Audit via `updated_at` / `updated_by`.

**Template side (admin-editable):**
- `bsc_template_nodes` — self-referencing tree: `id`, `parent_id`, `level`, `label`, `is_mandatory`, `ord`, `is_active`.

**Overlay side (per-Utility):**
- `bsc_utility_nodes` — selections + custom nodes: `utility_id`, `template_node_id` (nullable for custom), `parent_node_id`, `level`, `label`, `ord`.
- `bsc_specific_objectives`
- `bsc_initiatives`
- `bsc_kpi_links` — → `kpiDefinitions`, placement under an initiative.
- **Trajectory** stored alongside per-Utility KPI target data (shared per KPI).

The legacy `bsc` JSON table is **left intact** during the build; retired once BSC Builder supersedes the Strategy Builder.

Naming: route + tables use neutral names (e.g. `new-bsc`, `bsc_*`); the UI label is "BSC Builder". Avoid baking "new" into table names.

## 9. Roles

| Action | Roles |
|---|---|
| Maintain master template (`/settings/bsc-template`) | **DEV, BMO** |
| Build / edit a Utility's scorecard overlay | **CEO, EXE, MGR, BLO** |
| Read / oversight of Utility scorecards | DEV, BMO (assumed; for support) |

Template change propagation: new **mandatory** nodes auto-appear on all scorecards; new **optional** nodes become available (unselected); existing custom nodes and selections are never retroactively altered.

## 10. Admin template editor

Lives under **Settings** (`/settings/bsc-template`), visible to **DEV/BMO only** — add/edit/reorder nodes and flip mandatory flags. Seeded initially from the PDF; full in-app editing supported (not code-only).

## 11. Build sequence

1. Schema + migration (normalized tables + trajectory on target store).
2. Seed master template from PDF (`scripts/seed-bsc-template.ts`).
3. Services + API (template read, overlay CRUD, reuse KPI options, inline target/trajectory write-through, new authz).
4. BSC Builder UI (indented tree builder, cascade, custom nodes, lower-zone authoring, autosave).
5. BSC Preview toggle (read-only filtered view).
6. Admin template editor (`/settings/bsc-template`).
7. Tests + wiring alongside existing Strategy Builder.

## 12. Deferred / out of scope (v1)

- Per-period structural versioning / historical snapshots.
- Per-placement targets (targets remain shared per-Utility-per-KPI).
- Perspective filtering of the KPI picker (no category→perspective mapping today; flat searchable list for now).
- Retiring the legacy BSC Strategy Builder (follow-up after sign-off).

(The Strategy Map — previously deferred — is now specified in §13.)

## 13. Strategy Map (Tier-1)

A one-page, board-level view derived from the same overlay + Preview filter. It is **not** a render of the full 8-level tree: it collapses the hierarchy to a 2–3 level "spine" and adds the one thing the tree can't express — **cause-and-effect between objectives**.

### 13.1 What's on the map

- **Bands** = the 4 Perspectives (Financial top → Customer → Processes → Learning & Growth bottom).
- **Nodes** = utility nodes flagged as **map nodes**, restricted to the **Preview set** (mandatory or selected/populated). Normally `strategic_objective` level; **Financial promotes its `key_focus_area`** (its level-4 labels are full sentences). "On map" is therefore an explicit flag, not a level rule.
- **Theme columns** (optional) = group a band's nodes by their `key_focus_area` ancestor.
- **Edges** = directed cause-effect arrows between map nodes (`source drives target`). Per-Utility — each utility authors its own. Shown only when **both endpoints are currently visible** map nodes.
- KPIs are **not** on the map — they stay in the companion scorecard table (objective → measure → target).

### 13.2 Data model (migration `0028_bsc_strategy_map.sql`)

- `bsc_objective_link` — per-Utility edges: `utility_id`, `source_node_id`/`target_node_id` → `bsc_utility_node` (cascade delete), `relation` (`drives` default; `enables`/`constrains` reserved), `note`, `ord`. Unique on `(utility_id, source, target)`.
- `bsc_template_node` gains `map_label` (short caption) + `is_map_node` (PPA default, `not null default false`).
- `bsc_utility_node` gains nullable overrides `map_label`, `is_map_node` (null = inherit template), and `map_x` / `map_y` (drag-to-position; null = auto-layout).

Resolution: effective label = `coalesce(utility.map_label, template.map_label, label)`; effective on-map = `coalesce(utility.is_map_node, template.is_map_node, false)` (custom nodes use the utility value).

### 13.3 Layout

Auto-layout by (perspective band, theme column, `ord`). When `map_x`/`map_y` are set they override auto-layout for that node — written only when a user drags. **Both ship in v1.**

### 13.4 Edge rules

| Rule | Where | Action |
|---|---|---|
| `source ≠ target` | service | reject |
| both endpoints same utility | service | reject |
| duplicate edge | unique index | reject / upsert no-op |
| endpoint not a map node | service | reject (flag the node first) |
| introduces a cycle | service | **warn, allow** (map is usually a DAG; feedback loops not forbidden) |
| skip-level link (e.g. L&G → Financial) | — | allowed |

### 13.5 Roles

Authoring edges + `map_label`/position overrides: **CEO, EXE, MGR, BLO** (same as overlay editing). Template `map_label`/`is_map_node` defaults: **DEV/BMO** via `/settings/bsc-template`. PPA seeds defaults in `seed-bsc-template.ts`; edges are never seeded (per-Utility).

### 13.6 Implementation (backend — done)

Read model + link CRUD live in dedicated modules (kept separate from the builder's files):
- `new-bsc/strategy-map.types.ts` · `strategy-map.repository.ts` (read model + link CRUD + node display overrides) · `strategy-map.service.ts` (authz wrappers) · `strategy-map.client.ts`.
- API: `GET /strategy-map`; `POST /strategy-map/links`; `PUT|DELETE /strategy-map/links/[id]`; `PUT /strategy-map/nodes/[id]` (label/on-off/drag position). Validators in `_lib/strategy-map.validators.ts`.
- The read model resolves effective `map_label`/`is_map_node` (`coalesce(utility, template, …)`), walks ancestors for band (perspective) + theme (key focus area), filters edges to currently-visible endpoints, and exposes `x`/`y` for layout.

Backfill: `scripts/backfill-bsc-map-defaults.ts` applies the §13 map defaults onto an already-seeded template (the seed is idempotent and skips existing rows). It matches by `(level, label)` against the canonical seed labels; admin-edited templates that have diverged need their flags reconciled directly. **Pending: the Strategy Map UI** (auto-layout renderer, drag-to-position, edge drawing).
