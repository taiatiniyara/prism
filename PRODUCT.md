# Product

<!-- impeccable:product-schema 1 -->

> Durable product truth for PRISM, read by design tooling and agents before any
> interface work. Facts only: no colours, fonts, components or page concepts
> (those live in the code today and in `DESIGN.md` once recorded). Domain
> vocabulary is defined in [CONTEXT.md](CONTEXT.md); this file does not repeat it.
> Captured by interview with Eugene on 2026-09-18. Owner: stream #11 (UI).

## Platform

web

## Users

**Primary user: utility data staff.** When two users' needs conflict on a
screen, this group wins (confirmed by Eugene).

- **Who:** the Utility Liaison (`BLO`) and the data officers (`DAOF`, `DAOH`,
  `DAOO`, collectively `DAO*`) at a Pacific electricity utility that is a PPA
  member.
- **Job:** enter, correct and submit hundreds of measured values per report
  period, across service areas, power stations and units, then see them through
  review and approval.
- **Situation (all confirmed):**
  - **Slow or unstable internet.** Page weight, font payloads and chatty
    screens are a real cost. A dropped connection mid-entry is plausible.
  - **Older office PCs and small screens.** Dense tables must fit and stay
    legible at about 1366 px wide.
  - **Occasional use.** Many users touch PRISM only around the annual reporting
    cycle. They forget how it works, so the screen has to re-teach them.
  - Desk-based. Phone and tablet use was **not** selected as a working
    condition.
- Small utilities often have no engaged data officer, so the `BLO` both enters
  and reviews (see `docs/lean-data-entry-workflow-spec.md`).

**Other audiences (from the repo; they yield to the primary user on conflict):**

- **PPA benchmarking officer (`BMO`):** configures measures, KPIs, relevance and
  managed lists; reviews and approves submissions; prepares the annual
  benchmarking report.
- **Utility executives (`CEO`, `EXE`, `MGR`):** read scorecards, KPI results and
  embedded Power BI dashboards. They rarely enter anything.
- **External subscribers and registrants (`EXT`, consumer tiers):** donors,
  regulators, consultants and allied members who consume benchmarking outputs
  under the tiered access plans.
- **PPA finance (`PPA_FIN`, planned):** records manual card payments for
  subscriptions.
- **Developer / ops (`DEV`):** platform administration, utility-context
  switching, and the in-app DEV design and form tooling.

## Product Purpose

PRISM is the Pacific Power Association's benchmarking platform for Pacific
utilities. Utilities submit operational, financial and HR measures each report
period. The platform computes KPIs from them, compares each utility with its
peers and with PPA targets, and presents the results as scorecards, KPI reviews
and Power BI dashboards. It replaces a process in which the annual benchmarking
report was assembled by hand.

**Success (all confirmed by Eugene):**

1. **Complete, on-time submissions.** More utilities submit full, correct data
   each period, with less chasing by the PPA secretariat.
2. **Faster annual report.** Data, KPIs and charts come out of the platform
   ready to use.
3. **Utilities self-serve analysis.** Utilities use their own scorecards and
   comparisons during the year, not only at report time.
4. **Paid access earns revenue.** Tiered subscriptions for external consumers
   become a working income stream for PPA.
5. **The AI assistant is intelligent and access-safe.** Its answers are
   genuinely useful, and it only ever answers within what that user's
   access-control rules allow.

## Positioning

- PRISM is run by the regional industry body itself. PPA sets the targets, owns
  the measure catalogue and supplies the balanced-scorecard master template, so
  peer comparison happens inside the membership that produces the data.
- It is built for Pacific island utilities specifically: small teams, many
  small grids per utility, unit-level generation data, and island connectivity.
- One platform carries the whole chain: data entry, review and approval, KPI
  computation, scorecards, the annual report feed, and paid external access.

## Operating Context

- **Annual reporting cycle.** Work peaks around each report period. Entries move
  through a workflow of Pending, Entered, Reviewed, Approved. Unfilled
  pre-created rows are the gap report.
- **Per-period participation.** A utility's benchmarking data is collected and
  computed only for periods it opts into.
- **Hierarchy.** Utility, service area, power station, unit. Generation and
  storage measures are collected at unit level; higher levels are derived.
- **Review from a KPI perspective.** Reviewers judge entered values by the KPIs
  they produce, not value by value.
- **Balanced scorecard.** PPA master template with a per-utility overlay.
- **Power BI.** Dashboards are embedded and fed from governed fact views.
- **AI assistant.** A floating chat assistant is available to signed-in users
  on every screen.
