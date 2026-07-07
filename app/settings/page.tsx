import Link from "next/link";

import { getSession } from "@/lib/session.service";

// The BSC Master Template editor and the KPI Formula Guide are restricted to
// DEV/BMO (each route also enforces this itself).
const DEV_BMO_ROLES = new Set(["DEV", "BMO"]);

export default async function SettingsHomePage() {
  const session = await getSession();
  const role = session?.role?.name ?? "";

  // Cards are derived from the same role-filtered, DB-driven sidebar the rest of
  // the app uses, so they always point at real routes the user can open (the old
  // hardcoded list had dead links like /settings/general and
  // /settings/kpi-definitions).
  const cards = (session?.sidebarList ?? [])
    .filter((item) => item.page.startsWith("/settings/"))
    .map((item) => ({ label: item.name, href: item.page }));

  // Robustness: these DEV/BMO cards are gated purely by role, so they show even
  // on environments whose DB is missing the sidebar_access rows — the data-only
  // migrations (`0016_bsc_template_sidebar.sql`, `0032_kpi_formula_guide_sidebar.sql`)
  // are NOT applied by the deploy's `db-push` (schema only). De-duped against the
  // DB-driven list above.
  if (DEV_BMO_ROLES.has(role)) {
    if (!cards.some((c) => c.href === "/settings/bsc-template")) {
      cards.push({
        label: "BSC Master Template",
        href: "/settings/bsc-template",
      });
    }
    if (!cards.some((c) => c.href === "/settings/kpi-formula-guide")) {
      cards.push({
        label: "KPI Formula Guide",
        href: "/settings/kpi-formula-guide",
      });
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Settings</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Manage platform configuration, users, organisations, and reference data.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="border-border hover:border-primary/50 hover:bg-accent rounded-lg border p-4 transition-colors"
          >
            <span className="text-sm font-medium">{card.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
