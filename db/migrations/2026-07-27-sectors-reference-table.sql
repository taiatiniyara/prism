-- Sectors reference table (ADR 0003, Phase 5b slice — stream #13).
-- The DB table backing the Phase-5a code-level Sector union
-- (lib/terminology/sectors.ts). `code` matches those string keys. Explicit ids
-- so the same id means the same sector across environments (FK-safe for #10's
-- benchmarking_group_sector and the future sector_terminology table).
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS "sectors" (
  "id"          integer      PRIMARY KEY NOT NULL,
  "code"        varchar(32)  NOT NULL UNIQUE,
  "name"        varchar(64)  NOT NULL,
  "sort_order"  integer      NOT NULL DEFAULT 0,
  "is_active"   boolean      NOT NULL DEFAULT true
);

INSERT INTO "sectors" ("id", "code", "name", "sort_order") VALUES
  (1, 'electricity', 'Electricity', 1),
  (2, 'water',       'Water',       2),
  (3, 'sanitation',  'Sanitation',  3)
ON CONFLICT ("id") DO NOTHING;