- **Settings-driven administration.** Most reference data (roles, users,
  organisations, countries, service areas, units, measures, managed lists,
  relevance) is maintained in-app by `BMO` and `DEV`, not by deploys.
- **Legacy system.** `prismdashboard.org` is PRISM 1 and is the migration data
  source. PRISM 2 runs at `dev.prismdashboard.org` on a single database that
  becomes production.

## Capabilities and Constraints

- **Fully authenticated.** Apart from the landing and sign-in pages, every
  surface is behind login. Access is role-based today and moves to plan- and
  seat-based entitlements under the tiered access design.
- **Access control is a product rule, not only a security one.** Every surface,
  including the AI assistant and exports, must respect the viewing user's
  organisation scope and role. A utility never sees another utility's
  unpublished data.
- **`not available` is not zero.** A missing answer propagates to the KPI as
  not available. Interfaces must never present a gap as a 0.
- **Multi-sector is coming.** Electricity is the only live sector. Water and
  sanitation follow. Sector-specific words (Grid, Supply Zone, Catchment) come
  from the terminology layer in `lib/terminology`, never hardcoded strings.
- **Terminology is governed.** Use the terms in [CONTEXT.md](CONTEXT.md) and
  `docs/naming-change-log.md`. Examples: Unit, not Energy Resource; Measure
  Definition, not Input Definition.
- **Look and feel is centrally owned.** Stream #11 owns branding. Colours are
  semantic tokens, editable in-app by `DEV` at Settings → Design, so palette
  changes need no deploy. New UI uses the semantic tokens, not raw colour
  utilities.
- **Stack (existing, not a choice to reopen):** Next.js App Router, React,
  TypeScript, Tailwind CSS v4, shadcn/ui on Radix, lucide icons, Drizzle on
  PostgreSQL, Better Auth, embedded Power BI.
- **Language:** English only. No translation layer is required. Write labels
  plainly for readers who use English as a second language.
- **Open decisions:**
  - Mobile support level. Not a confirmed working condition. No key screen has
    been declared mobile-critical.
  - Dark mode. Tokens exist for it. The toggle is deferred until remaining raw
    colour utilities are migrated.

## Brand Commitments

- **PRISM keeps its own identity** (confirmed). Stream #11 stewards it. PPA
  appears as the owner by name and logo only. PPA's corporate brand does not
  govern PRISM's look.
- **Names:** "PRISM"; owner "Pacific Power Association (PPA)".
- **Voice:** institutional, plain, exact. The audience includes CEOs and
  regulators. No marketing tone inside the app.
- The incumbent visual system (dark navy shell, amber brand accent, IBM Plex
  Sans and Mono, semantic status colours) is recorded here only as the existing
  identity to preserve. Its specification belongs in `DESIGN.md`.

## Evidence on Hand

- Real domain glossary: [CONTEXT.md](CONTEXT.md).
- Real specs for every major workflow under `docs/`, including
  `data-entry-ux-requirements.md`, `lean-data-entry-workflow-spec.md`,
  `tiered-access-and-registration-spec.md`, `bsc-builder-spec.md` and
  `calculator-engine-spec.md`.
- User-journey ledger: `docs/USER-IMPACT.md`.
- Live data from participating member utilities on the running system.
- Real landing-page copy in `app/page.tsx` describing PPA's benchmarking
  history.
- **Absent, do not fabricate:** testimonials, customer logos, usage statistics,
  pricing figures, awards, and any claim about member counts or outcomes that is
  not in the repo or supplied by Eugene.

## Product Principles

1. **The data officer's time is the scarcest resource.** Reduce entry burden
   before adding capability. If a screen makes submission slower, it is wrong.
2. **The screen re-teaches itself.** Assume the user last saw it a year ago.
   Labels, empty states and errors carry the instructions; nobody should need a
   manual to submit.
3. **Light and resilient by default.** Design for a slow link and an old laptop.
   Weight, round trips and lost work are product defects.
4. **Never misstate the data.** Gaps stay visible as gaps, status is never
   conveyed by colour alone, and every number is shown in its real unit and
   period.
5. **Access rules apply everywhere.** What a user may see is the same in
   tables, exports, dashboards and AI answers.

## Accessibility & Inclusion

- **Standard: WCAG 2.1 AA** (confirmed).
- Full keyboard operation with visible focus, including dense data-entry
  tables, dialogs and the DEV tooling.
- Text contrast at least 4.5:1, large text at least 3:1.
- Status, validation and workflow state are never conveyed by colour alone.
  Pair colour with text or an icon.
- Screen-reader labels on all inputs, including per-cell data-entry inputs.
- Plain English for second-language readers. Expand acronyms on first use in
  help and empty states.
