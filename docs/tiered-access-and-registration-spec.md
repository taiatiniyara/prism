# PRISM 2 — Tiered Access, Subscriptions & Registration (spec)

**Status:** 🚧 design in progress (grilled with Eugene 2026-07-26; several decisions locked, a few parked — see §9). Not built.
**Owner stream:** board #10 "Tiered access / tenancy" — **now owned/driven end-to-end by the "PRISM 2 access & registration" session** (Eugene, 2026-07-26): registration & routing (§5) *and* the full tiered-access model (§2 orgs, §3 seats/subscriptions, §4 plans, §6 payment, §7 expiry/admin, §8 RBAC). Overlaps #8 on the `organisations` model — coordinate before any org DDL.
**Source:** `…/Phase 2/10 Implementation/Migration/Data/FINALISED Tiered Access Plans 260803.xlsx`, sheet **"Finalised"** (supersedes 20260728.xlsx → 20260707.docx). Approved: 6 plans + a membership-category label, per-dashboard view / download-charts / download-tables rights, "Teaser Samples" replacing "Public KPI".

> **Why this exists.** PRISM 2 has **six access plans** — three free (Public, Utility, Allied Member) and three paid consumer tiers (Per Project, Basic, Premium) — layered on the existing *provider* (utility) data-collection model. The current schema can't express subscriptions, seats, time-boxed access, per-dashboard rights, or multi-org membership. This spec defines the target model.

---

## 0. The plans (from `FINALISED Tiered Access Plans 260803.xlsx`, sheet "Finalised")

The approved sheet lists **8 columns**, but they collapse to **6 plans + a membership-category label**: the three member columns (**Allied**, **Affiliate Dev Partners**, **Affiliate Others**) have **identical** entitlements / seats / term, so they are **one `member` plan** — *which kind* of member is a governance **label on the org** (`ppa_membership_type_id`, §2/§4), not a separate plan. (Supersedes 20260728: member seats now **10 / 365d** (were unlimited); **"Public KPI" → "Teaser Samples"** and Public now gets *downloads* on it.)

| Plan | Price | Seats | Term | Relationship (§2) |
|---|---|---|---|---|
| **Public** | free | — (anon) | rolling | subscriber (the default plan) |
| **Utility** | free | unlimited | unlimited | utility |
| **Member** (Allied · Affiliate Dev Partner · Affiliate Other) | free | **10** | **365 days** | member |
| **Per Project** | US$500 | 1 | 60 days | subscriber |
| **Basic** | US$2,200 | 5 | 365 days | subscriber |
| **Premium** | US$3,500 | 10 | 365 days | subscriber |

**Entitlement matrix — three rights per dashboard: View / Download-Charts / Download-Tables** (✓ = granted). Authoritative source for §3.2.

| Dashboard / report | right | Public | Utility | Member | PerProj | Basic | Premium |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Annual Benchmarking Reports (PDF) | view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Teaser Samples** | view | ✓ | | | | | |
| | dl-charts | ✓ | | | | | |
| | dl-tables | ✓ | | | | | |
| Utility-Specific KPIs | view | | ✓ | | | | |
| | dl-charts | | ✓ | | | | |
| | dl-tables | | ✓ | | | | |
| Benchmarking / Country / Sub-regional / Regional KPIs | view | | ✓ | ✓ | ✓ | ✓ | ✓ |
| | dl-charts | | ✓ | ✓ | ✓ | | ✓ |
| | dl-tables | | ✓ | ✓ | ✓ | | ✓ |

