# Tiered access & registration — buildable issues (§2–§8)

Build breakdown of [`tiered-access-and-registration-spec.md`](tiered-access-and-registration-spec.md), owned by stream **#10**. Design is decision-complete; this is the implementation plan. **Seat-unify is the spine and goes first** (§3.4) — everything downstream reads the seat, so doing it first means nothing is reworked twice.

**Discipline (per CLAUDE.md):** git-first, then DB. Every DDL is marked **additive** (apply promptly after the code PR merges) or **destructive** (apply only after the new code is live — expand/contract). Shared tables (`organisations`, `user`, anything in the medallion set) land their DDL via **#2** (shared-DDL owner); reference/cohort tables (`benchmarking_group*`, `sectors`) via **#2 + #13**. `db-push-safe` + backup before any `--force`.

**Legend:** 🅐 additive · 🅓 destructive · size S/M/L/XL · dep = hard prerequisite.

---

## Phase 0 — Org access axis (small enabler, can run alongside Phase 1)

### T-01 · `organisation_relationships` ref table + backfill — §2
- **Deliver:** dedicated ref table `{ id (explicit), code unique ('utility'|'member'|'subscriber'|'administrator'|'developer'), name, is_active }`; `organisations.relationship_id` FK (no CHECK); seed the 5 codes; backfill (`is_utility=true`→utility, org 18→administrator, org 12→developer, remainder→subscriber/member after a one-time BMO review); **deprecate** `is_utility` (keep column for now).
- **Code:** access-resolution branches on `relationship.code`; org form exposes it (already partly wired via #11).
- **DDL:** 🅐 new table + FK column (via #2). Dropping `is_utility` is a later 🅓 step (T-14 cleanup).
- **Dep:** none. **Size:** M.
- **Accept:** every org resolves a `relationship.code`; org 18=administrator, 12=developer; no code path reads `is_utility` for access decisions.

---

## Phase 1 — SEAT UNIFY (the spine — first) — §3.1, §3.4

### T-02 · `subscription` + `seat` tables + auto-provision (shadow) — §3.1, §3.4
- **Deliver:** create both tables per §3.1; auto-provision one free `utility` subscription per utility org + one `seat` per existing utility user (BLO→`is_admin`); populate in **shadow** (no reads switched yet). Add `user.is_primary_contact` (transitional) here.
- **DDL:** 🅐 new tables + one `user` column (via #2). **Dep:** T-01 (relationship drives which orgs get the `utility` sub). **Size:** L.
- **Accept:** every active user has ≥1 seat; seat/subscription counts reconcile to today's `user.organisation_id`; app behaviour unchanged.

### T-03 · Seat-based access resolver — route all reads through it — §3.4  ← **largest refactor**
- **Deliver:** `getEffectiveSeat(user, activeContext)` + `getEffectiveRole/Org`; replace **every** current read of `user.organisation_id` / `user.role_id` (role-guard, proxy role cache, `pbiRls`, data-entry scoping, sidebar, services) with the resolver, backed by `seat` (home-seat cache still on `user`).
- **DDL:** none (read-path refactor). **Dep:** T-02. **Size:** XL.
- **Accept:** grep shows no direct `user.organisation_id`/`role_id` access outside the resolver + the transitional cache writer; full app parity verified on dev (login, sidebar, data entry, dashboards).

### T-04 · Seat lifecycle + cap enforcement + `seat_event` audit — §3.1, §7
- **Deliver:** seat status machine (invited/active/expiring/expired/revoked); deterministic cap check (`count active-ish seats ≤ subscription.seat_cap`); `seat_event` audit (mirrors `user_status_event`).
- **DDL:** 🅐 `seat_event`. **Dep:** T-02. **Size:** M.
- **Accept:** exceeding cap is refused server-side; every status change writes an audit row.

### T-05 · Retire `user.organisation_id` / `role_id` — §3.5  ← contract step
- **Deliver:** drop the two columns once T-03 is **live and verified**; remove the transitional cache writer.
- **DDL:** 🅓 drop 2 columns (apply only after T-03 live — expand/contract). **Dep:** T-03 live. **Size:** S.
- **Accept:** columns gone; app green; `/api/health` ok post-deploy.

---

## Phase 2 — Plans & entitlements — §3.2, §4

### T-06 · `plan` + `plan_version` + `plan_entitlement` + `_event` + seed — §3.2, §4
- **Deliver:** four tables per §3.2; seed the **6 plans** + current `plan_version` + the entitlement matrix (dashboard × `content_class` × 3 rights) from §0 / FINALISED 260803 sheet; rebind #11's prototype grid to the real tables.
- **DDL:** 🅐 four tables (via #2). **Dep:** T-02 (subscription FKs plan_version). **Size:** L.
- **Accept:** the 6 plans + entitlements match the finalised sheet; #11 prototype reads/writes live tables; editing an entitlement forward-applies.

### T-07 · Entitlement resolution + forward-apply — §3.2, §3.3
- **Deliver:** resolver `activeSeat → subscription → plan → plan_entitlement`; commercial terms read from the **locked** `plan_version`, entitlements from the **live** `plan_entitlement`; `plan_entitlement_event` on edits.
- **DDL:** none. **Dep:** T-06. **Size:** M.
- **Accept:** a repricing never changes a live sub's access; adding a dashboard to Premium reaches all Premium seats at once.

---

## Phase 3 — Act-as (multi-org) — §3.3

### T-08 · Active-seat context + "Working as ▾" + server-side export gating — §3.3
- **Deliver:** active context on session (or `user.active_seat_id`); context switcher; **server-side** enforcement of view / download-charts / download-tables (403 on the export route when the active seat lacks the right; charts & tables gated separately). Hiding a button is UX only.
- **DDL:** 🅐 optional `user.active_seat_id`. **Dep:** T-07. **Size:** M.
- **Accept:** a Basic seat hitting the table-export URL gets 403; switching context changes effective rights; no client-only gate.

---

## Phase 4 — Registration & routing — §5

### T-09 · `access_request` + structured intake quiz + org search + `ensureCountry` — §5.4, §5.2
- **Deliver:** `access_request` table per §5.4; structured quiz (purpose_category, engagement, declared_org_relationship, datasets_of_interest); live org search ("pick existing or propose new" — the only way to name an org); propose-new calls `ensureCountry(m49)` (`@/lib/countries/ensure-country`, #13).
- **DDL:** 🅐 `access_request`. **Dep:** T-01. **Size:** L.
- **Accept:** no free-text org names; propose-new materialises a real M49 country; a submitted request is triage-ready.

### T-10 · Split routing + dedup ladder + provisioning on approval — §5.1–5.3
- **Deliver:** route org_admin-self-serve vs BMO; dedup ladder (email-domain → fuzzy → AI rank → BMO merge, incl. simultaneous-net-new collision grouping); join-existing routing (org-admin approves, BMO cc; reject→revert to `public`); on approval provision `user` + `seat` (+ `subscription` for net-new). Migrate `user.dataset_required`/`data_access_reason` → `access_request`, then drop.
- **DDL:** 🅓 drop 2 `user` columns (after migrate). **Dep:** T-09, T-02. **Size:** L.
- **Accept:** a net-new org approval yields org+admin+subscription+seat; duplicates are caught before a second org is minted.

---

## Phase 5 — Power BI enforcement — §3.6

### T-11 · RLS role model + resolved-role token + AI/DAX tier-scoping + soft download toggles — §3.6
- **Deliver:** `.pbix` roles (content `KPI_ONLY`/`KPI_AND_INPUTS`; row-scope `SCOPE_PUBLIC`/`SCOPE_OWN_UTILITY`/`SCOPE_BENCHMARKING`); resolve org+plan→role set; send **resolved** roles in `GenerateToken` (not the workflow role); AI/DAX `impersonatedUserName` scoped to the same tier; per-plan soft export toggles (decided: Basic = soft gate). **One report + RLS** (decided).
- **DDL:** none in p2 (dataset-side is #4's gold). **Dep:** T-07; **#4's governed long-fact** (`gold_fact_value`, DRAFT #397 `b5440cc`) — see prerequisite below. **Size:** L.
- **Accept:** a Basic embed/token cannot see inputs or download; the AI path can't dump what the dashboard hides; one report serves all tiers.
- **⚠ HARD PREREQUISITE (#4, 2026-09-09):** content_class + status + category/subgroup RLS are **impossible on the current wide-fact model** — the ~25 `fact*` feeds pivot measures into *column names* and drop status/category/content_class, so PBI RLS (a per-**row** filter via Dim Utilities) can only scope by org. These capabilities need #4's **governed long-fact** (`gold_fact_value` = `kpi_actual` ∪ `data_entries`, carrying `owning_org_id`, `status_id`/`is_approved`, `content_class`, `measure_category_id`, `measure_subgroup_id` as **rows**) + a **PBI-side rebuild** binding the new surfaces to it. Existing wide benchmarking facts stay as-is. **This is #4's build; T-11 (and T-15) cannot deliver row-scoped content/category RLS until it lands.**
- **Note:** the **own-utility live feed** (all-status, watermarked) is **#4/#3's build** (§3.6 status axis) — same long-fact root cause — tracked there, not a #10 issue.

---

## Phase 6 — Payment (manual now) — §6

### T-12 · `payment` + `payment_event` + `payment_settings` + PPA_FIN queue — §6
- **Deliver:** three tables per §6.4; `PPA_FIN` role; subscriber **self-initiated** payment request (amount/currency/cardholder, **no PAN/CVV**) → `queued_for_finance`; PPA_FIN payments queue marks processed with the terminal reference; DEV mode-switch stub for a future gateway; `payment_event` audit.
- **DDL:** 🅐 three tables + `PPA_FIN` role seed. **Dep:** T-06 (payment FKs subscription). **Size:** L.
- **Accept:** a subscription can be paid end-to-end with zero card data in PRISM; both request + processed timestamps recorded.

---

## Phase 7 — Expiry, reminders, admin — §7

### T-13 · `access_settings` + nightly cron + org-admin seat screen — §7
- **Deliver:** `access_settings` (BMO `reminder_lead_hours`); PM2 nightly cron — expire seats/subscriptions past their dates + send reminders (admin + consultant) with extend/renew deep-links; generalise the BLO screen into a full org-admin seat manager (invite/extend/revoke/resend/usage-vs-cap).
- **DDL:** 🅐 `access_settings`. **Dep:** T-04, T-06. **Size:** M.
- **Accept:** an expiring seat triggers a reminder inside the lead window; the cron flips expired states nightly; an admin can self-manage seats.

---

## Phase 8 — RBAC / visibility — §8, §8.1

### T-14 · Sidebar/route gating + §8.1 visibility matrix + `is_utility` drop — §8, §8.1
- **Deliver:** route-prefix / `sidebar_access` for new surfaces (Payments, Subscriptions, Seats, Delegated Access); implement the **§8.1 matrix** (menu visibility by org-class × role — dashboards require login; consumer Dashboards = benchmarking family only; Utility dashboard never for non-utility; AI/Docs privilege-gated; Data Entry = DAO*/BLO; PPA_FIN = finance only); finally **drop `is_utility`** (relationship fully in use).
- **DDL:** 🅓 drop `is_utility` (after all reads on `relationship`). **Dep:** T-01, T-03, T-07. **Size:** M.
- **Accept:** each user class sees exactly its §8.1 menu set; `is_utility` gone; no access regression.

---

## Deferred / out of this batch
- **T-15 · Delegated dataset access (§3.7)** — own feature (grant + grantee + scope + extension tables, CEO grant UI, BLO read-only, taxonomy-scoped RLS, extension workflow, notifications, nightly expiry). Depends on T-04 (seat lifecycle), T-08 (act-as), T-11 (RLS), T-13 (cron/notifications). Sequence **after** the core lands. **The #10 tables (`dataset_access_grant` / `_grantee` / `_grant_scope` / `_extension_request`) are still a #10 build** — and #4's `gold_pbi_grant_scope` view (flattens active grants → grantee×node for the delegated RLS role) **references them, so it only compiles once they're built.** **The category/subgroup scoping itself is contingent on the governed long-fact re-model + PBI rebuild** (T-11 prerequisite) — not free on the current wide model.
- **Reciprocal peer-CEO access** — parked (Eugene, 2026-09-09); not built.
- **Cross-stream:** **governed long-fact `gold_fact_value` + PBI rebuild (#4, DRAFT #397)** — the hard prerequisite for all per-row content_class / status / category / subgroup RLS (T-11, T-15) and the own-utility live feed; `benchmarking_group*` DDL (#2+#13); `ppa_membership_type_id` class-vs-cohort reconciliation (#13); primary-contact email trigger (effective-dating stream).

---

## Suggested build order
`T-01 →` **`T-02 → T-03 → T-04 → T-05`** (seat-unify spine) `→ T-06 → T-07 → T-08 → T-09 → T-10 → T-11 → T-12 → T-13 → T-14`, then `T-15`.
T-01 may run in parallel with T-02. T-06/T-09/T-12 are DDL-additive and can be prepped early, but their behaviour wiring depends on the seat spine.
