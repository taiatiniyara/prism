/**
 * New-organisation onboarding — migration STEP 0 (runs BEFORE the data-entries load), INGEST half.
 *
 * A p1→p2 fact extract references utilities, service areas and report periods by their p2 ids
 * (see types.ts — "already resolved to p2 ids"). Those parent rows must EXIST before the loader can
 * attach a shell (data_entries.report_period_id / utility_id / service_area_id are FKs). For
 * utilities already in p2 this is a no-op; for a NEW utility arriving with a migration it is a
 * prerequisite. This half takes the parsed workbook (see ./onboard-parse) and creates those parents
 * idempotently (existing ids skipped — safe to re-run; composes with the loader's flush-and-reload,
 * which only truncates data_entries).
 *
 * FY alignment: a Financial-Year period's report_date IS its FY-end. Rather than hand-type it, the
 * sheet gives `fy_end_year` and this step computes report_date = (fy_end_year, org.fye_month,
 * org.fye_day) — so a new utility's periods are born already aligned to its canonical FYE (the same
 * invariant the 2026-08-31 FYE cleanup established; report_date drift cannot be reintroduced). A
 * non-FY period may instead give an explicit `report_date`.
 *
 * See docs/migration-new-organisation-format.md and scripts/migrate.ts (--new-orgs=<file>).
 */
import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { organisations, serviceAreas } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { DataEntryStatusId } from "@/db/schema/dataEntryStatus";
import type { NewOrgFile, NewReportPeriodRow } from "./onboard-parse";

const STATUS_MAP: Record<string, DataEntryStatusId> = {
  pending: DataEntryStatusId.Pending,
  entered: DataEntryStatusId.Entered,
  reviewed: DataEntryStatusId.Reviewed,
  approved: DataEntryStatusId.Approved,
  // business labels
  "blo reviewed": DataEntryStatusId.Reviewed,
  "ceo approved": DataEntryStatusId.Approved,
};

export interface OnboardResult {
  orgsCreated: number;
  orgsSkipped: number;
  saCreated: number;
  saSkipped: number;
  periodsCreated: number;
  periodsSkipped: number;
  saLinksAdded: number;
  errors: string[];
}

/** Last calendar day of a 1-based month (UTC). day 0 of the next month = last day of this one. */
function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function resolveReportDate(
  rp: NewReportPeriodRow,
  fyeByUtil: Map<number, { month: number | null; day: number | null }>,
): { date: Date | null; error?: string } {
  const tag = `report_periods row ${rp._row} (id ${rp.id})`;
  if (rp.fy_end_year != null) {
    const fye = rp.utility_id != null ? fyeByUtil.get(rp.utility_id) : undefined;
    if (!fye || fye.month == null || fye.day == null)
      return {
        date: null,
        error: `${tag}: fy_end_year given but utility ${rp.utility_id} has no fye_month/fye_day — declare it in the organisations sheet or ensure the org already has one`,
      };
    if (fye.day > daysInMonth(rp.fy_end_year, fye.month))
      return { date: null, error: `${tag}: invalid FY-end ${fye.day}/${fye.month} for ${rp.fy_end_year}` };
    return { date: new Date(Date.UTC(rp.fy_end_year, fye.month - 1, fye.day)) };
  }
  if (rp.report_date != null) {
    const d = new Date(rp.report_date);
    if (isNaN(d.getTime())) return { date: null, error: `${tag}: unparseable report_date "${rp.report_date}"` };
    return { date: d };
  }
  return { date: null, error: `${tag}: give fy_end_year (Financial-Year period) or an explicit report_date` };
}

/**
 * Idempotently create the organisations / service_areas / report_periods named in `data`. Validates
 * fully first; if any error is returned NOTHING is written (the caller should abort the migration
 * before the data-entries load, since the FK parents would be missing). With { dryRun } it validates
 * and reports would-create counts without writing.
 */
