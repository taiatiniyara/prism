-- Fix 9 mis-pinned formula_binding_dimension.member_id rows discovered by a
-- full-table audit of every KPI's formula bindings (2026-09-25). Each row
-- was individually verified: gender/division pinned to the wrong member,
-- diverging from every sibling department's identical KPI structure.
-- See docs/superpowers/plans/2026-09-25-kpi-formula-binding-fixes.md Task 1.
--
-- Run `scripts/resync-kpi-formula-inputs-cache.ts` for kpiDefIds
-- [62,63,78,79,80,82,89] immediately after applying this, to keep the
-- kpi_definitions.formula_inputs JSON cache in lockstep (it is NOT the
-- source of truth and the compute engine ignores it once bindings exist,
-- but downstream display code still reads it).

BEGIN;

-- KPI 62 "Total Employees Female": finance_employees_female was pinned to
-- the Executive division instead of Finance.
UPDATE formula_binding_dimension SET member_id = 1014 WHERE id = 484;

-- KPI 63 "Total Employees": both employees_male and employees_female were
-- pinned to gender "All" instead of their own gender — meaning the formula
-- summed the same utility-wide total twice instead of male + female.
UPDATE formula_binding_dimension SET member_id = 930 WHERE id = 479;
UPDATE formula_binding_dimension SET member_id = 931 WHERE id = 477;

-- KPI 78 "PR Marketing and CustService Employees Total":
-- pr_and_marketing_employees_male was pinned to gender "All" instead of Male.
UPDATE formula_binding_dimension SET member_id = 930 WHERE id = 552;

-- KPI 79 "PR Marketing and CustService Employees Male %": both bindings were
-- pinned to the Administrative division instead of PR & Marketing.
UPDATE formula_binding_dimension SET member_id = 1018 WHERE id = 545;
UPDATE formula_binding_dimension SET member_id = 1018 WHERE id = 547;

-- KPI 80 "PR Marketing and CustService Employees Female %":
-- pr_and_marketing_employees_female was pinned to gender "All" instead of Female.
UPDATE formula_binding_dimension SET member_id = 931 WHERE id = 542;

-- KPI 82 "Administrative Employees Male %": administrative_employees_total
-- was pinned to division "All" (utility-wide) instead of Administrative,
-- so the Male % denominator was the whole utility's headcount, not the
-- department's.
UPDATE formula_binding_dimension SET member_id = 1020 WHERE id = 35;

-- KPI 89 "Other Divisions Employees Female %": other_employees_total was
-- pinned to division "All" instead of Other, same class of bug as KPI 82.
UPDATE formula_binding_dimension SET member_id = 1021 WHERE id = 522;

COMMIT;
