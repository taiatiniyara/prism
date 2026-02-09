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

export default async function RootLayout({
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
        <Suspense fallback={<div>Loading...</div>}>
          <SessionNav />
        </Suspense>

        {children}

        <Toaster
          richColors
          position="bottom-center"
        />
      </body>
    </html>
  );
}

async function SessionNav() {
  const session = await getSession();
  return (
    <>
      <TopNav session={session?.session ?? undefined} />
      <Sidebar
        user={session?.user!}
        role={session?.role!}
      />
    </>
  );
}
