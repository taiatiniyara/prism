import type { Metadata } from "next";
import "./globals.css";
import TopNav from "@/components/layout/topNav";
import Sidebar from "@/components/layout/sidebar";
import { getSession } from "@/lib/session.service";
import { Toaster } from "sonner";
import { Suspense } from "react";
import { Noto_Sans } from "next/font/google";
import Footer from "@/components/layout/footer";
import BlockedAccessOverlay from "@/components/auth/blocked-access-overlay";
import { FloatingChatbot } from "@/components/chatbot/floating-chatbot";

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
      <body
        className={`${notoSans.className} flex h-screen flex-col overflow-hidden text-slate-900`}
      >
        <Suspense fallback={<div className="p-6 bg-slate-900"></div>}>
          <AppNavigation />
        </Suspense>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={null}>
            <SidebarWrapper />
          </Suspense>
          <main className="flex-1 min-w-0 overflow-y-auto p-2">
            <Suspense fallback={null}>
              <AccessGate>{children}</AccessGate>
            </Suspense>
          </main>
        </div>

        <Suspense fallback={null}>
          <FloatingChatbotWrapper />
        </Suspense>

        <Toaster
          duration={6000}
          position="bottom-right"
          toastOptions={{
            unstyled: true,
            classNames: {
              success: "bg-lime-500",
              error: "bg-red-500",
              warning: "bg-amber-500",
              info: "bg-blue-500",
              loading:
                "bg-slate-700 border border-slate-500 text-white [&_svg]:text-white [&_svg]:stroke-white",
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
  if (session.blockedState?.blocked) return null;

  return <Sidebar list={session.sidebarList} />;
}

async function AccessGate({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (session?.blockedState?.blocked && session.blockedState.status) {
    return (
      <BlockedAccessOverlay
        status={session.blockedState.status}
        rejectionReason={session.blockedState.rejectionReason}
      />
    );
  }

  return <>{children}</>;
}

async function FloatingChatbotWrapper() {
  const session = await getSession();

  if (!session?.user) {
    return null;
  }

  if (session.blockedState?.blocked) {
    return null;
  }

  return <FloatingChatbot />;
}
