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
   - `not_available` — exists in principle but the utility can't provide it (the current need).
   - `not_applicable` — the measure doesn't apply to this utility (recommended to include now; a
     genuinely different, useful distinction for benchmarking).
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
