# PRISM 2 — User-Impact Ledger

**What this is:** the journey-state tracker. WORKSTREAMS.md tracks *stream* state and PENDING.md
tracks *git/DB* state; this file tracks **who has to do something differently** after a change
lands — so user instructions, configuration guides, and training material can be produced from it
per role instead of reconstructed from memory at release time.

> Absolute path: `C:\Users\eugen\prism\docs\USER-IMPACT.md`
> Created 2026-07-28 on Eugene's direction (proposed by #8).

## Protocol

**If your change alters what any user sees, enters, or configures — add a row here in the same
commit.** Written by the stream that lands the change (you understand it best, freshest). Keep
rows terse; link the spec/PR. Instruction writing happens later, per role, from this ledger —
the row is the obligation, not the manual.

**Audit:** #15 (pendings tracker) reconciles this ledger against merged journey-affecting changes
on each refresh — a landed change with no row is a gap to flag. **Owner for the eventual
instruction-writing pass:** TBD by Eugene (natural candidates: #1 project mgt or #11 UI).

**Roles vocabulary** (from the tiered-access spec + board): `DAO` data-entry officer · `BLO`
Utility Liaison · `org-admin` utility org admin · `BMO` benchmarking-mgmt admin (PPA) · `PPA_FIN`
finance role · `DEV` developer/ops · `subscriber` consumer-tier user · `registrant` prospective
user.

**Status legend:** ⬜ instructions not written · 📝 drafted · ✅ published · 📣 comms sent ·
🕐 change not yet built (row is a forward obligation)

---

## Ledger

| # | Change (ref) | Landed? | Roles | Journey delta (before → after) | Instructions / config needed | Status |
|---|---|---|---|---|---|---|
| 1 | Admin MFA — TOTP enrolment + per-session challenge (#12, applied to dev DB 2026-07-26) | ✅ dev | BMO, DEV | Log in with magic link only → must enrol an authenticator app once, then pass a TOTP challenge each session; unverified admins get 401 on admin APIs | Enrolment walkthrough; lost-device/recovery procedure; note the full-screen `/two-factor` gate; PROD needs `scripts/sql/2026-07-26-admin-mfa.sql` first | ⬜ |
| 2 | Sector terminology label layer — electricity `service_area` renders as **"Grid"** (PR #58) | ✅ | all UI users | Screens said "Service Area" → now say "Grid" (display-only; data and URLs unchanged) | One glossary note ("Grid = service area, electricity sector"); BMO heads-up that labels are data-editable (Grid→Network etc.) | ⬜ |
| 3 | Sentinel entities deleted — "All Utilities" org, "All Countries", "All Service Areas", All/Others sub-regions (one-shot, 2026-07-27) | ✅ dev DB | BMO, analysts | Pickers offered "All …" pseudo-entries; cross-utility numbers could sit under "All Utilities" → pickers list only real entities; "all X" views come from benchmarking/rollup screens, never a selectable fake entity | Note in admin guide: aggregates are computed views; if an old workflow "entered data against All Utilities", its replacement is the per-utility entry + automatic rollup | ⬜ |
| 4 | API key tiering — `API_KEY_SENSITIVE` for users/pbiRls/AzureToken endpoints (PR #73) | ✅ | DEV | One `API_KEY` for all service endpoints → sensitive endpoints prefer `API_KEY_SENSITIVE` (falls back to `API_KEY`, zero breakage) | Deployment/env guide: set both vars, rotate independently; Power BI ingestion unaffected but document which key it uses | ⬜ |
| 5 | Registration intake quiz + org picker (#10 spec §5.4, designed) | 🕐 not built | registrant, org-admin, BMO | Free-text "who are you / why" + free-text org name → structured purpose/engagement quiz + pick-or-propose org from live list (M49 country picker on propose-new) | Registrant-facing help text; BMO triage guide (structured requests, dedup candidates, routing); org-admin approve/decline flow | 🕐 |
| 6 | Grain-based data entry — screens target the measure's declared strata; virtual generators retired (#8/#11 pass, gated on #2 DDL) | 🕐 not built | DAO, BLO | Station/org/country data entered against "virtual generator" rows → each measure's screen targets its real level (unit / station / grid / organisation / country); virtual rows gone from pickers | Data-collector guide rewrite (the big one): where each measure now lives, what the level means, why virtuals disappeared; per-utility onboarding note when virtuals are retired | 🕐 |
| 7 | Unit lifecycle stints — capacity/location as state changes, not per-period entry (`unit-lifecycle-spec.md` draft; awaiting Eugene's 2 confirms) | 🕐 spec draft | DAO, BLO, BMO | Type rated capacity per unit per period; moves/derates invisible → record a stint event (move / derate / uprate / deactivate / reactivate) when it happens; capacity KPIs computed from stint history | How to record each event type incl. the derate-after-repair case; what seed stints mean for history; what the entry screen no longer asks; BMO unit-config guide | 🕐 |
