import type { Metadata } from "next";
import "./globals.css";
import TopNav from "@/components/layout/topNav";
import Sidebar from "@/components/layout/sidebar";
import { getSession } from "@/lib/session.service";
import { Toaster } from "sonner";
import { Suspense } from "react";
import { Noto_Sans } from "next/font/google";
import Footer from "@/components/layout/footer";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

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
    <html lang="en">
      <body className={`${notoSans.className} text-slate-900`}>
        <Suspense fallback={<div className="p-6 bg-slate-900"></div>}>
          <AppNavigation />
        </Suspense>

        <div className="flex min-h-screen">
          <Suspense fallback={null}>
            <SidebarWrapper />
          </Suspense>
          <main className="flex-1 p-2">{children}</main>
        </div>

        <Toaster
          duration={6000}
          position="top-center"
          toastOptions={{
            unstyled: true,
            classNames: {
              success: "bg-lime-600",
              error: "bg-red-600",
              warning: "bg-amber-600",
              info: "bg-blue-600",
            },
            className:
              "rounded-md shadow-sm p-4 flex items-center gap-2 text-white font-medium font-sans",
          }}
        />

        <Footer />
      </body>
    </html>
  );
}

async function AppNavigation() {
  const session = await getSession();

  return (
    <TopNav
      session={session?.session ?? undefined}
      role={session?.role?.name}
      orgAcronym={session?.orgAcronym || ""}
      fullName={session?.fullName}
    />
  );
}

async function SidebarWrapper() {
  const session = await getSession();
  if (!session?.user || !session?.role) return null;

  return <Sidebar list={session.sidebarList} />;
}
