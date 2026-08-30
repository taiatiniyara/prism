---
Genre:
  - PRISM QA Note
Relating to:
  - "[[P2314 — PRISM 2 Source Repoint (Power BI Data Connections)]]"
  - "[[2026-08-24 PRISM 2 PBIX -- Errors Report for API Queried Data Inputs]]"
PR: https://github.com/taiatiniyara/prism/pull/131
---

# PBIX API Feed Fixes — Resolution Report (2026-08-25)

Resolution report for every issue raised in the **2026-08-24 Errors Report for
API Queried Data Inputs**. Each finding was traced to root cause against the
live database and the prism-training source (`data_entry_main` via
`/api/migration/dataEntry` + `/api/dataEntryMain`) rather than fixed by
inference. All fixes are on branch `pbi-feed-fixes`, published as **PR #131**,
verified end-to-end through the running endpoints.

---

## 1. Method

1. **Ground truth first.** The measure catalogue artifacts under
   `docs/measures-enrichment/` predate the Pass-2 id renumbering, so nothing was
   fixed from them. Every measure id/name/subgroup/grain claim was verified with
   direct SQL against `measure_definitions`, `data_entries`, `managed_lists`,
   and `input_dl_def_mappings`.
2. **Grain histograms per measure** (which of service_area / unit /
   utility_function / technology actually hold values) identified wrong-grain
   joins and missing scoping.
3. **The training source was opened up** once the migration feed endpoint was
   discovered — turning several "data gap" assumptions into provable statements
   (and two of them into fixable data loads).
4. **End-to-end verification**: `scripts/verify-pbi-feeds.ts` invokes each
   route's GET handler with the real API key and asserts the previously-empty
   columns are populated.

---

## 2. Root causes behind the error report

