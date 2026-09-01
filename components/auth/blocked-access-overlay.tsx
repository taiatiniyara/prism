"use client";

import type { UserStatus } from "@/db/schema/auth-schema";
import { getBlockedMessage } from "@/app/auth/blocked/state";

type BlockedAccessOverlayProps = {
  status: Extract<UserStatus, "pending" | "deactivated">;
  rejectionReason?: string | null;
};

export default function BlockedAccessOverlay({
  status,
  rejectionReason,
}: BlockedAccessOverlayProps) {
  const state = getBlockedMessage(status, rejectionReason);

  return (
    <section
      className="flex min-h-[calc(100vh-160px)] items-center justify-center px-4"
      aria-labelledby="blocked-access-title"
      aria-live="polite"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
          Account status
        </p>
        <h1
          id="blocked-access-title"
          className="text-2xl font-semibold text-slate-900"
          tabIndex={-1}
        >
          {state.title}
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-700">{state.message}</p>
        <p className="mt-4 rounded-md bg-slate-100 p-3 text-sm text-slate-700">
          {state.nextSteps}
        </p>
      </div>
    </section>
  );
}
