# Data-availability response design — separating "Not Available" from workflow status

**Status:** RATIFIED (2026-08-12; core + is_relevant/is_mandatory/asserted_not_applicable three-tier) · **Author:** #2/jolly (migration) · **For:** #4 (data_entries DDL), #3 (calculator), #11 (entry UI)

## 1. The problem

Today a data-entry answer of *"this input can't be found / the utility doesn't have it"* is
recorded by setting **`status_id = 7 (Not_Available)`**. That overloads one column with two
unrelated ideas:

- **Workflow state** — where the entry is in the review lifecycle (Requested → Pending →
  Entered → Reviewed → Approved).
- **Answer availability** — whether the utility actually gave a value, confirmed *no* value
  exists, or hasn't answered yet.

Consequences of the overload:
- A "not available" answer is stuck at status 7 — it can't independently be **Approved** and
  therefore **can't be published/benchmarked** (`is_approved = status_id >= 5`), even though a
  confirmed "no data" **is a real, reviewable answer**.
- "Not available" (status 7) is easily confused with an **empty/awaiting** shell (status 1) —
  both have no value — so reports can't tell *"utility confirmed none"* from *"nobody answered
  yet"*.

As Eugene put it: **"Entered" should split into (1) contains a value, (2) data not available** —
and those shouldn't be workflow states.

## 2. Recommendation — two orthogonal axes

Keep `status_id` as the **workflow** axis and add a separate **answer-availability** axis.

1. **`status_id`** stays the lifecycle only: Requested / Pending / Entered / Reviewed / Approved.
   **Retire `Not_Available (7)`** as a status.
2. **New column `data_entries.no_data_reason`** (nullable) records *why there is no value*.
   `NULL` = normal (a value was given, or the row is still awaiting). Set it when the utility
   confirms there is no value.

A "data not available" answer is then a **first-class, approvable answer**: it can move through
Entered → Reviewed → **Approved** and publish, exactly like a value — the two are just different
*kinds of answer*, not different workflow states.

### The three answer-states (derivable, not a stored 4th concept)

| answer-state | typed value column | `no_data_reason` | `status_id` example | meaning |
|---|---|---|---|---|
| **Value** | one set | NULL | 3 Entered … 5 Approved | a real value was recorded |
| **Not available** | none | `'not_available'` | 3 Entered … 5 Approved | utility confirmed there is no value |
| **Awaiting** | none | NULL | 1 Requested | empty shell, not yet answered |

## 3. Schema changes (`data_entries`) — #4 owns