export async function onboardNewOrganisations(
  data: NewOrgFile,
  opts: { dryRun?: boolean } = {},
): Promise<OnboardResult> {
  const dryRun = opts.dryRun ?? false;
  const res: OnboardResult = {
    orgsCreated: 0, orgsSkipped: 0, saCreated: 0, saSkipped: 0,
    periodsCreated: 0, periodsSkipped: 0, saLinksAdded: 0, errors: [],
  };

  const existingOrgIds = new Set((await db.select({ id: organisations.id }).from(organisations)).map((o) => o.id));
  const existingSaIds = new Set((await db.select({ id: serviceAreas.id }).from(serviceAreas)).map((s) => s.id));
  const existingRpIds = new Set((await db.select({ id: reportPeriods.id }).from(reportPeriods)).map((r) => r.id));
  const mliIds = new Set((await db.select({ id: managedListItems.id }).from(managedListItems)).map((m) => m.id));

  // FYE map for report_date computation: existing DB orgs, overridden by any org declared in the file.
  const fyeByUtil = new Map<number, { month: number | null; day: number | null }>();
  for (const o of await db
    .select({ id: organisations.id, m: organisations.fye_month, d: organisations.fye_day })
    .from(organisations))
    fyeByUtil.set(o.id, { month: o.m, day: o.d });
  for (const o of data.organisations)
    if (o.id != null) fyeByUtil.set(o.id, { month: o.fye_month, day: o.fye_day });

  const knownOrgIds = new Set<number>([
    ...existingOrgIds,
    ...data.organisations.map((o) => o.id).filter((x): x is number => x != null),
  ]);

  // ── validate organisations ──
  for (const o of data.organisations) {
    const tag = `organisations row ${o._row} (id ${o.id ?? "?"})`;
    if (o.id == null) res.errors.push(`${tag}: id is required (explicit p2 id)`);
    if (!o.name) res.errors.push(`${tag}: name is required`);
    if (o.country_id == null) res.errors.push(`${tag}: country_id is required`);
    if (o.is_utility) {
      if (o.fye_month == null || o.fye_day == null)
        res.errors.push(`${tag}: fye_month & fye_day are required for a utility (the onboarding FY-end declaration)`);
      else {
        if (o.fye_month < 1 || o.fye_month > 12) res.errors.push(`${tag}: fye_month ${o.fye_month} out of 1..12`);
        if (o.fye_day < 1 || o.fye_day > 31) res.errors.push(`${tag}: fye_day ${o.fye_day} out of 1..31`);
      }
    }
    for (const [f, v] of [
      ["utility_type_id", o.utility_type_id], ["utility_size_id", o.utility_size_id],
      ["operating_basis_id", o.operating_basis_id], ["entity_type_id", o.entity_type_id],
      ["ppa_membership_type_id", o.ppa_membership_type_id],
      ["services_provided_id", o.services_provided_id],
    ] as const)
      if (v != null && !mliIds.has(v)) res.errors.push(`${tag}: ${f} ${v} is not a managed_list_items id`);
  }

  // ── validate service areas ──
  for (const s of data.serviceAreas) {
    const tag = `service_areas row ${s._row} (id ${s.id ?? "?"})`;
    if (s.id == null) res.errors.push(`${tag}: id is required`);
    if (s.utility_id == null || !knownOrgIds.has(s.utility_id))
      res.errors.push(`${tag}: utility_id ${s.utility_id ?? "?"} not found in the organisations sheet or the DB`);
    if (s.strata_id != null && !mliIds.has(s.strata_id))
      res.errors.push(`${tag}: strata_id ${s.strata_id} is not a managed_list_items id`);
  }

  // ── validate + resolve report periods ──
  const rpResolved: { row: NewReportPeriodRow; reportDate: Date; statusId: DataEntryStatusId; requestDate: Date }[] = [];
  for (const rp of data.reportPeriods) {
    const tag = `report_periods row ${rp._row} (id ${rp.id ?? "?"})`;
    let bad = false;
    if (rp.id == null) { res.errors.push(`${tag}: id is required (explicit p2 id)`); bad = true; }
    if (rp.utility_id == null || !knownOrgIds.has(rp.utility_id)) {
      res.errors.push(`${tag}: utility_id ${rp.utility_id ?? "?"} not found in the organisations sheet or the DB`);
      bad = true;
    }
    if (rp.report_type_id == null) { res.errors.push(`${tag}: report_type_id is required (explicit managed-list id)`); bad = true; }
    else if (!mliIds.has(rp.report_type_id)) { res.errors.push(`${tag}: report_type_id ${rp.report_type_id} is not a managed_list_items id`); bad = true; }
    const statusId = STATUS_MAP[(rp.status ?? "pending").toLowerCase()];
    if (statusId == null) { res.errors.push(`${tag}: status "${rp.status}" is not one of Pending | Entered | Reviewed | Approved`); bad = true; }
    const { date, error } = resolveReportDate(rp, fyeByUtil);
    if (error) { res.errors.push(error); bad = true; }
    if (bad || date == null || statusId == null) continue;
    const requestDate = rp.request_date ? new Date(rp.request_date) : date;
    if (isNaN(requestDate.getTime())) { res.errors.push(`${tag}: unparseable request_date "${rp.request_date}"`); continue; }
    rpResolved.push({ row: rp, reportDate: date, statusId, requestDate });
  }

  if (res.errors.length) return res; // hard stop — nothing written; caller aborts

  if (dryRun) {
    res.orgsCreated = data.organisations.filter((o) => o.id != null && !existingOrgIds.has(o.id)).length;
    res.orgsSkipped = data.organisations.length - res.orgsCreated;
    res.saCreated = data.serviceAreas.filter((s) => s.id != null && !existingSaIds.has(s.id)).length;
    res.saSkipped = data.serviceAreas.length - res.saCreated;
    res.periodsCreated = rpResolved.filter((r) => r.row.id != null && !existingRpIds.has(r.row.id)).length;
    res.periodsSkipped = rpResolved.length - res.periodsCreated;
    return res;
  }

  // ── insert organisations (skip existing) ──
  for (const o of data.organisations) {
    if (o.id == null || existingOrgIds.has(o.id)) { res.orgsSkipped++; continue; }
    await db.insert(organisations).values({
      id: o.id,
      name: o.name!,
      acronym: o.acronym,
      country_id: o.country_id!,
      is_utility: o.is_utility,
      fye_month: o.is_utility ? o.fye_month : null,
      fye_day: o.is_utility ? o.fye_day : null,
      is_mth_reports_relevant_month: o.is_mth_report_relevant,
      utility_type_id: o.utility_type_id ?? 440,
      utility_size_id: o.utility_size_id,
      operating_basis_id: o.operating_basis_id,
      entity_type_id: o.entity_type_id,
      ppa_membership_type_id: o.ppa_membership_type_id,
      services_provided_id: o.services_provided_id,
      is_active: o.is_active,
      updated_date: o.updated_date,
    });
    res.orgsCreated++;
  }

  // ── insert service areas (skip existing) ──
  for (const s of data.serviceAreas) {
    if (s.id == null || existingSaIds.has(s.id)) { res.saSkipped++; continue; }
    await db.insert(serviceAreas).values({
      id: s.id,
      name: s.name ?? `SA ${s.id}`,
      utility_id: s.utility_id!,
      provides_electricity: s.provides_electricity,
      provides_water: s.provides_water,
      provides_sanitation: s.provides_sanitation,
      operations_only: s.operations_only,
      report_periods: [],
      is_virtual: s.is_virtual,
      is_active: s.is_active,
      strata_id: s.strata_id ?? 1,
    });
    res.saCreated++;
  }

  // ── insert report periods (skip existing) ──
  const createdByUtil = new Map<number, number[]>();
  for (const rp of rpResolved) {
    const id = rp.row.id!;
    if (existingRpIds.has(id)) { res.periodsSkipped++; continue; }
    await db.insert(reportPeriods).values({
      id,
      utility_id: rp.row.utility_id!,
      report_type_id: rp.row.report_type_id!,
      report_date: rp.reportDate,
      request_date: rp.requestDate,
      status_id: rp.statusId,
      lean_mode: rp.row.lean_mode,
      who_id: rp.row.who_id,
    });
    res.periodsCreated++;
    const arr = createdByUtil.get(rp.row.utility_id!) ?? [];
    arr.push(id);
    createdByUtil.set(rp.row.utility_id!, arr);
  }

  // ── link each new period into its utility's service-area report_periods jsonb (so the period is
  //    active for those SAs in the entry UI). Deduped; existing links untouched. ──
  for (const [utilId, pids] of createdByUtil) {
    const sas = await db.select().from(serviceAreas).where(eq(serviceAreas.utility_id, utilId));
    for (const sa of sas) {
      const have = new Set((sa.report_periods ?? []).map((p) => p.report_period_id));
      const additions = pids.filter((p) => !have.has(p)).map((p) => ({ report_period_id: p, is_active: true }));
      if (additions.length === 0) continue;
      await db
        .update(serviceAreas)
        .set({ report_periods: [...(sa.report_periods ?? []), ...additions] })
        .where(eq(serviceAreas.id, sa.id));
      res.saLinksAdded += additions.length;
    }
  }

  return res;
}
