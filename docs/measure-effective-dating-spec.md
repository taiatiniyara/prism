# Measure effective-dating spec (DRAFT)

_Status: DRAFT — 2026-08-03, session #2. Lets new data expectations come into
effect for future submission periods (e.g. 4 new solar measures + Battery-Storage
Planned Downtime from FY2026) without retroactively creating shells for past
periods. Grilled with Eugene 2026-08-03. See ADR
[0004-effective-dated-dimensions](adr/0004-effective-dated-dimensions.md) for the
pattern._

Owners / consulted: #2 (drafting) · #10 (registration / primary-contact field +
notification) · the shell/expected-input generation path.

---

## 1. Motivation

New data expectations arise over time: 4 new solar measures, "Planned Downtime for
**Battery Storage**" from FY2026, etc. Today a measure is globally `is_active` —
on-or-off for **all** periods — so there is no way to say "expected from FY2026."
The current model would either (a) demand the input retroactively for FY2024/2025
(wrong, surprising) or (b) leave it out entirely. We need a temporal validity
window on the expectation, so shells appear **only from the effective period**.

## 2. Where the effective date lives — `measure_dimension_applicability`

**Not on `measure_definitions`.** A measure's meaning is incomplete without its
dimensions ("Planned Downtime" is meaningless until you know it is *battery-storage*
downtime), so the thing that "comes into effect" is the **expected input** = measure
× dimension **member**, not the bare measure. Therefore:

- **`measure_definitions` gets NO effective date.** A new measure may exist in the
  catalogue (for its definition/reference) while producing **no shells** until its
  applicability is effective. `is_active` stays the admin kill-switch.
- **`measure_dimension_applicability`** (measure × dimension × member) carries the
  window. "Planned Downtime × source = Battery Storage, effective_from = FY2026" is
  exactly the case. The 4 solar measures land as applicability rows on the solar
  member(s) with `effective_from = FY2026`.
- **Scope-level effective-dating** (a whole dimension's *behaviour* changing over
  time — `not_applicable` → `by_context`) is the rarer case and **deferred** (add
  `effective_from`/`effective_to` to `measure_dimension_scope` when a real
  scope-change-over-time appears). See §7.

## 3. Columns + semantics

Current shape: `measure_dimension_applicability (id, measure_id, dimension,
member_id)`, unique `uq_mda (measure_id, dimension, member_id)` — 75 rows.
(Sibling: `measure_dimension_scope (id, measure_id, dimension, expansion_mode)` —
1,170 rows — is the "which dimension, what mode" table; untouched here, §7.)

Add to `measure_dimension_applicability`:
- `effective_from` — `date`, **nullable** (NULL = always valid; existing behaviour,
  no backfill).
- `effective_to` — `date`, **nullable** (NULL = still valid; a value = member
  retirement).

Rules:
- The default **"no applicability rows = all members valid"** stays for un-dated
  measures. An effective-dated expectation must be an **explicit** applicability
  row — you cannot date the *absence* of a row.
- `effective_to >= effective_from`.
- Keep `uq_mda` as-is: **one window per `(measure, dimension, member)`**. Multiple
  disjoint windows for the same member (valid, retired, re-introduced) is an edge
  case — defer until real; would extend the key to include `effective_from`.

## 4. Comparison is by FISCAL YEAR, not raw calendar date (Eugene's ruling)

`effective_from` is stored as a date, but a submission is compared by **fiscal
year**: for a utility whose FY spans two calendar years, `effective_from` in 2026
means **FY2026**. A report_period is "on/after" iff its fiscal year ≥
`effective_from`'s fiscal year (FY2026 submissions and later include it; FY2025 and
earlier do not; monthly periods within FY2026 are included). The period's fiscal
year derives from `report_date` + `report_type` + the utility's `financial_year_end`.

## 5. How shell creation uses it

Shell / expected-input generation runs per `(utility, report_period P)`. Today it
expands each active measure across `(applicability members ∩ context)` and filters
measures by `is_active = true` (e.g. `app/data-entry/enter-data/service.ts`). The
change is a single added predicate on the **applicability** rows selected for P:

```
(effective_from IS NULL OR fy(P) >= fy(effective_from))
AND (effective_to IS NULL OR fy(P) <  fy(effective_to))
```

A measure whose only applicable members are `effective_from = FY2026` therefore
produces **no shells before FY2026**, and from FY2026 those shells appear. Scope
expansion, context intersection, and everything else run unchanged on the
period-filtered member set.

## 6. New expectations are mandatory from their effective period

Per Eugene: a newly effective-dated expectation is added as a **mandatory** input
for the next benchmarking report from its effective period — the generated shell
carries mandatory status (ties to `is_mandatory` / shell status), so an unfilled
shell shows up in the gap report.

## 7. Deferred: scope-level effective-dating

If a measure's *dimension behaviour* itself needs to change over time (turn a cut
on/off, or `all_members` → `by_context`), add `effective_from`/`effective_to` to
`measure_dimension_scope` and change `uq_scope` from `(measure_id, dimension)` to
include the effective boundary (time-sliced scope rows). Not built now — the
member-level applicability window covers the current cases.

## 8. Notification to utility primary contacts (linked feature)

When a new effective-dated applicability is created (a new measure/member
expectation), **email the utility's primary contact(s)** with: the rationale, the
definition, how to collect the data, and that it will be a **mandatory** input in
the next benchmarking report. Two pieces:

1. **Primary-contact designation** (owner: #10, registration/user model). Add an
   explicit **`is_primary_contact`** designation on the user record (per org) — a
   utility can nominate specific people. Natural default: the **BLO** (already the
   "Utility Liaison / single contact point"), but keep it an explicit flag, not a
   role synonym, so it's not conflated with the role.
2. **Notification trigger** — on creation of an effective-dated applicability,
   dispatch the email to those contacts. A distinct, small feature riding on the
   effective-dating (fits alongside the existing alerting / email-schedule model).

## 9. Relationships

- **ADR 0004 (effective-dated dimensions):** this is the pattern's concrete
  application at the measure/expectation level (3rd instance: units-stints, this,
  deferred tariff/transmission).
- **Report snapshots (Q8):** the applicability effective-window is metadata frozen
  in a Benchmarking Report snapshot — a frozen report reflects the expectations
  effective at its cut-off.
- **#10:** owns the primary-contact field + notification (§8).
- **Shell/expected-input generation:** the single integration point (§5).

## 10. Open items

- [ ] #10 to own the `is_primary_contact` field + the notification trigger (§8).
- [ ] Confirm `fy(P)` derivation reuses the canonical period-dim fiscal-year logic
      (shared with the report-versioning + unit-lifecycle specs).
- [ ] Mandatory-from-effective: confirm it always applies, or per-measure opt-in.
