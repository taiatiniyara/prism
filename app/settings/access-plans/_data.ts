// ─────────────────────────────────────────────────────────────────────────────
// Access-plans PROTOTYPE data model + seed (stream #11 UI, for #10 tiered-access).
//
// THROWAWAY, MOCK-ONLY. No plan schema exists yet — #10 owns the model, #2 owns
// the DDL. This drives the UX so the model can be validated now; when the real
// `plan` / `plan_version` / `plan_entitlement` tables land, this seed is replaced
// by a server read and the store swaps to server actions — the component tree
// stays.
//
// Model (Eugene's xlsx `Tiered Access Plans - 20260728.xlsx`, spec §0/§3.2):
//   • plan          = stable identity (6 user-groups).
//   • commercial     = effective-dated VERSIONS of price/seat/term. Editing closes
//                      the current version and inserts a new one (immutable), so a
//                      subscription can LOCK to the version it was sold at and the
//                      history is the version list.
//   • entitlements   = dashboard × three rights (view / dl-charts / dl-tables),
//                      keyed to the plan IDENTITY (not versioned) because
//                      entitlement changes FORWARD-APPLY to every current
//                      subscriber immediately.
// ─────────────────────────────────────────────────────────────────────────────

export const DASHBOARDS = [
  { key: "annual_reports_pdf", label: "Annual Benchmarking Reports (PDF)" },
  { key: "public_kpi", label: "Public KPI" },
  { key: "utility_specific_kpi", label: "Utility-Specific KPIs" },
  { key: "benchmarking_kpi", label: "Benchmarking KPIs" },
  { key: "country_kpi", label: "Country KPIs" },
  { key: "subregional_kpi", label: "Sub-regional KPIs" },
  { key: "regional_kpi", label: "Regional KPIs" },
] as const;

export type DashboardKey = (typeof DASHBOARDS)[number]["key"];

export interface Rights {
  view: boolean;
  dlCharts: boolean;
  dlTables: boolean;
}

export type Entitlements = Record<DashboardKey, Rights>;

export type TierGroup = "paid" | "free";

export type PlanCode =
  | "public"
  | "utility"
  | "allied_member"
  | "per_project"
  | "basic"
  | "premium";

// Effective-dated commercial terms (price/seat/term) — the versioned, lockable part.
export interface CommercialVersion {
  id: string;
  validFrom: string; // YYYY-MM-DD
  validTo: string | null; // null = current (in force)
  priceUsd: number | null; // null = free
  seatCap: number | null; // null = unlimited
  termDays: number | null; // 365 | 60 | null (rolling / unlimited)
  createdBy: string;
  createdAt: string; // YYYY-MM-DD
  note: string;
}

export interface Plan {
  id: string;
  code: PlanCode;
  name: string;
  tierGroup: TierGroup;
  isActive: boolean;
  activeSubscribers: number; // mock — powers the forward-apply warning
  commercial: CommercialVersion[]; // newest-first; [0].validTo === null when in force
  entitlements: Entitlements; // LIVE (forward-applies), not versioned
}

const R = (view: boolean, dlCharts: boolean, dlTables: boolean): Rights => ({
  view,
  dlCharts,
  dlTables,
});
const OFF = R(false, false, false);

// Build a plan's entitlement set from the §0 matrix shorthand. The four
// benchmarking-family dashboards share one row (identical rights), so `family`
// sets all four at once.
const ent = (opts: {
  pdf: boolean;
  publicKpi: boolean;
  utilitySpecific: Rights;
  family: Rights;
}): Entitlements => ({
  annual_reports_pdf: R(opts.pdf, false, false),
  public_kpi: R(opts.publicKpi, false, false),
  utility_specific_kpi: opts.utilitySpecific,
  benchmarking_kpi: opts.family,
  country_kpi: opts.family,
  subregional_kpi: opts.family,
  regional_kpi: opts.family,
});

// term display distinguishes rolling (Public) from unlimited (Utility/Allied),
// both stored as termDays = null.
export const termLabel = (plan: Plan, termDays: number | null): string => {
  if (termDays === 365) return "Annual";
  if (termDays === 60) return "60 days";
  return plan.code === "utility" || plan.code === "allied_member"
    ? "Unlimited"
    : "Rolling";
};

