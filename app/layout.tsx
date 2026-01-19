import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import TopNav from "@/components/layout/topNav";
import Sidebar from "@/components/layout/sidebar";
import { getSession } from "@/lib/session.service";
import { Toaster } from "sonner";
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
  const sessionPromise = getSession();

  return (
    <html
      lang="en"
      className={notoSans.variable}
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Suspense fallback={<HeaderFallback />}>
          <SessionHeader sessionPromise={sessionPromise} />
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

async function SessionHeader({
  sessionPromise,
}: {
  sessionPromise: ReturnType<typeof getSession>;
}) {
  const session = await sessionPromise;

  return (
    <>
      <TopNav session={session?.session} />
      <Sidebar
        user={session?.user ?? null}
        role={session?.role ?? null}
      />
    </>
  );
}

function HeaderFallback() {
  // Minimal placeholder to keep layout stable while session resolves.
  return <div />;
}
