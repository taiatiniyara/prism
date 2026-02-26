import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/layout/topNav";
import Sidebar from "@/components/layout/sidebar";
import { getSession } from "@/lib/session.service";
import { Toaster } from "sonner";
import { Suspense } from "react";
const notoSans = Noto_Sans({ variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html
      lang="en"
      className={notoSans.variable}
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Suspense fallback={<div className="p-6 bg-slate-800"></div>}>
          <AppNavigation />
        </Suspense>

        <main className="p-4">{children}</main>

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
      </body>
    </html>
  );
}

async function AppNavigation() {
  const session = await getSession();

  return (
    <>
      <TopNav
        session={session?.session ?? undefined}
        role={session?.role?.name}
        orgAcronym={session?.orgAcronym}
      />
      {session?.user && session?.role && (
        <Sidebar
          user={session.user}
          role={session.role}
        />
      )}
    </>
  );
}
