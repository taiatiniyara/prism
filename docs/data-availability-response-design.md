# Data-availability response design — separating "Not Available" from workflow status

**Status:** proposed (2026-08-06) · **Author:** #2/jolly (migration) · **For:** #4 (data_entries DDL), #3 (calculator), #11 (entry UI)

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
     CHECK (no_data_reason IS NULL OR no_data_reason IN ('not_available','not_applicable'));
   ```
   - `not_available` — in scope and applies, but the utility can't provide the value.
   - `not_applicable` — in scope per the system, but the utility **asserts** it doesn't apply to
     them. **Both values ship** (ruled by Eugene 2026-08-06) — the clean, non-overlapping split
     vs the existing `is_relevant` column is defined in **§3.1**.
   - *(Alternative: a managed list "No-Data Reason" if BMOs should configure reasons. Given the
     set is tiny and semantic, a CHECK'd varchar is simpler and matches `status_id` being a code
     enum rather than a managed list. #4's call.)*

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

### 3.1 Applicability — `is_relevant` (system scope) vs `not_applicable` (utility-asserted)

#4 flagged that `not_applicable` could collide with the existing `is_relevant` column (both read
as "doesn't apply"). Eugene ruled: **keep both, with an explicit, non-overlapping split.** They
answer *different questions*:

- **`is_relevant` — system / model SCOPE.** Set by the relevance model (→ computed relevance) from
  the utility's known characteristics. Answers *"is this input in the utility's EXPECTED set at
  all?"* `is_relevant = false` ⇒ **out of scope** — not asked, no expected shell. A system,
  up-front determination.
- **`no_data_reason = 'not_applicable'` — utility-ASSERTED inapplicability.** For an input that is
  **in scope** (`is_relevant = true`, the system expects it), the utility asserts at entry time
  *"this doesn't apply to us."* A per-answer, utility-driven signal — typically the utility
  **refining / correcting** the system's relevance. It is an *answer*, not a scope call.

**Non-overlap invariant:** `no_data_reason` is only meaningful on **in-scope (`is_relevant = true`)
rows.** So the two encodings never collide:

| `is_relevant` | value | `no_data_reason` | meaning | whose call |
|---|---|---|---|---|
| **false** | — | (n/a) | out of scope — not expected/asked | system (relevance) |
| true | set | NULL | a value | utility |
| true | — | `not_available` | in scope, applies, couldn't obtain | utility |
| true | — | `not_applicable` | in scope per system, utility asserts it doesn't apply | utility |
| true | — | NULL | awaiting (not yet answered) | — |

**Why `not_applicable` earns a distinct value (rationale — Eugene, 2026-08-06):** the PRISM
Project team currently marks some inputs as **mandatory / expected for everyone** (`is_relevant =
true`), but a number of these **genuinely don't apply to smaller utilities**. `not_applicable` is
the utility's channel to say so on an in-scope input — and the **aggregate of those assertions is
a learning signal**: it tells us which "mandatory" measures should be **shifted onto the relevance
side** (made not-relevant) for particular utility classes. So `not_applicable` is precisely the
**correction feedback for `is_relevant`** — which is exactly why it must be its own value and not
folded into the relevance column: today's relevance model is the *hypothesis*, `not_applicable`
is the *evidence that refines it*.

**Calculator (#3, §9.1):** `not_applicable` → additive formulas treat as **absent (0-contribution)**;
`not_available` → **propagate** not-available.

**Relevance-model coordination (#8) — to ratify:** this split assumes SCOPE lives in relevance
(`is_relevant` / computed relevance) and PER-ANSWER inapplicability lives in `no_data_reason`.
1. Confirm the scope-vs-assertion boundary holds (computed relevance sets the expected set;
   `no_data_reason` never sets scope).
2. **The feedback loop is design intent, not an afterthought** (see rationale above): a report of
   `not_applicable` rates per measure × utility-class is the input to deciding which measures move
   to the relevance side. The *automated* feedback can be phased, but the model should be designed
   knowing this signal exists and is the reason the two encodings are kept separate. #8 owns how/
   when `not_applicable` evidence feeds computed relevance.

## 4. Views / reporting (Silver + Gold) — #4

- **`value_display`**: when `no_data_reason` is set → show **"Not Available"** (or the mapped
  label per reason); when a value is set → the value; when awaiting → blank.
- **`is_approved` UNCHANGED** — still `status_id >= 5`. A not-available answer at Approved now
  **publishes**, which is the whole point.
- **Expose `no_data_reason` (and a derived `answer_state`)** in `silver.data_entries_enriched`
  and downstream (AI dictionary, Power BI, benchmarking) so consumers can distinguish
  *no-data* from *has-value* from *awaiting*. **Critical for benchmarking:** "not available"
  must not be silently treated as `0` or as a gap.

## 5. Downstream implications (flagged for owners)

- **Calculator (#3):** a KPI input that is *not available* (no value, `no_data_reason` set) must
  be handled explicitly — the KPI is likely **not computable** (result null / not-available) or
  the input is excluded per the formula's rules. **Not-available ≠ 0.** #3 decides the rule.
- **Entry UI (#11):** the entry screen needs an explicit **"Data not available"** action per
  cell (distinct from leaving it blank/awaiting) that sets `no_data_reason`, plus display of
  "Not Available". The old status-dropdown "Not Available" option is replaced by this toggle.
- **Migration (me):** add `no_data_reason` to the extract format (ExtractRow / EXTRACT_COLUMNS /
  parser / loader / template + spec). p1 "Not Available" rows load as
  `status_id = 5, no_data_reason = 'not_available'` (a confirmed answer), **not** as empty
  shells. Reconciliation: a not-available row is an **answered** shell — either add a
  `values_not_available` control-total line or fold it into the "filled" side so the fill/leak
  balances still hold (loader detail to confirm with the reload).

## 6. Ownership summary

| Area | Owner |
|---|---|
| `data_entries` DDL: `no_data_reason` column + CHECKs + status-7 migration + Silver/Gold view changes | **#4** |
| Calculator handling of not-available inputs | **#3** |
| Entry-screen "Data not available" toggle + display | **#11** |
| Extract format + loader + reconciliation for `no_data_reason` | **#2/jolly (me)** |

Net: **status = workflow, `no_data_reason` = availability.** "Not available" becomes a real,
approvable, publishable answer that benchmarking can see and never mistakes for zero or a gap.
