import Link from "next/link";

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

export default function SettingsHomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Settings</h1>
      <p className="text-muted-foreground mb-8 text-sm">
        Manage platform configuration, users, organisations, and reference data.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((section) => (
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