export const SEED_PLANS: Plan[] = [
  {
    id: "plan_public",
    code: "public",
    name: "Public",
    tierGroup: "free",
    isActive: true,
    activeSubscribers: 214,
    entitlements: ent({
      pdf: true,
      publicKpi: true,
      utilitySpecific: OFF,
      family: OFF,
    }),
    commercial: [
      {
        id: "public_v1",
        validFrom: "2024-01-01",
        validTo: null,
        priceUsd: null,
        seatCap: null,
        termDays: null,
        createdBy: "System (initial)",
        createdAt: "2024-01-01",
        note: "Default plan for any registered user — PDF reports + Public KPI, view only.",
      },
    ],
  },
  {
    id: "plan_utility",
    code: "utility",
    name: "Utility",
    tierGroup: "free",
    isActive: true,
    activeSubscribers: 19,
    entitlements: ent({
      pdf: true,
      publicKpi: true,
      utilitySpecific: R(true, true, true),
      family: R(true, true, true),
    }),
    commercial: [
      {
        id: "utility_v1",
        validFrom: "2024-01-01",
        validTo: null,
        priceUsd: null,
        seatCap: null,
        termDays: null,
        createdBy: "System (initial)",
        createdAt: "2024-01-01",
        note: "Provider access — its own Utility-Specific KPIs + full benchmarking family (sector-scoped via benchmarking group).",
      },
    ],
  },
  {
    id: "plan_allied",
    code: "allied_member",
    name: "Allied Member",
    tierGroup: "free",
    isActive: true,
    activeSubscribers: 6,
    entitlements: ent({
      pdf: true,
      publicKpi: true,
      utilitySpecific: OFF,
      family: R(true, true, true),
    }),
    commercial: [
      {
        id: "allied_v1",
        validFrom: "2024-01-01",
        validTo: null,
        priceUsd: null,
        seatCap: null,
        termDays: null,
        createdBy: "System (initial)",
        createdAt: "2024-01-01",
        note: "Association member — free benchmarking family (view + downloads), sector-scoped to the group's sector(s).",
      },
    ],
  },
  {
    id: "plan_per_project",
    code: "per_project",
    name: "Per Project",
    tierGroup: "paid",
    isActive: true,
    activeSubscribers: 3,
    entitlements: ent({
      pdf: true,
      publicKpi: true,
      utilitySpecific: OFF,
      family: R(true, true, true),
    }),
    commercial: [
      {
        id: "ppp_v2",
        validFrom: "2026-07-01",
        validTo: null,
        priceUsd: 500,
        seatCap: 1,
        termDays: 60,
        createdBy: "A. Rokosuka (BMO)",
        createdAt: "2026-06-20",
        note: "Seat cap reduced 3 → 1 per the 2026 access review.",
      },
      {
        id: "ppp_v1",
        validFrom: "2024-06-01",
        validTo: "2026-06-30",
        priceUsd: 500,
        seatCap: 3,
        termDays: 60,
        createdBy: "System (initial)",
        createdAt: "2024-06-01",
        note: "Launched 60-day pay-per-project plan (3 seats).",
      },
    ],
  },
  {
    id: "plan_basic",
    code: "basic",
    name: "Basic",
    tierGroup: "paid",
    isActive: true,
    activeSubscribers: 12,
    entitlements: ent({
      pdf: true,
      publicKpi: true,
      utilitySpecific: OFF,
      family: R(true, false, false), // benchmarking VIEW only — no downloads
    }),
    commercial: [
      {
        id: "basic_v2",
        validFrom: "2025-01-01",
        validTo: null,
        priceUsd: 2200,
        seatCap: 5,
        termDays: 365,
        createdBy: "A. Rokosuka (BMO)",
        createdAt: "2024-12-10",
        note: "2025 annual price review: US$2,000 → US$2,200.",
      },
      {
        id: "basic_v1",
        validFrom: "2024-01-01",
        validTo: "2024-12-31",
        priceUsd: 2000,
        seatCap: 5,
        termDays: 365,
        createdBy: "System (initial)",
        createdAt: "2024-01-01",
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
    activeSubscribers: 4,
    entitlements: ent({
      pdf: true,
      publicKpi: true,
      utilitySpecific: OFF,
      family: R(true, true, true),
    }),
    commercial: [
      {
        id: "premium_v2",
        validFrom: "2025-01-01",
        validTo: null,
        priceUsd: 3500,
        seatCap: 10,
        termDays: 365,
        createdBy: "A. Rokosuka (BMO)",
        createdAt: "2024-12-10",
        note: "2025 annual price review: US$3,200 → US$3,500.",
      },
      {
        id: "premium_v1",
        validFrom: "2024-01-01",
        validTo: "2024-12-31",
        priceUsd: 3200,
        seatCap: 10,
        termDays: 365,
        createdBy: "System (initial)",
        createdAt: "2024-01-01",
        note: "Initial Premium plan.",
      },
    ],
  },
];
