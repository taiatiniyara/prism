import type { Metadata } from "next";
import "./globals.css";
import TopNav from "@/components/layout/topNav";
import Sidebar from "@/components/layout/sidebar";
import { getSession } from "@/lib/session.service";
import { Toaster } from "sonner";
import { Suspense } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Footer from "@/components/layout/footer";
import BlockedAccessOverlay from "@/components/auth/blocked-access-overlay";
import { FloatingChatbot } from "@/components/ai/floating-chatbot";
import FormOverridesProvider from "@/components/dev/form-overrides-provider";
import RefreshOnNavigate from "@/components/layout/refresh-on-navigate";
import { db } from "@/db/connection";
import { organisations } from "@/db/schema/utility";
import { and, asc, eq } from "drizzle-orm";

// IBM Plex Sans — institutional, engineered character with strong tabular
// numerals for PRISM's data tables. `variable` defines --font-sans app-wide so
// Tailwind's `font-sans` token resolves everywhere (not just where the class lands).
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

// IBM Plex Mono — wired to the --font-mono token (previously pointed at an
// unloaded var). Used for ids, codes, formulas and other data cells.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-mono",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PRISM - PPA Benchmarking Platform",
  description:
    "A platform for benchmarking and analyzing the performance of various PPA (Pacific Power Association) metrics and data from energy utilities.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body
        className={`${plexSans.className} font-sans flex h-screen flex-col overflow-hidden text-slate-900`}
      >
        <Suspense fallback={<div className="p-6 bg-slate-900"></div>}>
          <AppNavigation />
        </Suspense>

        <Suspense
          fallback={<div className="flex min-h-0 flex-1 overflow-hidden" />}
        >
          <SessionShell>
            <FormOverridesProvider>{children}</FormOverridesProvider>
          </SessionShell>
        </Suspense>

        <Toaster
          duration={6000}
          position="bottom-right"
          toastOptions={{
            unstyled: true,
            classNames: {
              success: "bg-success",
              error: "bg-danger",
              warning: "bg-warning",
              info: "bg-info",
              loading:
                "bg-slate-700 border border-slate-500 text-white [&_svg]:text-white [&_svg]:stroke-white",
            },
            className:
              "rounded-md shadow-sm p-4 flex items-center gap-2 text-white font-medium font-sans",
          }}
        />

        <Footer />

        <RefreshOnNavigate />
      </body>
    </html>
  );
}

async function AppNavigation() {
  const session = await getSession();
  const utilityOptions =
    session?.role?.name === "DEV"
      ? await db
          .select({
            id: organisations.id,
            name: organisations.name,
            acronym: organisations.acronym,
          })
          .from(organisations)
          .where(
            and(
              eq(organisations.is_active, true),
              eq(organisations.is_utility, true),
            ),
          )
          .orderBy(asc(organisations.name))
      : [];

  return (
    <TopNav
      session={session?.session ?? undefined}
      role={session?.role?.name}
      orgAcronym={session?.orgAcronym || ""}
      fullName={session?.fullName}
      utilityContext={
        session?.role?.name === "DEV"
          ? {
              selectedOrganisationId: session.effectiveOrgId ?? null,
              isScoped: session.isUtilityContextScoped === true,
              options: utilityOptions.map((utility) => ({
                id: utility.id,
                name: utility.name,
                acronym: utility.acronym ?? null,
              })),
            }
          : undefined
      }
    />
  );
}

async function SessionShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  const showSidebar =
    Boolean(session?.user && session?.role) && !session?.blockedState?.blocked;

  const showBlockedOverlay =
    Boolean(session?.blockedState?.blocked) &&
    Boolean(session?.blockedState?.status);
  const blockedStatus = session?.blockedState?.status;

  const showFloatingChatbot =
    Boolean(session?.user) && !session?.blockedState?.blocked;

  return (
    <>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showSidebar ? <Sidebar list={session?.sidebarList ?? []} /> : null}
        <main className="flex-1 min-w-0 overflow-y-auto p-2">
          {showBlockedOverlay && blockedStatus ? (
            <BlockedAccessOverlay
              status={blockedStatus}
              rejectionReason={session?.blockedState?.rejectionReason}
            />
          ) : (
            children
          )}
        </main>
      </div>

      {showFloatingChatbot ? <FloatingChatbot /> : null}
    </>
  );
}