1. **Add** `no_data_reason varchar(32)` **nullable**, constrained to a controlled vocabulary,
   extensible:
   ```sql
   ALTER TABLE data_entries ADD COLUMN no_data_reason varchar(32);
   ALTER TABLE data_entries ADD CONSTRAINT chk_no_data_reason
     CHECK (no_data_reason IS NULL OR no_data_reason IN ('not_available','asserted_not_applicable'));
   ```
   **Vocab FINALISED (2026-08-12): `{ 'not_available', 'asserted_not_applicable' }`** — same set on
   `data_entries.no_data_reason` and the `kpi_actual` not-available marker (#4 owns both DDLs).
   - `not_available` — in scope and applies, but the utility can't provide the value.
   - `asserted_not_applicable` — the utility **asserts** an in-scope, **non-mandatory** input
     doesn't apply to them. (Named `asserted_not_applicable`, *not* bare `not_applicable`, because
     `not_applicable` is already a `measure_dimension_scope.expansion_mode` config value and a
     computed-relevance concept — see the term-collision note in §3.1.) The three-tier gating and
     the non-overlap vs `is_relevant` are defined in **§3.1**.
   - *(Alternative: a managed list "No-Data Reason" if BMOs should configure reasons. Given the
     set is tiny and semantic, a CHECK'd varchar is simpler and matches `status_id` being a code
     enum rather than a managed list. #4's call — went with the CHECK'd varchar.)*

2. **Mutual-exclusion constraint** — a row can't be both a value and a no-data answer:
   ```sql
   -- extend/complement chk_one_value: at most one of {a typed value, no_data_reason}
   CHECK ( (num_nonnulls(value_numeric, value_boolean, value_text, value_option_id) > 0)::int
         + (no_data_reason IS NOT NULL)::int  <= 1 )
   ```

3. **Retire `status_id = 7`** — migrate existing rows in the same change:
   ```sql
   UPDATE data_entries SET no_data_reason = 'not_available', status_id = 5
   WHERE status_id = 7;   -- they were confirmed answers → Approved + not_available
   ```
   Mark `DataEntryStatusId.Not_Available` `@deprecated` in code (retired, like Endorsed→Approved).

4. **(Optional convenience)** a generated `answer_state` column, or just derive it in Silver
   (§4). Deriving is cleaner (no dual-encoding) — recommended.

### 3.1 Applicability — the three-tier layering (RATIFIED with #8, 2026-08-12)

#4 flagged that a "doesn't apply" reason could collide with the existing `is_relevant` column.
Eugene + #8 resolved it into **three layered tiers**, each answering a different question and owned
by a different actor. Availability is an *answer* at an existing address; it never creates,
destroys, or reclassifies an address — so it composes with grain, the unique address, and shell
generation with **zero interaction** (it's the same principle as `chk_one_value` already allowing
an all-null-value row whose reason lives in workflow columns).

| Tier | Column / signal | Question | Owner |
|---|---|---|---|
| 1. **Scope** | `is_relevant` / computed relevance | Is this input in the utility's **expected set at all**? `false` ⇒ no shell. | system + BMO registry |
| 2. **Obligation** | `measure_definitions.is_mandatory` | For an in-scope input, **must** it be answered with data (PPA core set)? | BMO catalogue policy |
| 3. **Assertion** | `no_data_reason = 'asserted_not_applicable'` | On an in-scope, **non-mandatory** shell, the utility asserts *"doesn't apply to us."* | utility (BMO adjudicates) |

**The assertion is gated to in-scope, `is_mandatory = false` shells only.** Three enforcement rules:
- **(a) UI:** the "doesn't apply" option does **not** render on mandatory shells (#11).
- **(b) Writer (shared choke point):** rejects `asserted_not_applicable` against `is_mandatory = true`
  — holds for API / bulk / migration paths too, not just the screen (#4/me).
- **(c) Mandatory + no data ⇒ the only honest answer is `not_available`** — which **stays a visible
  gap**, counts against completeness, and can feed escalation. A utility can *explain* a missing
  core number, never *dissolve the expectation* of it.
- **Edge case:** if a mandatory measure genuinely doesn't apply to a utility, then **relevance was
  wrong** → fix via the BMO relevance registry (the established human path), never via an assertion.

**State matrix** (`no_data_reason` only meaningful on in-scope rows — enforce structurally, below):

| `is_relevant` | `is_mandatory` | value | `no_data_reason` | meaning |
|---|---|---|---|---|
| **false** | — | — | (n/a) | out of scope — no shell |
| true | any | set | NULL | a value |
| true | any | — | `not_available` | in scope, applies, couldn't obtain (mandatory ⇒ a real gap) |
| true | **false** | — | `asserted_not_applicable` | utility asserts it doesn't apply |
| true | **true** | — | `asserted_not_applicable` | **INVALID — writer rejects** |
| true | any | — | NULL | awaiting (not yet answered) |

**Structural hardening (bank these):**
- Under the relevance rework, out-of-scope inputs ideally get **no row at all** (shells created
  in-scope only) — then "reason only on in-scope rows" enforces itself.
- Wherever an `is_relevant` column survives on entries, add the cheap CHECK:
  `no_data_reason IS NOT NULL ⇒ is_relevant = true`.

**⚠ Term-collision (#8):** `not_applicable` now lives in **three** distinct roles — (i)
`measure_dimension_scope.expansion_mode` (config: a dimension is sparsified for a measure), (ii)
computed relevance (system scope), (iii) the utility assertion. They are distinct enums in distinct
tables, but the **glossary (`CONTEXT.md`) must disambiguate all three**, and the assertion value is
therefore named **`asserted_not_applicable`** so logs/queries never confuse config with assertion.

**Why the assertion earns its own value (rationale — Eugene):** the PRISM team marks some inputs
mandatory/expected for everyone, but a number **genuinely don't apply to smaller utilities**. The
assertion is the utility's channel to say so, and the **aggregate is a learning signal** for which
measures should shift onto the relevance side. Today's relevance = the *hypothesis*;
`asserted_not_applicable` = the *evidence that refines it*.

**Feedback loop — recommendation queue, NEVER automatic (#8):** an assertion must **not** silently
mutate system scope (that would let a data-entry action shrink a utility's own expected set → fewer
flagged gaps → quietly inflated completeness — an integrity risk for a benchmarking product).
Instead: repeated assertions (same input, N≈2–3 consecutive periods) surface a **review candidate**
to the BMO/BLO — *"utility asserts X doesn't apply; consider scoping out via the relevance
registry"* — and a **human** moves scope in the registry (already the BMO-governed home of relevance
and a gold dirty-event). **Assertion = per-period answer; permanent inapplicability = registry
decision.** The queue is designed-in; the *acting* on it stays human, forever.

**Calculator (#3, §9.1, CONFIRMED):** `asserted_not_applicable` → additive formulas treat as
**absent (0-contribution)**, else propagate; `not_available` → **propagate** not-available.

**Carve-outs (owner: Eugene / BMO — not a code stream):**
- The `is_mandatory` values are **PRISM-1 legacy** — a **BMO curation pass over the 117-measure
  catalogue** is required **before this feature ships** (a domain exercise, on Eugene's queue).
- **Completeness metrics must report CORE (mandatory) completeness separately from overall.**
- Per-relationship / per-size mandatory tiers are explicit **v2** (same `is_mandatory` flag) —
  do not build now.

## 4. Views / reporting (Silver + Gold) — #4

- **`value_display`**: when `no_data_reason` is set → show **"Not Available"** (or the mapped
  label per reason); when a value is set → the value; when awaiting → blank.
- **`is_approved` UNCHANGED** — still `status_id >= 5`. A not-available answer at Approved now
  **publishes**, which is the whole point.
- **Expose `no_data_reason` (and a derived `answer_state`)** in `silver.data_entries_enriched`
  and downstream (AI dictionary, Power BI, benchmarking) so consumers can distinguish
  *no-data* from *has-value* from *awaiting*. **Critical for benchmarking:** "not available"
  must not be silently treated as `0` or as a gap.

## 5. Downstream implications (flagged for owners) — all CONFIRMED 2026-08-12

- **Calculator (#3, §9.1):** `not_available` → **propagate** not-available (KPI becomes
  not-available, never zero-filled, propagating up the graph + rollups); `asserted_not_applicable`
  → additive formulas treat as **absent (0-contribution)**, else propagate. **Not-available ≠ 0.**
  `kpi_actual` must be able to store a computed not-available (null value + reason marker, same
  vocab as `data_entries.no_data_reason`) so a propagated result is honest, not `0`/gap (#4's DDL).
- **Entry UI (#11):** a per-cell **"Data not available"** action (distinct from blank/awaiting)
  that sets `no_data_reason` + display of "Not Available", replacing the status-dropdown option.
  **Must NOT render on `is_mandatory = true` shells** (§3.1 rule a). Bundled with #11's grain-entry
  pass; journey-affecting → USER-IMPACT row on the commit.
- **Migration / loader / reconciliation (me):** add `no_data_reason` to the extract format
  (`ExtractRow` / `EXTRACT_COLUMNS` / parser / loader / template + spec), carrying the exact codes
  **`{ 'not_available', 'asserted_not_applicable' }`**. p1 "Not Available" rows load as
  `status_id = 5, no_data_reason = 'not_available'` (a confirmed answer, not an empty shell) — p1
  is expected to have only the `not_available` flavour (confirm on the reload). The **loader is a
  writer path**, so it must honour the mandatory gate (§3.1 rule b): reject
  `asserted_not_applicable` on `is_mandatory = true` measures (→ rejection ledger). Reconciliation:
  a not-available row is an **answered** shell — add a control-total line or fold it into the
  "filled" side so fill/leak balances hold. **Gated on #4 landing the `no_data_reason` column.**

## 6. Ownership summary

| Area | Owner |
|---|---|
| `data_entries` **+ `kpi_actual`** DDL: `no_data_reason` column + CHECKs (vocab `{not_available, asserted_not_applicable}`) + `chk_value_xor_nodata` + status-7 migration + Silver/Gold view changes | **#4** |
| Relevance-model boundary + the `asserted_not_applicable` → registry recommendation queue | **#8** |
| Calculator propagation / 0-contribution rules; `kpi_actual` not-available representation | **#3** |
| Entry-screen "Data not available" toggle + display + mandatory gating (rule a) | **#11** |
| Extract format + loader (writer-gate, rule b) + reconciliation for `no_data_reason` | **#2/jolly (me)** |
| **BMO curation of `is_mandatory` over the 117-measure catalogue (before ship)** + core-vs-overall completeness | **Eugene / BMO** |

Net: **scope (`is_relevant`) → obligation (`is_mandatory`) → answer-availability (`no_data_reason`)**
— three layered tiers. "Not available" is a real, approvable, publishable answer benchmarking never
mistakes for zero or a gap; a utility can explain a missing core number but never dissolve the
expectation of it; and the utility-influenceable surface is the optional periphery only, always
assert-then-BMO-adjudicates.
