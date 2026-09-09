import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { sectors } from "./sector";
import { organisations } from "./utility";
import { user } from "./auth-schema";

// BMO-maintained (sector, concept) → display label, resolved at the Silver/UI layer
// (ADR 0003, resolutions Q3 #11). Backs lib/terminology's `lookupTerm` once repointed
// off the interim app-config map. `concept_key` is the UI-side registered ConceptKey
// (e.g. 'service_area'); `label_plural` NULL → resolver falls back to `label`.
// Applied to p2 via scripts/sql/2026-09-09-sector-terminology-and-organisation-sector.sql
// (git-first: SQL merged + applied, model added after — drift-check errors on model-ahead).
export const sectorTerminology = pgTable(
  "sector_terminology",
  {
    id: serial("id").primaryKey().notNull(),
    sector_id: integer("sector_id")
      .notNull()
      .references(() => sectors.id),
    concept_key: varchar("concept_key", { length: 64 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    label_plural: varchar("label_plural", { length: 255 }),
    updated_by: text("updated_by").references(() => user.id),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqSectorConcept: unique("uniq_sector_terminology_sector_concept").on(
      t.sector_id,
      t.concept_key,
    ),
  }),
);
export type SectorTerminology = typeof sectorTerminology.$inferSelect;
export type NewSectorTerminology = typeof sectorTerminology.$inferInsert;

// Which sector(s) an org operates in — M:N, orthogonal to the org axes (relationship /
// entity_type_id untouched; NO sector column on organisations — #10 guard, resolutions Q4).
// A utility may run electricity AND water, so this is a junction, not a scalar. Membership
// rows are #10/#13's data call (created empty).
export const organisationSector = pgTable(
  "organisation_sector",
  {
    id: serial("id").primaryKey().notNull(),
    organisation_id: integer("organisation_id")
      .notNull()
      .references(() => organisations.id),
    sector_id: integer("sector_id")
      .notNull()
      .references(() => sectors.id),
  },
  (t) => ({
    uniqOrgSector: unique("uniq_organisation_sector").on(
      t.organisation_id,
      t.sector_id,
    ),
  }),
);
export type OrganisationSector = typeof organisationSector.$inferSelect;
export type NewOrganisationSector = typeof organisationSector.$inferInsert;
