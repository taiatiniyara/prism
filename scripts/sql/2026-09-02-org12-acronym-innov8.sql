-- organisations.acronym for id=12 ("Innov8 Pacific"): IPC -> INNOV8 (Eugene-directed 2026-09-02).
--
-- Pure reference-data correction (a single acronym cell); no schema/code dependency — the app reads
-- acronym dynamically, nothing references the literal value. Not destructive DDL, so no code-live-first
-- gate; git-first still applies (this artifact committed + pushed before running against p2).
--
-- id=12 confirmed = "Innov8 Pacific" (non-utility), current acronym "IPC".

UPDATE organisations SET acronym = 'INNOV8' WHERE id = 12;

-- Verify (expect id 12 | Innov8 Pacific | INNOV8):
--   SELECT id, name, acronym FROM organisations WHERE id = 12;
