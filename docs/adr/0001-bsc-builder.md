# ADR 0001 — Replace the BSC Strategy Builder with a template-driven BSC Builder

- Status: **Accepted**
- Date: 2026-06-10
- Related: [docs/bsc-builder-spec.md](../bsc-builder-spec.md)

## Context

The original Balanced Scorecard feature uses a 4-level, entirely free-text model — Perspective → Strategic Objective → Key Initiative → KPI — stored as a single JSON blob in the `bsc` table. DHI/PPA provided a canonical BSC framework (`BSC Hierarchy Structure.pdf`) that is deeper (8 levels) and mostly prescriptive down to the Strategic Lever, with each Utility selecting which optional branches apply and authoring the lower levels themselves.

The free-text builder cannot represent a shared, governed framework, nor the mandatory/optional distinction, nor the deeper hierarchy.

## Decision

Build a new **BSC Builder** as a **Master Template + per-Utility overlay** model, using **normalized relational tables** (not a JSON blob). "Selecting from the template = building." It ships alongside the legacy Strategy Builder and will replace it after sign-off. See the spec for the full hierarchy, semantics, roles, and data model.

Key choices:
- **Template vs overlay split.** A shared, admin-editable `bsc_template_nodes` tree; per-Utility selections + custom nodes + authored lower levels in separate overlay tables.
- **Normalized tables over JSON.** Required for the admin editor, KPI-link queries, scoring roll-ups, and the eventual Strategy Map merge.
- **Custom nodes at any level.** BSC is a strategy tool, not a benchmarking artifact, so per-Utility extension is allowed and governance is light.
- **Trajectory + targets shared per-(Utility, KPI).** Reuse the existing targets store/editor; add trajectory beside it. No per-placement targets in v1.
- **Initiatives sit between Specific Objective and KPI.** Multiple initiatives may be needed to move one objective; KPIs hang under initiatives.
- **Evergreen structure.** No per-period structural versioning; time series lives in period-keyed targets/actuals.
- **Two modes** (Build / BSC Preview) via a toggle; Preview shows only mandatory + populated nodes.
- **Roles.** Template admin = DEV/BMO; Utility build = CEO/EXE/MGR/BLO.

## Consequences

- More tables and migrations than the legacy approach, and a seed step from the PDF.
- A second authz audience (template admins vs Utility builders) to maintain.
- The legacy `bsc` table and Strategy Builder remain temporarily, to be retired in a follow-up.
- Per-placement targets, structural history, and KPI-picker perspective filtering are explicitly deferred.
