-- Hours Worked (290 Standard / 291 Actual / 292 Paid) — relevance-catalogue
-- reconciliation to match the sponsors' intent (Eugene 2026-08-25, "Path B").
--
-- Business need: hours by utility_function, and within Generation, the proportion on
-- conventional vs renewable energy. Decision: CAPTURE generation hours at the
-- technology grain (as migrated) and ROLL UP technology -> category (Conventional/
-- Renewable) for the sponsor KPI in the calculator (#3) — technology is the parent-less
-- capture grain, category is the reporting axis. No shell re-graining; the migrated
-- technology-level data is preserved.
--
-- Two catalogue fixes so scope/applicability match the captured data:
--
-- (1) Ancillary Services (member 1030) is a real 4th utility_function — all utility
--     areas not directly generation/transmission/distribution. 290/291/292 already
--     carry Ancillary Services shells, but their utility_function applicability listed
--     only {Generation, Transmission, Distribution}. Add Ancillary Services.
--
-- (2) Declare source (technology) as by_context for these measures — the Generation
--     hours are captured per generation technology, so the catalogue must say so.
--     GENERATOR RULE (documented, applied in the generator, not expressible in the flat
--     scope table): the energy dimensions (provider / type / source / resource_type)
--     expand ONLY under the Generation utility_function member; Transmission /
--     Distribution / Ancillary Services rows carry the All member.
--
-- Applied to dev 2026-08-25. Run per environment. Idempotent.

-- (1) Ancillary Services into the utility_function applicability of 290/291/292
INSERT INTO measure_dimension_applicability (measure_id, dimension, member_id)
  SELECT m.id, 'utility_function', 1030
  FROM (VALUES (290), (291), (292)) AS m(id)
  WHERE NOT EXISTS (
    SELECT 1 FROM measure_dimension_applicability a
    WHERE a.measure_id = m.id AND a.dimension = 'utility_function' AND a.member_id = 1030
  );

-- (2) technology (source) becomes a context-expanded dimension for these measures
UPDATE measure_dimension_scope
  SET expansion_mode = 'by_context'
  WHERE measure_id IN (290, 291, 292)
    AND dimension = 'source'
    AND expansion_mode <> 'by_context';
