import Link from "next/link";

import { getCurrentUser } from "@/lib/user.service";

const sections = [
  {
    label: "General",
    href: "/settings/general",
  },
  {
    label: "Users",
    href: "/settings/users",
  },
  {
    label: "Roles",
    href: "/settings/roles",
  },
  {
    label: "Organisations",
    href: "/settings/organisations",
  },
  {
    label: "Report Periods",
    href: "/settings/report-periods",
  },
  {
    label: "KPI Definitions",
    href: "/settings/kpi-definitions",
  },
  {
    label: "Managed Lists",
    href: "/settings/managed-lists",
  },
];

// The BSC Master Template editor is restricted to DEV/BMO, so only surface its
// card to those roles (the page itself also enforces this).
const BSC_TEMPLATE_ADMIN_ROLES = new Set(["DEV", "BMO"]);

export default async function SettingsHomePage() {
  const user = await getCurrentUser();
  const visibleSections = [...sections];
  if (user?.role && BSC_TEMPLATE_ADMIN_ROLES.has(user.role)) {
    visibleSections.push({
      label: "BSC Master Template",
      href: "/settings/bsc-template",
    });
  }
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Settings</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Manage platform configuration, users, organisations, and reference data.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {visibleSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="border-border hover:border-primary/50 hover:bg-accent rounded-lg border p-4 transition-colors"
          >
            <span className="text-sm font-medium">{section.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
