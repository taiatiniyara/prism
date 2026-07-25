# PRISM 2 — Data-Entry UX Requirements (error-prevention patterns)

**For:** the entry-UI build (enter-data-v2). **Status:** requirements · 2026-07-22
**Principle throughout:** make the correct interpretation the ONLY representable one — anchor
every ambiguous entry to a value the user can see/verify, rather than relying on convention or
mental arithmetic.

---

## 1. Tariff Block Limits — cumulative-from-zero, never incremental

**Problem:** a lone "block limit" number is ambiguous between cumulative-from-zero and
incremental-from-previous-block. Users sometimes enter the latter.

**Requirement — range entry with auto-filled, read-only lower bound.** Present each rate as a
range where the lower bound is auto-filled and shown read-only; the user keys only the upper
(cumulative) bound:

```
Rate 1:  From    0  →  To [ 100 ]  kWh
Rate 2:  From  100  →  To [ 300 ]  kWh    (100 auto-filled from Rate 1, read-only)
Rate 3:  From  300  →  To    ∞           (final rate — no limit to enter)
```

- For a tariff with **N rates there are N−1 block limits** (the final rate is unbounded).
- Storage = the CUMULATIVE upper limit per block. Lower bound is derived (0 / previous limit),
  never stored, never entered.
- **Validation (hard):** limits strictly increasing — each upper > its auto-filled lower.
  Reject with a specific message ("Block 2 limit (200) must exceed Block 1 limit (100)").
- **Live preview:** show the resulting bands (0–100, 100–300, 300+) as the user types.

## 2. Tariff Rates & Charges — tax-exclusive entry, tax-inclusive verification

**Problem:** the BLO knows the tax-INCLUSIVE (published) rate; the system needs tax-EXCLUSIVE
(VAT/GST is a separate measure). Mentally stripping tax is error-prone.

**Requirement — enter exclusive, verify inclusive.** Each rate/charge field takes the
tax-exclusive value; the screen computes and shows the tax-inclusive figure live for verification:

```
Residential Rate 1 (excl. VAT/GST):  [ 0.30 ] /kWh
                   → incl. 15% VAT:     0.345  /kWh   (auto, read-only)
                   "Confirm this matches your published customer rate"
```

- Applies to Tariff Rate per kWh AND Tariff Fixed Monthly Charge.
- **Ordering dependency:** collect the Tariff VAT/GST Rate BEFORE rates/charges, or grey out the
  inclusive preview with "enter your VAT/GST rate to enable the tax-inclusive check".
- Optional end-of-step attestation: "rates entered exclude VAT/GST".
- Storage stays tax-exclusive (the comparable basis); inclusive is always derivable as
  rate × (1 + tax rate).

## 3. Tariff structure declaration (drives shell generation)

The BLO declares, per (customer_type × payment_mode) they offer: the number of RATES N and
whether a fixed monthly charge applies. They do NOT pick tariff measures from a list. Shells
generate: N rates + N−1 limits + fixed charge + VAT rate. See spec §3B.5.

## 4. BLO context-confirmation journey (new period)

On a new report period, the modal walks context categories — service areas, generators, storage,
tariffs, transmission — asking "same as last period, or changed?". It edits the CONTEXT PROFILE
(registry, tariff structure, flags), not a measure list. On completion, shells regenerate. See
spec §3B.4. Expected-input count = number of shells generated (computed, exact).

## 5. Validation-at-entry (all measures)

Every value (typed or imported) is checked against the utility's own history and peer ranges
(e.g. "you entered 4,821; last period was 48,210 — missing a zero?"). Covers both the UI and the
Excel-import path via one shared validation service. (From the AI-optimisation review, Q5.)

## 6. Generation energy-balance validation (per generator, per period)

**Problem:** entered generation data sometimes implies a generator ran + was down for MORE than
the hours available in the period — physically impossible.

**The four collected generation measures per generator:** Rated Capacity (RC, MW),
Electricity Generated (EG, MWh), Planned Downtime (PD, h), Unplanned Downtime (UD, h) — checked
against Hours in Period (HP, h).

**Derived:**
- Equivalent full-load hours **EFLH = EG ÷ RC** (the hours the unit would run at nameplate to
  produce EG).
- Available hours **AH = HP − PD − UD**.

**Checks (alert the DAOO/BLO on failure, with the arithmetic + what to review):**
1. **PD + UD ≤ HP** — downtime can't exceed the period. (hard)
2. **EG ≤ RC × (HP − PD − UD)** i.e. EFLH + PD + UD ≤ HP — the unit can't generate during
   downtime. This is the core check that catches the reported problem. (hard)
3. **Capacity factor EG ÷ (RC × HP) ≤ 1** — can't exceed nameplate over the period. (hard)
4. Soft: implausibly high capacity factor (e.g. >0.9 for non-baseload) → review flag.

**Alert wording (name the unit, show the sum, list likely causes):**
> "Bualevu Genset 2: 9,000 MWh ÷ 1 MW = 9,000 equivalent full-load hours, plus 200 h planned +
> 100 h unplanned downtime = 9,300 h — but the period has only 8,760 h (8,460 h available after
> downtime). Review: (a) is Rated Capacity correct — was the unit derated, or is capacity in kW
> not MW? (b) is Electricity Generated in MWh not kWh? (c) are downtime hours overstated or
> double-counted? (d) is Hours in Period correct for this window?"

The check runs per generating unit (equipment grain), on the UI and the import path.

## 7. Per-period energy-resource state (Rated Capacity + active/inactive) — ALREADY EXISTS

Generators/storage are added and decommissioned over time, and can be **derated** within a period.
This is **already handled** by `energy_resources.period_entries` — a jsonb array of
`{ is_active, capacity_mw, report_period_id }` per period. No new table needed.

- **Active/inactive per period** drives shell generation: only units with `is_active = true` for
  the current report period get generation shells. Managed in the BLO context journey (§4).
- **Rated Capacity** for the period is `period_entries[…].capacity_mw` — pre-filled from the
  registry/last period but editable if the unit was derated. The energy-balance check (§6) uses
  this period value, not a static registry figure.
- **Gap to note:** `capacity_mw` is currently NULL on many rows (see the Virtual GEN examples) —
  it must be populated for the §6 balance check to work. Where a unit is a real generator (not a
  virtual aggregate), capacity should carry across from setup and be confirmed each period.

This jsonb is part of the Context Profile (spec §3B); shell generation and validation read it
per period.

## 8. BMO country-context annual update journey

**16 country-context measures** are updated by the BMO for **each country, each year** (not by the
BLO). Build a BMO-facing journey:

- BMO picks a country + year → sees the 16 measures with **last year's values** alongside
  **AI-suggested current values sourced externally** (World Bank, IMF, UN, national statistics
  offices — with source + vintage cited).
- **Where sources disagree**, present the candidate values side by side (each with its source and
  year); the BMO chooses which to settle on. Never silently pick one.
- AI assists: fetch candidates, cite the source, and flag large year-on-year changes for review.
- Confirmed values write as the country-context measures for that year (utility-independent,
  agg_level = Country).
