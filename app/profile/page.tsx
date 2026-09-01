import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db/connection";
import { roles, user } from "@/db/schema/auth-schema";
import { organisations } from "@/db/schema/utility";
import { eq } from "drizzle-orm";
import { ResendVerificationButton } from "./resend-verification";

interface PageProps {
  searchParams: Promise<{ verify?: string }>;
}

export default async function ProfilePage({ searchParams }: PageProps) {
  const { verify } = await searchParams;

  const requestHeaders = await headers();
  const headerEntries = Array.from(requestHeaders.entries());
  const session = await auth.api.getSession({
    headers: new Headers(headerEntries),
  });

  if (!session) {
    redirect("/auth");
  }

  const [currentUser] = await db
    .select()
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (!currentUser) {
    redirect("/auth");
  }

  const [role] = currentUser.role_id
    ? await db
        .select()
        .from(roles)
        .where(eq(roles.id, currentUser.role_id))
        .limit(1)
    : [null];

  const [org] = currentUser.organisation_id
    ? await db
        .select()
        .from(organisations)
        .where(eq(organisations.id, currentUser.organisation_id))
        .limit(1)
    : [null];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-semibold">Profile</h1>

      {verify === "required" && (
        <div className="border-amber-300 bg-amber-50 text-amber-900 rounded-lg border p-4 mb-6">
          <p className="font-medium mb-2">Email verification required</p>
          <p className="text-sm mb-3">
            Your email address has not been verified yet. Please verify your
            email to access all features.
          </p>
          <ResendVerificationButton />
        </div>
      )}

      <div className="border-border rounded-lg border divide-y">
        <div className="p-4">
          <span className="text-xs text-slate-500 uppercase tracking-wide">
            Name
          </span>
          <p className="font-medium">{currentUser.name || "—"}</p>
        </div>
        <div className="p-4">
          <span className="text-xs text-slate-500 uppercase tracking-wide">
            Email
          </span>
          <p className="font-medium flex items-center gap-2">
            {currentUser.email}
            {currentUser.emailVerified ? (
              <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded">
                Verified
              </span>
            ) : (
              <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded">
                Unverified
              </span>
            )}
          </p>
        </div>
        <div className="p-4">
          <span className="text-xs text-slate-500 uppercase tracking-wide">
            Role
          </span>
          <p className="font-medium">{role?.name || "—"}</p>
        </div>
        <div className="p-4">
          <span className="text-xs text-slate-500 uppercase tracking-wide">
            Organisation
          </span>
          <p className="font-medium">{org?.name || "—"}</p>
        </div>
        <div className="p-4">
          <span className="text-xs text-slate-500 uppercase tracking-wide">
            Status
          </span>
          <p className="font-medium capitalize">{currentUser.status || "—"}</p>
        </div>
      </div>

      {role?.name && (
        <div className="mt-4 text-sm text-slate-500">
          <Link
            href="/settings/overview"
            className="text-blue-600 hover:underline"
          >
            Go to settings
          </Link>
        </div>
      )}
    </div>
  );
}
