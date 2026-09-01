import { db } from "@/db/connection";
import { organisations } from "@/db/schema/utility";
import {
  DEV_UTILITY_CONTEXT_COOKIE,
  DEV_UTILITY_CONTEXT_MAX_AGE_SECONDS,
} from "@/lib/utility-context";
import { getCurrentUser } from "@/lib/user.service";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (user.role !== "DEV") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let payload: { organisationId?: number | null };
  try {
    payload = (await request.json()) as { organisationId?: number | null };
  } catch {
    return NextResponse.json(
      { message: "Invalid request body" },
      { status: 400 },
    );
  }

  const requestedValue = payload.organisationId;
  const cookieStore = await cookies();

  if (requestedValue == null) {
    cookieStore.delete(DEV_UTILITY_CONTEXT_COOKIE);
    return NextResponse.json({ organisationId: null });
  }

  if (!Number.isInteger(requestedValue) || requestedValue <= 0) {
    return NextResponse.json(
      { message: "organisationId must be a positive integer or null" },
      { status: 400 },
    );
  }

  const [organisation] = await db
    .select({
      id: organisations.id,
      name: organisations.name,
      acronym: organisations.acronym,
    })
    .from(organisations)
    .where(
      and(
        eq(organisations.id, requestedValue),
        eq(organisations.is_active, true),
        eq(organisations.is_utility, true),
      ),
    )
    .limit(1);

  if (!organisation) {
    return NextResponse.json(
      { message: "Organisation not found" },
      { status: 404 },
    );
  }

  cookieStore.set(DEV_UTILITY_CONTEXT_COOKIE, String(organisation.id), {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: DEV_UTILITY_CONTEXT_MAX_AGE_SECONDS,
  });

  return NextResponse.json({
    organisationId: organisation.id,
    name: organisation.name,
    acronym: organisation.acronym,
  });
}