Key reads: **Public** = a **teaser funnel** — Teaser Samples (view + downloads) + the PDF report, nothing else; the on-ramp that converts a non-member to a paid plan. **Utility** = its own Utility-Specific KPIs + full benchmarking family, all rights. **Member / Per Project / Premium** = benchmarking family view **+ both downloads**. **Basic** = benchmarking family **view only, no downloads** (its value is seats + annual term). Sector scoping (which sector's data) is orthogonal, via `benchmarking_group_member` (§2.1 / #13).

---

## 1. Decisions locked (grilling 2026-07-26)

1. **Two-axis org model** replaces the `is_utility` boolean (§2).
2. **Seat junction** — one identity can hold **concurrent** seats across orgs (WB *and* ADB *and* DFAT); each seat counts toward *that* org's cap (§3).
3. **Unify** — an individual subscriber is an **org-of-one** ("workspace"); no separate code path.
4. **Tiers are consumer-only.** Utilities and association **members** (PPA/PWWA/…) are **free**; member access is sector-scoped via the `benchmarking_group` M:N (§2.1); member entitlements TBD (§4).
5. **Multi-org effective access = act-as** — entitlements are per-seat; the user works "as" one org at a time; features (esp. download) follow the active seat (§3.3).
6. **Entitlement model (two clean halves, §3.2):** (a) `plan_entitlement` keyed by `(plan, dashboard)` with **three independent rights** — view / download-charts / download-tables (§0 matrix); **entitlement changes forward-apply to all users on the plan** (Eugene 2026-07-28). (b) **Commercial terms** (price / seat_cap / term) live in effective-dated **`plan_version`** snapshots that a subscription **locks** to, so a repricing never touches existing subs (decided 2026-07-27 via #11).
7. **Uniform access** within a subscriber org — "admin" is a management flag on a seat, not a higher tier.
8. **Payment inside PRISM**: **manual now** — PPA Finance charges the card in **PPA's bank virtual terminal** (out-of-band); **PRISM never touches the PAN/CVV**, it only records the result. **DEV-toggled gateway switch** + config strings for later (§6).
9. **48h reminder → admin + consultant**, lead time **BMO-configurable**, on both seat-expiry and subscription-renewal (§7).
10. **Join-existing routing** → org admin first (recommend adding to their quota), **cc BMO**; if org admin rejects, **BMO can revert the user to the `public` (default) plan** (§5).

---

## 2. Organisation model — two axes (replaces `is_utility`)

`is_utility` is a single yes/no switch; it can't distinguish the new org classes (utility vs PPA-member vs paying subscriber — all `is_utility=false` today except utilities). Split into **two independent fields**:

**Axis 1 — `relationship` (drives the *access model*).** A new **reference table** `organisation_relationships` with a FK from `organisations.relationship_id`. Its rows (the stable `code` is what code branches on):

| `code` | meaning | pays? | access |
|---|---|---|---|
| `utility` | data provider (submits benchmarking data) | no | provider role model (BLO/DAOs) + free member dashboards for its sector(s) |
| `member` | non-utility association member (e.g. PPA/PWWA associate) | no | free member entitlement set, **scoped to the sector(s) of the associations it belongs to** |
| `subscriber` | buys a consumer plan (donor, consultant, gov, …) | yes | plan entitlements |
| `administrator` | **PPA** (org 18) — the platform owner/operator (BMO, PPA_FIN staff) | no | role-based platform access; **excluded from subscription / payment / plan flows** |
| `developer` | **Innov8 Pacific** (org 12) — the platform developer/vendor (DEV staff) | no | role-based platform access; **excluded from subscription / payment / plan flows** |

> **`administrator`/`developer` (decided 2026-08-03) are the internal/platform classes** — the two orgs that *run and build* PRISM rather than consume it. Their staff get access via **role** (DEV/BMO/PPA_FIN), never via a plan, so both are hard-excluded from the subscription/payment/plan machinery. Note: the org-level `relationship = administrator` is **distinct from** the per-seat `seat.is_admin` flag (a management capability within any org, §3.1) — different levels, don't conflate. `entity_type` still describes what kind of org each is (PPA = association, Innov8 = consultancy/vendor).

> **`member` replaces the old `ppa_member` value (decided 2026-07-27).** Which association(s) an org belongs to — and therefore which *sector* its free access covers — is **not** encoded here; it lives in the sector-tagged `benchmarking_group` M:N below. `relationship` says only *how* the org relates to PRISM (provider / free-member / paying); the cohort + sector detail is the M:N's job. An org is single-valued on this axis (a utility that is also a PPA member is `utility`; its PPA membership is a `benchmarking_group_member` row).

- **Stored as a dedicated reference table + FK (decided 2026-07-27), mirroring `sectors` (PR #65).** `organisation_relationships { id (explicit, not serial), code varchar unique — 'utility'|'member'|'subscriber'|'administrator'|'developer', name, is_active }`; `organisations.relationship_id → organisation_relationships.id`. Integrity comes from the **FK** — **no CHECK constraint** (same as every other org classifier). Code branches on the stable **`code`**, never `id` or the editable `name`.
- **Why a dedicated ref table, not generic `managed_list_items`:** `managed_list_items` has no stable `code` (only a serial `id` that differs across environments and an editable `name`), so code branching on it would drift the day someone renames the row. A dedicated table carries a stable `code` — the exact pattern #13 used for `sectors` ("explicit ids… safe to reference"). It's still a table (so `name`/`is_active`/UI), still an FK (consistent with `entity_type_id` et al.) — just code-safe.
- **Migration:** seed `organisation_relationships` (utility/member/subscriber/**administrator**/**developer**); then `is_utility = true → relationship_id = (utility row)`; **PPA (org 18) → administrator, Innov8 Pacific (org 12) → developer**; all remaining → `subscriber` or `member` (BMO reviews the non-utility set once); existing `ppa_membership_type_id` values migrate into `benchmarking_group_member` rows (PPA group, electricity sector) — **⚠ under reconciliation (§9, 2026-08-03): finalised plans indicate `ppa_membership_type_id` is KEPT as the membership *class*, distinct from the sector cohort; awaiting #13**. Deprecate `is_utility` after backfill.
- Edge case (org is *both* utility and subscriber) is out of scope now — single-valued; revisit only if a real case appears.

**Axis 2 — `entity_type_id` (drives *persona / reporting*).** **Already exists** — FK `organisations.entity_type_id → managed_list_items`. This is the "what kind of org" axis (utility / donor-DFI / consultancy / government / researcher …). No change needed beyond ensuring the vocab covers the consumer types. It stays independent of `relationship` — e.g. a *government* body (entity_type) may be a *member* or a *subscriber* (relationship); a *donor* and a *consultancy* differ in type but are both *subscribers*.

> Plain-language: **Axis 1 = "how do you relate to PRISM (and do you pay)?"** · **Axis 2 = "what kind of organisation are you?"** They don't move together, so they can't be one field.

> **Sector is NOT a third axis (coordinated w/ #13 multi-sector, 2026-07-26).** Which sector(s) an org operates in — Electricity / Water / Sanitation — is a third, fully orthogonal concept owned by stream #13. It lives **off** `organisations` as an additive M:N junction `organisation_sector(organisation_id, sector_id)` (a utility can run electricity *and* water), and does **not** touch `relationship` or `entity_type_id`. Confirmed compatible with this model. Do **not** add a sector column to `organisations`. Downstream note for later (not a blocker): if plans are ever sold per-sector, `plan_entitlement` (§3.2) would gain a sector qualifier — additive, revisited when a real multi-sector subscription appears.

### 2.1 Benchmarking-group membership (sector-tagged M:N) — co-owned with #13

**Decided 2026-07-27 (Eugene).** Association membership is a **cohort, not geography, and is sector-specific** (PPA → electricity; PWWA → water/sanitation). It generalises the electricity-only `organisations.ppa_membership_type_id` into a first-class M:N:

```
benchmarking_group (id, name, code,
                    geo_scope? → sub_regions / regions (M49-typed, optional) )
benchmarking_group_sector (group_id → benchmarking_group, sector_id → sectors [#2 Phase 5b / ADR 0003])
                    -- a group spans 1+ sectors: PPA→{electricity}, PWWA→{water, sanitation}
benchmarking_group_member (group_id → benchmarking_group, organisation_id → organisations
                           -- (country_id variant per #13's advisory if country cohorts are needed),
                           joined_at)
```

- **Two distinct axes, kept apart:** UN M49 (§2, on the org's country) = *where a utility is*; benchmarking group = *which cohort it benchmarks against*. Neither is the other.
- **Sector is a group→sectors M:N (adjustment from #13, 2026-07-27):** a group carries **no scalar `sector_id`**; its sectors come from `benchmarking_group_sector` (PWWA = water + sanitation). A member's free-access sector set is therefore the **union of sectors across all groups the org belongs to** (group→sectors ∪ per membership).
- **Drives two things:** (1) benchmarking cohorts for `ai_benchmark` / `benchmarking_request` (within group+sector, and between groups sharing a sector); (2) **free access in this spec** — an org's free "member" entitlements (§4) apply to that union of sectors. A PPA member sees electricity dashboards free; a PWWA member sees water + sanitation; a utility gets both provider access and free member dashboards for its sector(s).
- **Never a data address (guardrail from #8, 2026-07-27):** a benchmarking group is a **membership/entitlement** structure only — no `data_entries` / `kpi_actual` row may ever anchor to a group. Cohort benchmarks are **read-time rollups over org-anchored (and finer) data**, grouped via this M:N at query time. Under the ruled hybrid `data_entries` convention (#8 ruling `7c01627`, 2026-07-27 — denormalized entity-FK chain utility/country/sub-region/region/area/station/unit, **no sentinel grain rows ever**) a group is not among the row's anchors; the group DDL must not add such an anchor. The no-sentinel / no-group-anchor invariant is preserved verbatim by that ruling.
- **Ownership:** advisory raised by **Eugene via the #2 migration wrap-up** (not #8 — corrected 2026-07-27), for #10 + #13 to pick up. The `benchmarking_group` concept is co-owned with **#13** (sector tag + cohort semantics) — this stream (#10) owns the org-membership + access-derivation side. #8 reviewed §2.1 and confirmed no conflict with the data-hierarchy anchor model.
- **DDL sequencing (agreed with #13, 2026-07-27):** `benchmarking_group_sector.sector_id` FKs the `sectors` reference **table**, which is #2's Phase-5b DDL (ADR 0003) — today sectors are only a code-level union (`lib/terminology/sectors.ts`). So `benchmarking_group*` DDL lands **after/with the `sectors` table**, via **#2** (shared-table DDL owner). **#10 does not need it pulled forward** — the member free-access tier is downstream (member entitlements still TBD, §4), and nothing #10 is building now (registration/country picker) depends on it. Retire `ppa_membership_type_id` once membership is migrated into `benchmarking_group_member` — **⚠ under reconciliation (§9, 2026-08-03): finalised plans indicate it's KEPT as the membership *class* (drives the free `member` plan), with `benchmarking_group` remaining the orthogonal sector cohort; awaiting #13's confirm**.

---

## 3. Identity, seats & subscriptions

Today access = `user.organisation_id` + `user.role_id` (one org, one role, no time-box). The subscription world needs a **seat** as the unit of access.

### 3.1 Tables (new)

**`subscription`** — an org's purchased (or granted) plan instance.
```
id, org_id → organisations, plan_id → plan,
plan_version_id → plan_version (the version SOLD AT — locks price/seat/term so old subs keep their sold terms, §3.2),
seat_cap (int; from the locked plan_version, override allowed),
term_start (date), term_end (date; PPP = start + 60d; annual = start + 1y; free = null/rolling),
status: 'quoted' | 'awaiting_payment' | 'active' | 'expiring' | 'lapsed' | 'cancelled',
created_by, created_at, updated_at
```

**`seat`** — the assignment of one person to one subscription; **this is what grants access** and carries expiry. Replaces the single `user.organisation_id/role_id` as the source of truth (those become a transitional cache of the user's "home" seat — see §3.4).
```
id, subscription_id → subscription, org_id → organisations (denormalized for query),
user_id → user, role_id → roles (provider RBAC; subscriber seats use a generic viewer role + plan entitlements),
is_admin (bool — can manage this org's seats),
is_primary_contact (bool — receives measure/expectation + benchmarking notification emails for this org; defaults to the BLO seat, but a utility may nominate specific people; a distinct flag, NOT a role synonym — see §8),
status: 'invited' | 'active' | 'expiring' | 'expired' | 'revoked',
valid_from (date), valid_until (date; ≤ subscription.term_end),
invited_by → user, assigned_at
```

- **Cap enforcement (deterministic, not AI):** count `seat` where `subscription_id = X` and `status in (invited, active, expiring)` must be ≤ `subscription.seat_cap`.
- **Multi-org:** the same `user_id` appears in many `seat` rows across subscriptions/orgs → each counts toward its own subscription's cap. This is the junction that answers "the consultant engaged by WB *and* ADB."
- **Expired ≠ deleted:** identity is retained; a freed seat returns capacity to the pool and can be reassigned or the same person re-activated without re-registration.

### 3.2 Plans & entitlements — effective-dated versioning

**Prices/terms change over time; existing subscriptions keep what they were sold (decided 2026-07-27, Eugene, via #11).** Split the plan into a **stable identity** + **effective-dated version snapshots** — never a single mutable row (mutating `price_usd` would retroactively reprice every live subscription).

**`plan`** — stable identity (the 6 user-groups, §0):
```
id, code ('public'|'utility'|'member'|'per_project'|'basic'|'premium'),
name, tier_group ('paid'|'free'), is_active
```

**`plan_version`** — effective-dated **commercial terms only** (price/seat/term); these **lock** to the subscription:
```
id, plan_id → plan,
price_usd (null/0 for free), seat_cap (null = unlimited), term_days (365 | 60 | null for rolling/unlimited),
valid_from (date), valid_to (date, null = current),
created_by, created_at
```
- Exactly **one current version** per plan (`valid_to IS NULL`). A DEV/BMO price/seat/term edit = **close** the current version (set `valid_to`) + **insert** a new one — versions are **immutable**, so the change history is the version list. A `subscription` locks its `plan_version_id` (§3.1), so old subs keep the price/seat/term they were sold.

**`plan_entitlement`** — dashboard × the **three rights** (§0 matrix), keyed to the **plan identity** (not the version) because **entitlement changes forward-apply to every user on the plan** (Eugene 2026-07-28):
```
id, plan_id → plan,
dashboard: 'annual_reports_pdf'|'teaser_samples'|'utility_specific_kpi'
         | 'benchmarking_kpi'|'country_kpi'|'subregional_kpi'|'regional_kpi',
can_view (bool), can_download_charts (bool), can_download_tables (bool)
```
- **View is prerequisite** for either download (enforce: a download right implies `can_view`). Editing a plan's entitlements takes effect immediately for **all** its subscribers — no per-subscription locking. History is an **audit trail** (`plan_entitlement_event`: from/to, actor, timestamp), not version-locking — so "see historical changes" is satisfied without freezing anyone.
- **Why the split:** commercial terms (what you *paid*) lock to the sold `plan_version`; feature entitlements (what the plan *grants*) forward-apply from the live `plan_entitlement`. A repricing never changes access; a dashboard added to Premium reaches every Premium subscriber at once.
- Everything is a plan — the 3 paid tiers **plus** `public` (free default / BMO-revert target, §5), `member` (free; the three PPA member classes — Allied / Affiliate-Dev-Partner / Affiliate-Other, labelled on the org via `ppa_membership_type_id`, §4 — share this one plan), and `utility` (provider set). One uniform mechanism.
- **UX in flight:** #11 builds a throwaway mock-backed **prototype** (view/edit plans + version-history) → rebind to the real `plan`/`plan_version`/`plan_entitlement` tables (**DDL with #2**) once it lands.

### 3.3 Act-as (multi-org effective access)

A consultant with a **Premium** seat (WB) and a **Basic** seat (ADB) must not silently get Premium everywhere — that would gut the tiers. So:

- The user session has an **active seat / org context**. Effective entitlements = `active seat → subscription → plan → plan_entitlement`.
- A **context switcher** ("Working as: World Bank ▾") lets them flip between their active seats. Each of the **three rights** — view, download-charts, download-tables — is enabled only when the active seat's plan grants it (`can_view` / `can_download_charts` / `can_download_tables` for that dashboard).
  - **Enforcement point (server-side, not the button):** each right is denied at the **server** — the export route that streams the chart image / CSV-Excel (or, while Power BI is embedded, at embed-token issuance with the matching export capability disabled). Hiding a control is a UX affordance, **not** a control: a seat lacking `can_download_tables` that reaches the table-export URL must get a **403**. Charts and tables are **gated separately** (e.g. Basic can *view* benchmarking but download neither; Premium downloads both). Same principle as the data boundary (external gold views, not dashboard filters) — the control lives in the server, never the page.
- Data shown is the same regional benchmarking either way, so act-as is *feature/entitlement* scoping, not data scoping — the switcher is light.
- Store the active context on the session (or `user.active_seat_id`, nullable FK), defaulting to the user's most recently used / only seat.

### 3.4 Migration / unify note

**Decision (Eugene 2026-07-26): full unify now** — *all* access is via seats, including the provider side, done in this stream (not a hybrid). Utilities get an auto-provisioned free `utility` subscription per org; utility staff become seats (BLO = `is_admin`). `user.organisation_id` / `user.role_id` are retained transitionally as a cache of the user's home seat, then removed once all reads move to `seat`. **This is the largest single refactor** (every current read of `user.organisation_id`/`role_id`) → its own build phase, sequenced first so nothing has to be reworked twice.

### 3.5 Impact on existing tables (delta from today's schema)

New registration + tiered-access state lives mostly in **new** tables (`access_request`, `seat`, `subscription`, `plan`/`plan_version`/`plan_entitlement`, `payment`/`payment_event`/`payment_settings`, `benchmarking_group*`, `organisation_relationships`, `access_settings`). Changes to **existing** tables are deliberately small:

**`user`** — mostly unchanged; net *subtractive* across the build:

| column | verdict |
|---|---|
| `id`, `name`, `email`, `emailVerified`, `twoFactorEnabled`, `image`, `createdAt`, `updatedAt` | **keep as-is** (identity/auth) |
| `status` (pending/active/deactivated) | **keep** — drives the approval flow (§5) |
| `date_approved`, `date_rejected`, `rejected_by_user_id`, `reject_reason` | **keep** — approval audit (+ `user_status_event`) |
| `organisation_id`, `role_id` | **remove at the seat-unify (§3.4)** — access moves to `seat`; kept transitionally as a home-seat cache, then dropped |
| `dataset_required`, `data_access_reason` | **retire** — old free-text intake, superseded by the structured `access_request` (§5.4); migrate values → `access_request`, then drop |
| **`is_primary_contact`** *(ADD now, transitional)* | measure-notification recipient (§8, from #4); keyed to `organisation_id` now → migrates to `seat.is_primary_contact` at the unify |
| **`active_seat_id`** *(ADD later, nullable FK → seat)* | act-as context (§3.3); may live on `session` instead |

> Immediate `user` change ≈ **one column** (`is_primary_contact`); the removals land at the seat-unify phase (§3.4), the stream's largest migration.

**`organisations`** — add `relationship_id` FK (§2); keep `ppa_membership_type_id` as the membership-class label (§4; ⚠ §9 reconcile with #13); deprecate then drop `is_utility` after backfill.

**`external_registrations`** — already **dropped** (PR #79); replaced by the new `access_request` table (not modified).

**`roles`** — add the `PPA_FIN` row (§8); no structural change.

**Untouched (reused as-is):** `session`, `account`, `verification`, `user_status_event`, `user_registration_clarification_message`.

---

## 4. Plans coverage — all resolved by the FINALISED 2026-08-03 matrix (§0)

- **Paid:** Per Project (US$500 / 1 seat / 60d) · Basic (US$2,200 / 5 / 365d) · Premium (US$3,500 / 10 / 365d). Commercial ladder: **Basic** trades downloads for seats+duration (benchmarking **view-only**); **Per Project** trades seats+duration for downloads; **Premium** = both.
- **`public`** (free, the **default** / BMO-revert plan): **Teaser Samples** (view + downloads) + Annual Reports PDF — nothing else. The non-member on-ramp that converts to a paid plan.
- **`member`** (free, **10 seats / 365d**): PDF + full benchmarking family (Benchmarking / Country / Sub-regional / Regional) with **view + both downloads**; **not** Utility-Specific KPIs, **not** Teaser Samples. **One plan covers all three PPA member classes** — Allied, Affiliate (Dev Partner), Affiliate (Other) — which are **identical in entitlements**; *which* class an org is = a governance label on the org via **`ppa_membership_type_id`** (§2 reconciliation note). Sector scope (which sector's data) via `benchmarking_group_member`, §2.1.
- **`utility`** (free, unlimited): everything — its own Utility-Specific KPIs (view + downloads) **and** the full benchmarking family (view + downloads), scoped to its own data / sector.

---

## 5. Registration & routing workflow

Reuses what already exists (the pending-approval state machine + the **two-way clarification thread** `user_registration_clarification_message`) and adds intake, dedup, and split routing.

### 5.1 Split the routing (unloads the BMO)

- **Seat-fill by an existing org admin** (WB admin adds a consultant; utility BLO adds staff) → **instant, no BMO**. The subscription is already vetted.
- **Net-new external org / individual** → BMO vetting (existing pending + clarification flow).

### 5.2 Duplicate-org dedup ladder (cheap → AI → human)

1. **Email-domain match** (`@worldbank.org` → World Bank exists) → route to *request a seat / join* that org.
2. **Fuzzy name match** — live search *before* any "create new org" is offered.
3. **AI entity resolution** where 1–2 miss ("World Bank Group / IBRD / WB Pacific" = same) → ranked candidates + rationale, **human confirms**.
4. **BMO backstop + merge tool** for dupes that slip through — including the **simultaneous-net-new collision** (two people from the same not-yet-registered org both register before either org exists, so steps 1–3 match nothing): the BMO console groups pending `access_request`s by fuzzy `proposed_org_name` so they're resolved into one org with one admin, not two duplicate orgs. First approved of the group becomes `is_admin`; the rest are added as seats.

### 5.3 Join-existing routing (locked)

When dedup matches an existing org:
1. Request goes to **that org's admin** first: "Add this person to your quota?" — **BMO is cc'd** on the thread.
2. Org admin **accepts** → seat assigned under that org (counts to its cap).
3. Org admin **rejects** → BMO is already in the loop and can **revert the user to the `public` (default) plan** (so the requester isn't stranded — they land on free view-only access).

### 5.4 New intake object

`access_request` captures the intake so provisioning is clean (rather than overloading `user.status=pending`):
```
id, requester_name, requester_email, matched_org_id (nullable), proposed_org_name (nullable),
proposed_org_country_id (nullable, → countries.id = UN M49 code),   -- only on the propose-new-org branch
suggested_plan_id, dedup_candidates (jsonb), routing_target ('org_admin'|'bmo'),
-- structured "quiz" (added 2026-07-26, registration session — see note below):
purpose_category ('benchmarking'|'regulation'|'research'|'donor_reporting'|'consulting'|'other'),
engagement ('one_off'|'ongoing'),                     -- one-off ⇒ suggest Pay-per-project
declared_org_relationship ('utility'|'member'|'subscriber'|'unsure'),  -- self-declared; BMO confirms
datasets_of_interest (jsonb), purpose_text (free-text supplement),
status: 'submitted'|'info_requested'|'with_org_admin'|'approved'|'declined'|'reverted_to_default'|'withdrawn',
created_at, decided_by, decided_at
```
> **Country = M49 pick, on the org, on one branch only (added 2026-07-26).** Country is never a free-text or per-user field. Users don't carry a country — the **organisation** does (`organisations.country_id`, NOT NULL). So: **join-existing** inherits the org's country (no prompt); **propose-new-org** captures `proposed_org_country_id` from the canonical **UN M49 `countries` list** (the single source of truth after #13's PR #60), which the BMO uses to mint the real `organisations` row. Sub-region/region are **derived** from the country (`sub_region_id → un_continental_region`) — never asked. **List scope — DECIDED 2026-07-26 (Eugene): lazy-insert (option 2).** Subscriber orgs (donors/consultants/govts) may be based anywhere, so the picker offers the **complete UN M49 list**; the first time a not-yet-seeded country is chosen, its canonical M49 row is inserted into `countries`, keeping the live table lean without blocking a non-Pacific buyer. **Mechanism — DELIVERED by #13 (PR #62 `922810a`, 2026-07-27):** `ensureCountry(m49Code: number): Promise<Country>` at **`@/lib/countries/ensure-country`** — returns the row if present, else lazy-inserts the country + its `sub_regions` parent from `lib/countries/reference.generated.ts` (248 UNSD territories w/ dial + ISO-4217), **auto-ensures** the ISO-4217 currency managed-list item and resolves its FK, all NOT-NULL fields satisfied; idempotent + transactional + race-safe on concurrent first-picks. **No currency pre-seed dependency** (removed in #13's PR #64 — the helper creates the currency item on demand; `scripts/seed-iso4217-currencies.ts` remains an optional bulk pre-seed, already run on dev). **#10 action:** the propose-org path calls `ensureCountry(selectedM49)` to materialize `proposed_org_country_id`; reference-data invariants stay in #13's layer, not duplicated here. **`currency_id` gap — DECIDED 2026-07-26 (Eugene): real ISO-4217, no N/A sentinel ever.** The M49 CSV lacks `currency_id` (FK currency managed list) and `dial_code`, so #13 enriches the reference with each country's true **ISO-4217 currency** + ITU dial code and `ensureCountry` auto-ensures the currency managed-list item on insert. Every country carries its correct currency (right even if it later becomes a utility submitting financials); there is no "N/A" currency. Does not block #10's picker design (which just calls `ensureCountry`).
>
> **Why structured, not one free-text box (the originating complaint):** the reason registrants were "not quizzed enough" and standalone accounts drifted from their real org is that the old form asked *who/why* as loose prose (or not at all) and let the org be free text. Structured `purpose_category` + `engagement` + `declared_org_relationship` (a) feed the AI plan recommendation and dedup ranking deterministically, (b) give the BMO a triage-ready request instead of prose to interpret, and (c) pair with the §5.2 live org search so "choose from the existing list or propose a new one" is the *only* way to name an org. `purpose_text` stays as an optional supplement, no longer the primary signal.
Clarification messages link to the `access_request`; on approval it provisions `user` + `seat` (+ `subscription` for a net-new org).

**Where AI helps (intake + dedup, never authorization):** conversational intake → a complete structured request first time (fewer BMO round-trips); plan recommendation from answers; dedup ranking; a BMO copilot that summarizes + pre-fills. Grant/deny, cap, expiry, domain trust stay deterministic/human.

---

## 5.5 User journeys (end-to-end)

How §0–§5 play out per user type. The two genuinely new flows are the **utility per-period opt-in** and the **structured registration**.

### 5.5.1 Registration (all new users)
1. Wizard: About you → **organisation** (live dedup §5.2 — pick an existing org, or propose a new one with a UN-M49 country pick, §5.4) → **structured purpose quiz** (§5.4) → suggested plan → submit → creates an **`access_request`**.
2. Routing (§5.1/§5.3): joining an existing org → **org-admin** approves (BMO cc'd); net-new org / individual → **BMO** vets.
3. On approval → provisions `user` + `seat` → magic-link login. Org-admins then **self-serve** adding colleagues within their own org.
- Replaces the retired free-text `external_registrations` intake.

### 5.5.2 Utility — the biggest change (2-tier + per-period opt-in)
Eligibility = `is_utility`; participation = per-period (`report_periods.bm_opted_in`); `bm_participates` is **derived** (exists-an-opted-in-period), never stored (§2 / Eugene option B).
1. **Log in → Tier 1** (gated on `is_utility`): Dashboards + Profile + **the opt-in prompt**. *No auto-shells, no data-entry app yet.*
2. Each period a submission falls due → **reminder email to the org's `is_primary_contact`** (§8).
3. They **explicitly opt in for that period** (`bm_opted_in = true`).
4. **Review reference data** (service areas, generators, IPPs, tariffs — #8's step) → shells generate.
5. **Tier 2 unlocks** (now a participant): full **Data Entry + BSC** → enter the period's data.
- The **opt-in tick is the Tier-1 → Tier-2 transition**. A utility that never opts in simply stays at Tier 1 — there is **no "permanently view-only utility"** (that state isn't stored).

### 5.5.3 Consumer / subscriber (non-member, paying) — teaser → convert
1. Register → land on the free **Public** plan: **Teaser Samples + PDF reports** only.
2. Subscribe to Basic / Premium / Per-Project → **PPA Finance** charges the card in the bank virtual terminal (§6; PRISM never sees the PAN) → subscription active → the paid Power BI reference unlocks.

### 5.5.4 Member (Affiliate / Allied) — free via membership
- Register → **BMO sets `ppa_membership_type`** (§2 / the org form) → free **Premium-level** access (the Premium PBI reference), **no payment**. Members don't buy a plan.

### 5.5.5 What every login resolves
The app resolves the org's columns → (a) the **WebApp tier/menu** and (b) which of the **4 Power BI plan references** (Public / Utility / Premium / Basic) goes into the embed token (§3.2; PBI enforces the actual dashboards + export rights):
- `is_utility` → utility Tier 1 / Tier 2.
- `ppa_membership_type` → member (Premium ref) vs consumer (Public / paid).
- derived `bm_participates` → participant *status* (Tier-2 unlock + benchmarking data), not an access gate.

> **Cross-refs / still folding in (same consolidated pass):** the per-period `bm_opted_in` flag + backfill (#3's `per-period-participation-spec.md`), the 4 PBI references / entitlement-templates + the `download_inputs` right, and the WebApp-visibility matrix detail (§8 open calls). This section is the end-to-end synthesis those hang off.

---

## 6. Payment (manual now, gateway later)

### 6.1 Mode switch (DEV)

`payment_settings` (DEV-configurable): `mode: 'manual' | 'gateway'`, plus **encrypted** gateway config strings (`gateway_provider`, keys). Flip to `gateway` when PPA has an internet-payment-capable bank.
- `manual` → the PPA-Finance queue flow (§6.3).
- `gateway` → self-serve checkout hits the gateway; no Finance queue.

### 6.2 New role — **PPA Finance (`PPA_FIN`)**

Processes card payments manually and updates PRISM. Gets a **Payments queue** sidebar item (add `PPA_FIN` to `roles` seed + `sidebar_access`). Acts as "the gateway" in manual mode.

### 6.3 Manual flow — PRISM never touches the card number

PRISM is **out of the card-data path**. The PAN/CVV are entered by the customer **directly into PPA's bank virtual terminal** (the bank's own secure channel), never into PRISM.

1. Subscriber **self-initiates a payment request** for a plan: amount + currency + cardholder name (+ optionally card **expiry MM/YY** — never the PAN or CVV) → a `payment` row `status='queued_for_finance'` → routed to the **`PPA_FIN`** queue.
2. **Pre-validation at entry** (advisory, non-sensitive fields only): flag an obviously-lapsed expiry, missing name, amount mismatch — before it reaches Finance. *(No PAN in PRISM, so no Luhn/brand check here; the bank terminal is the real authorization.)*
3. PPA Finance takes the card from the customer via the **bank virtual terminal** and charges it there.
4. Finance updates the `payment` row from the terminal receipt: **transaction/auth reference, status, amount, card brand + last-4** → `succeeded` / `failed (reason)`, stamped `processed_by` + `processed_at`.
5. `succeeded` → subscription `active`. `failed` → notify subscriber with reason; they can retry.

When the DEV switch flips to `gateway`, steps 1–4 collapse into a hosted-checkout / tokenized flow; PRISM still stores only the result fields (§6.4).

### 6.4 Payment record — logged "as if the gateway processed it"

**`payment`** — what any gateway would log, and what you can reference at any time. **Yes — transaction reference, status, amount, and date/time stamps are all captured here** (a request stamp *and* a processed stamp):
```
id, subscription_id → subscription,
amount, currency ('USD'),                       -- amount
status: 'pending_validation'|'queued_for_finance'|'processing'
       |'succeeded'|'failed'|'refunded',        -- status (full lifecycle)
transaction_reference,   -- the bank terminal's / gateway's approval/receipt code (Finance enters)
method: 'card_virtual_terminal' | 'gateway' | 'bank_transfer',
card_brand, card_last4, cardholder_name,        -- from the terminal receipt / request (no PAN, no CVV)
requested_by → user, created_at,                -- when the request was raised  (timestamp 1)
processed_by → user (PPA_FIN), processed_at,    -- when Finance charged it       (timestamp 2)
failure_reason
```
- `created_at` = request raised; `processed_at` = charge completed → you always have both the "when asked" and "when paid" timestamps, plus the reference, status, and amount.
- **Never persisted:** full PAN, CVV, card expiry-with-PAN. (Card capture happens in the bank virtual terminal — §6.5.)
- Every status change also writes a `payment_event` audit row (from/to status, actor, timestamp) for a full paper trail.

### 6.5 PCI-DSS posture — **decided: no PAN in PRISM**

- **PRISM never stores or transmits the PAN or CVV.** Card capture + authorization happen entirely in **PPA's bank virtual terminal** (or a tokenizing gateway once the DEV switch is flipped). PRISM stays **out of the cardholder-data environment**.
- Effect: **dramatically smaller PCI-DSS scope** (roughly SAQ-A territory) — no encrypted-PAN store, no KMS key, no purge job.
- PRISM persists only **non-sensitive result data** (§6.4): amount, currency, status, transaction reference, timestamps, card **brand + last-4**, cardholder name, actors. Brand + last-4 without the PAN are safe to store.
- The earlier "encrypted transient PAN handoff" table is **dropped** (Eugene, 2026-07-26).

---

## 7. Expiry, reminders & admin

- **`access_settings`** (BMO-configurable): `reminder_lead_hours` (default 48) — applies to **both** seat-expiry and subscription-renewal reminders.
- **Nightly job** (PM2 — `ecosystem.config.js` already present, add a cron): (a) flip seats past `valid_until` → `expired`, subscriptions past `term_end` → `lapsed`; (b) send reminders to **org admin *and* consultant** for seats/subscriptions inside `reminder_lead_hours`, with extend/renew deep-links. Extend = admin sets a new `valid_until ≤ term_end`.
- **Org admin capability** (generalizes today's BLO screen, which can only create+list): invite/assign a seat, set/extend/revoke `valid_until`, resend magic-link, see seat usage vs cap. First approved user of a net-new subscriber org **becomes admin**; multiple admins allowed.
- Audit: reuse the `user_status_event` pattern as `seat_event`.

---

## 8. Roles / RBAC deltas

- **New role `PPA_FIN`** (PPA Finance) — payments queue only.
- **Org-admin** = a `seat.is_admin` flag (not a new global role) — because access is uniform; admin is a management capability within an org.
- **BLO** stays the utility's admin (`is_admin` on utility seats) and Utility-Liaison; glossary updated (`CONTEXT.md`).
- **Primary contact** = a **`seat.is_primary_contact`** flag (per-org, on the seat — like `is_admin`), **not** a role synonym: it defaults to the BLO seat but a utility can nominate specific people, and a utility may have more than one. It's the recipient set for measure/expectation notifications (new effective-dated measures, "mandatory in the next benchmarking report") — from [measure-effective-dating-spec.md](measure-effective-dating-spec.md) §8. The email **trigger** lives in the alerting/email-schedule model (consumes this flag); #10 owns the **designation**, the effective-dating stream owns the trigger.
- Existing route-prefix / `sidebar_access` gating extends to the new surfaces (Payments, Subscriptions, Seats).

---

## 9. Pending follow-ups & open questions

- **[UPDATED 2026-08-03] Plans finalised** — folded `FINALISED Tiered Access Plans 260803.xlsx` into §0/§3.2/§4: member tier = one `member` plan (10 seats/365d) covering the 3 PPA member classes (label via `ppa_membership_type_id`); **`public_kpi` dashboard → `teaser_samples`** (Public gets view + downloads on it); paid tiers unchanged.
- **[RESOLVED 2026-08-03] Default plan contents** — the **`public`** plan = Teaser Samples (view + downloads) + Annual Reports PDF (§0/§4).
- **[RESOLVED 2026-08-03] Member entitlements** — the **`member`** plan = PDF + full benchmarking family (view + both downloads), 10 seats/365d, sector-scoped (§0/§4).
- **[⚠ RECONCILE with #13, 2026-08-03] `ppa_membership_type_id` — class vs cohort.** The finalised plans show `ppa_membership_type_id` encodes the **membership class** (Utility / Allied / Affiliate-Dev / Affiliate-Other) — a governance label that picks the free plan. That's a **different dimension** from #13's `benchmarking_group` (which sector *cohort* an org benchmarks in). So the earlier joint decision to **retire `ppa_membership_type_id` into `benchmarking_group_member`** (§2.1, §2 migration) needs revisiting: it should be **kept** as the class label, with `benchmarking_group` remaining the orthogonal sector cohort. Flagged to #13; §2.1/§2-migration NOT yet rewritten pending their confirm.
- **[RESOLVED 2026-07-28] Entitlement change semantics** — entitlement edits **forward-apply to all users on the plan** (Eugene); commercial terms (price/seat/term) still lock to the sold `plan_version` (§3.2).
- **[RESOLVED 2026-08-03] Platform/internal orgs (the "operator" question)** — two new relationship values: **`administrator`** (PPA, org 18) + **`developer`** (Innov8, org 12); role-based access, excluded from subscription/payment/plan flows (§2). No new orgs needed (both already exist); the sentinel that used to house their staff is retired, users already re-homed.
- **[FORWARD-REQ 2026-07-28, from #4] Primary-contact designation** — `seat.is_primary_contact` (§3.1/§8) added so the user model carries it; recipient set for new-effective-dated-measure emails ([measure-effective-dating-spec.md](measure-effective-dating-spec.md) §8, DRAFT). #10 owns the flag; the email trigger is the effective-dating/alerting stream's. Co-design the field with #4 when that spec firms up.
- **[RESOLVED 2026-07-26] PCI-DSS** — no PAN in PRISM; bank virtual terminal, PRISM records result only (§6.5).
- **[RESOLVED 2026-07-26] Unify migration** — full unify now, provider side included, sequenced first (§3.4).
- **[RESOLVED 2026-07-26] Manual checkout** — subscriber **self-initiates** the payment request (no card entry in PRISM); Finance completes it (§6.3).
- Payment gateway provider (Stripe / Pacific PSP) — deferred until PPA banking allows.
- **[RESOLVED 2026-07-27, Eugene] Membership is sector-tagged, not a `relationship` value.** Generalised `ppa_membership_type_id` into the sector-tagged `benchmarking_group` + `benchmarking_group_member` M:N (§2.1). `relationship`'s old `ppa_member` value is renamed to `member` (association-agnostic, free-access shape); *which* association/sector — and therefore what a member sees free — is derived from the M:N. Applied to §1.4, §2, §2.1, §3.2, §4. Advisory raised by Eugene via the #2 migration wrap-up (not #8). **DDL lands via #2** (shared-table DDL owner), co-designed with #13 (sector); #8 reviewed and cleared it (guardrail: a group is never a data anchor — §2.1). Retire `ppa_membership_type_id` on migration.
- **[ADDED 2026-07-26, registration session]** Reconciled the two design sessions into this one spec: folded in (a) export-endpoint enforcement of view/download rights (§3.3), (b) structured intake "quiz" replacing free-text-org/why (§5.4), (c) simultaneous-net-new org collision handling (§5.2.4). All other ideas from that session were already covered here and were discarded as redundant. **The entire stream (registration §5 + tiered access §2–§8) is now driven by the "PRISM 2 access & registration" session going forward.**