| # | Root cause | Hit |
|---|---|---|
| RC1 | **Wrong join**: `organisations.country_id` (an M49 code) fed into a managed-list-item lookup | Fact Currency |
| RC2 | **Stale column names**: routes emitted catalogue measure names while the PBIX semantic model kept legacy names (renames during migration stripped prefixes / changed plurals) | FinancialAccounts, Safety, Metering, Distribution, UtilityCosts, GeneratorData, UtilityContext |
| RC3 | **Wrong grain join**: matching entries against `unit_id` where the measures are stored at service-area/utility-function grain | Transmission, TariffStructure |
| RC4 | **Missing utility-function scope**: measures 301/302/420 exist twice (Distribution 1025 / Transmission 1026); unscoped `.find()` picked arbitrary rows or none | Metering, Distribution, Transmission |
| RC5 | **Measures never queried**: routes mapped a subset of the table's columns | GeneratorData (5 missing), SaidiAndSaifi (4 missing) |
| RC6 | **Boolean coercion bug**: extract loader accepted only `"true"/"1"`; the source stores `"Yes"/"No"` → all 1,078 governance answers loaded `false` | Governance |
| RC7 | **Multiplier dropped** by the extract migration; USD math treated entered figures as full LCU | UtilityCosts, TariffStructure, FinancialAccounts |
| RC8 | **Schema drift** `country_context.dl_def_id → measure_def_id` (stream #4 landed upstream mid-work) | dimCountry, factCountryContextData |
| RC9 | **Country-context read bridge read the wrong table** (`data_entries`; the 16 context measures live in `country_context`) | factCountryContextData |

---

## 3. Table-by-table resolution

### Fixed in code — verified populated

| Table | Issue | Fix | Verified result |
|---|---|---|---|
| **Dim Country** | `Fuel Regulation` returned raw option ids `890`/`892` | Resolve stored option id → name via the measure's option list (`option_list_id` with same-name list fallback). Merged with #4's subgroup-scoped metric lookup + latest-period pick | `"Price Regulation" / "No Regulation"`, 0 raw ids |
| **Fact Currency** | `CurrencyCode` returned unrelated list items | Join org → `countries.currency_id` → ISO-4217 item name | All codes ISO (`USD, FJD, PGK…`), 0 non-ISO |
| **Fact Distribution** | Network Length / Transformer Capacity empty | Scope by `utility_function_id=1025`; PBIX labels (`Distribution Network …`) | Length=118, Capacity=116 |
| **Fact FinancialAccounts** | Amortization / Income Taxes empty | Label map (`Amortization Expenses→Expense`, `Income Tax→Taxes`, incl. `…USD`) | 32 / 18 values |
| **Fact Metering** | Electricity Customers empty | Scope 301/302 by fn=1025; rename 301 → `Electricity Customers` | 168 values |
| **Fact Safety** | Hours Lost / Total Hours Worked empty | Label map (`Hours lost…→Hours Lost…`, `Hours Worked Actual→Total Hours Worked`) | 39 / 43 values |
| **Fact SAIDI&SAIFI** | 4 of 6 interruption columns never queried | Added measures 461/462/465/466 | ~100 values each |
| **Fact Transmission** | Everything empty | Rewritten: 9 named measures scoped fn=1026 at service-area grain; PBIX labels incl. legacy `Minutes` naming | Length=6, Customers=10, Sold=7; FTE=0 is genuine (`no_data_reason` on all 16 rows) |
| **Fact GeneratorData** | Capacity/fuel/lube/downtime never queried | Added measures 320/380/381/331/333; `Fuel Oil` split by technology into Diesel/HFO columns; PBIX labels (`GEN Installed Capacity`, `Oil for Lubrication`…) | Capacity=1193, Lube=435, Diesel=528, HFO=1, Generated=1078, Downtime=586 |
| **Fact UtilityCosts** | Cost columns empty; hardcoded Multiplier | `Direct Costs:`/`Apportioned Cost:` label map restored; real per-row Multiplier; USD scaled | Staff=77, O&M=77, Fuel&Oil=77 |
| **Dim Generators** | Power Station ID null | Derive from unit's service_area → power_stations when FK null | Route correct; still 0 until `power_stations` is seeded (see §5) |
| **Fact CountryContext** | Identity columns absent; measure names raw | Emit `CountryId/AlphaCode2/AlphaCode3/UtilityId`; label map (`Population→National Population`, `Islands→Number of Islands`, `Households→Number of Households`); per-report-period filter | Identity cols 147/147 each |
| **Fact UtilityContext** | Ownership Type empty | Label `Utility Ownership Type → Ownership Type` (value resolved from `value_option_id`) | 77 values |

### Fixed by correcting the pipeline, then re-loading data

| Item | Detail |
|---|---|
| **Governance booleans (100–113)** | Root cause RC6, confirmed against source: values are literally `"Yes"/"No"`. Fixed coercion in `lib/migration/load.ts::coerce()` (case-insensitive `true/1/yes/y/t/on`, boolean/number aware) and defensively in `app/migration/service.ts`. New `scripts/fix-governance-booleans-from-training.ts` re-reads the governance slice (incl. measure 100 whose `input_dl_def_mappings` row was missing — training dl `4213040046` resolved by name) and upserts in place against the exact dimension signature. Pre-state snapshotted to `backup.gov_pre_bool_fix_20260825`. Result through the live API: **true=842, false=250, null=0** — exact match with source. |
| **Multiplier (RC7)** | Source distribution `Ones:23,727 / Thousands:4,575`; PRISM 2 stores as-entered numbers (verified: 78 exact matches, zero ×1000). Added `data_entries.multiplier varchar(16) NOT NULL DEFAULT 'Ones'` (DDL applied to dev, declared in schema), `lib/pbi/multiplier.ts`, and `scripts/backfill-multipliers-from-training.ts` — which resolves *unmapped* currency measures by name against `/migration/dlDef` (Amortization `4213040106`, Income Taxes `4213040112`, and the function-sliced cost block 141/142 ← Generation/Transmission/Distribution Labor & OM dls). Backfilled **85 rows** to `Thousands` (snapshot `backup.mult_pre_backfill_20260825`). The three currency routes now emit an honest per-row `Multiplier` (uniform, else `"Mixed"`) and compute `<Measure> USD = entered × factor ÷ fxRate`. |

### Evidence-closed — the data does not exist anywhere

Proven by scanning all 28,302 training source rows plus the dl-def catalogue:

| Item | Evidence |
|---|---|
| Transmission/Distribution Downtime **Events** (330/332/340/342) | Training dl defs exist (`Lvl_Organisation Total …Downtime…`) but hold **zero entries**. The Pass-1d deactivation was correct — never collected. |
| Electricity Sent to Grid (**440**) | No matching training dl; deactivated upstream as "not collected". |
| **Tariff Structure** (500–503) | Unmapped and no matching training dls at all — a new PRISM 2 collection. Routes were still corrected (broken unit-join removed) so they will populate the moment utilities report. |
| **power_stations** | Empty table, no training API. Blocked on seeding via settings UI; derivation already wired. |
| Measure **143** Electricity Purchases | Only IPP/Customer-level training dls exist; its 20 rows stay defaulted `Ones` (flagged in the backfill script). |
| Governance **282** Lost Time Frequency Multiplier | 1 of 77 rows valued in both systems — genuinely uncollected. |

---

## 4. Reconciliation with stream #4 (country_context)

Mid-work, `origin/main` moved 71 commits ahead and #4's `dl_def_id →
measure_def_id` repoint landed there. The branch was rebased-as-a-merge onto
origin/main with conflicts resolved deliberately:

- **Took #4 canonical**: `db/schema/country.ts`, `lib/legacy/context-data.ts`
  (the country-context read bridge), country-context settings page/service.
- **Kept this work where upstream lacked it**: identity columns + measure labels
  in `factCountryContextData`; option-id→name resolution in `dimCountry`
  (upstream still emitted raw ids) using `option_list_id` with same-name-list
  fallback (the flag is unpopulated for measure 16).
- **Re-applied after upstream rewrote `load.ts`** (twin-merge dedup): the boolean
  coercion fix survived review.
- Auto-merges verified line-by-line: `multiplier` column, fiscal-year helpers,
  dead-code removals.

The coordination flag for #4 is thereby closed — both lineages coexist cleanly.

---

## 5. Final verification (live API run)

```
Dim Country            27 rows   Fuel Regulation=["Price Regulation","No Regulation"] raw=0
Fact Currency          77 rows   CurrencyCode all ISO, non-ISO=0
Fact Distribution     310 data   Network Length=118  Transformer Cap=116  DownEvents=0*
Fact FinAccounts      147 rows   Amortization Expense=32  Income Taxes=18
Fact Governance       147 rows   true=842 false=250 null=0
Fact Metering         168 vals   Electricity Customers populated (fn 1025)
Fact Safety           39/43      Hours Lost / Total Hours Worked populated
Fact SAIDI&SAIFI      ~100 each  all six interruption columns populated
Fact TariffStructure   78 rp     empty* (new collection — no source data exists)
Fact Transmission     310 data   Len=6 Cust=10 Sold=7 FTE=0†
Fact UtilityCosts     147 rows   Direct/Apportioned columns populated
Fact GeneratorData   1623 gens   Cap=1193 Lube=435 Diesel=528 HFO=1 Gen=1078 Down=586
Dim Generators        535 rows   Power Station ID awaiting seed‡
Fact CountryContext   147 rows   CountryId/A2/A3/UtilityId =147 each
Fact UtilityContext   147 rows   Ownership Type=77

*  excluded from migration / new collection — proven absent from source
†  all transmission FTE rows are explicit no-data answers
‡  blocked on power_stations seeding, derivation wired
```

`tsc` clean · eslint clean · unit tests **384/384** · PR **#131** published.

---

## 6. Artifacts produced

| Artifact | Purpose |
|---|---|
| `scripts/verify-pbi-feeds.ts` | Reusable harness: runs every dim/fact endpoint and asserts previously-broken columns |
| `scripts/fix-governance-booleans-from-training.ts` | Idempotent governance reload from training (`--dry-run` supported) |
| `scripts/backfill-multipliers-from-training.ts` | Idempotent multiplier backfill (`--dry-run` supported) |
| `scripts/_gap-scan.ts` | Diagnostic: per-measure source-vs-P2 coverage diff + multiplier tally |
| `lib/pbi/multiplier.ts` | Shared factor map + uniform/Mixed roll-up |
| `backup.gov_pre_bool_fix_20260825` / `backup.mult_pre_backfill_20260825` | Pre-change snapshots |

## 7. Recommended follow-ups (out of scope here)

1. **Value-level diffs** — some financial/interruption measures have fewer
   values than the source offers (e.g. Revenue 51/77). Run the built-in
   Migration → Data Entry Comparison panel per utility to triage.
2. **Non-currency Thousands labels** — interruptions/energy rows carry
   `Thousands` in places; left untouched (scaling counts/MWh wasn't requested).
   Same backfill pattern applies if wanted.
3. **Populate `measure_definitions.option_list_id`** for option-typed measures
   (currently NULL for measure 16; the dimCountry fallback covers it, but the
   explicit flag is the intended mechanism).
4. **Seed power stations** to light up Dim Generators' Power Station ID.
5. Future extract loads automatically get correct booleans via the fixed
   `coerce()`; consider teaching the extract template/loader about `multiplier`
   so new loads persist it natively.
