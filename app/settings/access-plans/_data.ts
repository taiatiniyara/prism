// ─────────────────────────────────────────────────────────────────────────────
// Access-plans PROTOTYPE data model + seed (stream #11 UI, for #10 tiered-access).
//
// THROWAWAY, MOCK-ONLY. There is no plan schema yet — #10 owns the model, #2 owns
// the DDL. This file lets the DEV/BMO form be clicked-through now so the UX +
// the effective-dated versioning drive #10's schema. When the real
// `plan` / `plan_version` / `plan_entitlement` tables land, this seed is replaced
// by a server read and the client store swaps to server actions — the component
// tree stays.
//
// Model = EFFECTIVE-DATED VERSIONING (Eugene's call 2026-07-28): a stable `plan`
// identity carries an ordered list of dated `version` snapshots. The current
// version is the one with `effective_to === null`. Editing never mutates a
// version — it supersedes the current one and prepends a new dated snapshot, so
// a subscription can lock to the version it was sold at and the full price/terms
// history is inherent.
// ─────────────────────────────────────────────────────────────────────────────

export const DASHBOARDS = [
  { key: "benchmarking_kpi", label: "Benchmarking KPI" },
  { key: "regional", label: "Regional" },
  { key: "country", label: "Country" },
  { key: "reports", label: "PDF Reports" },
  { key: "kpi_database", label: "KPI Database" },
] as const;

export type DashboardKey = (typeof DASHBOARDS)[number]["key"];

// none = plan does not include the dashboard (no plan_entitlement row);
// view / view_download map to plan_entitlement.access_level.
export type EntitlementLevel = "none" | "view" | "view_download";

export type Entitlements = Record<DashboardKey, EntitlementLevel>;

export type TierGroup = "paid" | "free";

export type PlanCode =
  | "basic"
  | "premium"
  | "pay_per_project"
  | "default"
  | "member"
  | "utility";

export interface PlanVersion {
  id: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null; // null = current (in force)
  priceUsd: number | null; // null for free tiers
  seatCap: number;
  termDays: number | null; // 365 | 60 | null (rolling / no fixed term)
  entitlements: Entitlements;
  changedBy: string;
  changedAt: string; // YYYY-MM-DD
  note: string;
}

export interface Plan {
  id: string;
  code: PlanCode;
  name: string;
  tierGroup: TierGroup;
  isActive: boolean;
  versions: PlanVersion[]; // newest-first; [0].effectiveTo === null when in force
}

const ent = (
  bench: EntitlementLevel,
  regional: EntitlementLevel,
  country: EntitlementLevel,
  reports: EntitlementLevel,
  kpiDb: EntitlementLevel,
): Entitlements => ({
  benchmarking_kpi: bench,
  regional,
  country,
  reports,
  kpi_database: kpiDb,
});

// Seed reflects spec §0 (the three paid plans) + §4 (default / member / utility),
// with real prior versions so the history view has something to show.
export const SEED_PLANS: Plan[] = [
  {
    id: "plan_basic",
    code: "basic",
    name: "Basic",
    tierGroup: "paid",
    isActive: true,
    versions: [
      {
        id: "basic_v2",
        effectiveFrom: "2025-01-01",
        effectiveTo: null,
        priceUsd: 2200,
        seatCap: 5,
        termDays: 365,
        entitlements: ent("view", "view", "view", "view", "view"),
        changedBy: "A. Rokosuka (BMO)",
        changedAt: "2024-12-10",
        note: "2025 annual price review: US$2,000 → US$2,200.",
      },
      {
        id: "basic_v1",
        effectiveFrom: "2024-01-01",
        effectiveTo: "2024-12-31",
        priceUsd: 2000,
        seatCap: 5,
        termDays: 365,
        entitlements: ent("view", "view", "view", "view", "view"),
        changedBy: "System (initial)",
        changedAt: "2024-01-01",
        note: "Initial Basic plan.",
      },
    ],
  },
  {
    id: "plan_premium",
    code: "premium",
    name: "Premium",
    tierGroup: "paid",
    isActive: true,
    versions: [
      {
        id: "premium_v2",
        effectiveFrom: "2025-01-01",
        effectiveTo: null,
        priceUsd: 3500,
        seatCap: 10,
        termDays: 365,
        entitlements: ent("view", "view", "view", "view", "view_download"),
        changedBy: "A. Rokosuka (BMO)",
        changedAt: "2024-12-10",
        note: "2025 price US$3,200 → US$3,500; KPI Database made downloadable.",
      },
      {
        id: "premium_v1",
        effectiveFrom: "2024-01-01",
        effectiveTo: "2024-12-31",
        priceUsd: 3200,
        seatCap: 10,
        termDays: 365,
        entitlements: ent("view", "view", "view", "view", "view"),
        changedBy: "System (initial)",
        changedAt: "2024-01-01",
        note: "Initial Premium plan (view-only KPI Database).",
      },
    ],
  },
  {
    id: "plan_ppp",
    code: "pay_per_project",
    name: "Pay-per-project",
    tierGroup: "paid",
    isActive: true,
    versions: [
      {
        id: "ppp_v1",
        effectiveFrom: "2024-06-01",
        effectiveTo: null,
        priceUsd: 500,
        seatCap: 3,
        termDays: 60,
        entitlements: ent("view", "view", "view", "view", "view_download"),
        changedBy: "System (initial)",
        changedAt: "2024-06-01",
        note: "Launched 60-day pay-per-project plan.",
      },
    ],
  },
  {
    id: "plan_default",
    code: "default",
    name: "Default (free)",
    tierGroup: "free",
    isActive: true,
    versions: [
      {
        id: "default_v1",
        effectiveFrom: "2024-01-01",
        effectiveTo: null,
        priceUsd: null,
        seatCap: 1,
        termDays: null,
        entitlements: ent("none", "none", "view", "view", "none"),
        changedBy: "System (initial)",
        changedAt: "2024-01-01",
        note: "BMO-revert landing plan. Minimal view-only — contents pending Eugene's associate.",
      },
    ],
  },
  {
    id: "plan_member",
    code: "member",
    name: "Association member (free)",
    tierGroup: "free",
    isActive: true,
    versions: [
      {
        id: "member_v1",
        effectiveFrom: "2024-01-01",
        effectiveTo: null,
        priceUsd: null,
        seatCap: 5,
        termDays: null,
        entitlements: ent("view", "view", "view", "view", "none"),
        changedBy: "System (initial)",
        changedAt: "2024-01-01",
        note: "Free member set — applied per the sector(s) of the org's benchmarking group(s). Entitlements TBD.",
      },
    ],
  },
  {
    id: "plan_utility",
    code: "utility",
    name: "Utility / provider (free)",
    tierGroup: "free",
    isActive: true,
    versions: [
      {
        id: "utility_v1",
        effectiveFrom: "2024-01-01",
        effectiveTo: null,
        priceUsd: null,
        seatCap: 25,
        termDays: null,
        entitlements: ent("view", "view", "view", "view", "view_download"),
        changedBy: "System (initial)",
        changedAt: "2024-01-01",
        note: "Provider access set (dashboards + data-entry), expressed as a plan for uniformity.",
      },
    ],
  },
];
