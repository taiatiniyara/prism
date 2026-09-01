import { db } from "@/db/connection";
import { user, roles } from "@/db/schema/auth-schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

interface MigrateUser {
  id?: string;
  name: string;
  email: string;
  role_name?: string;
  role_id?: number;
  organisation_id?: number;
  status?: string;
}

export async function POST(req: NextRequest) {
  const migrationKey = process.env.PRISM_TRAINING_MIGRATION_KEY ?? "";
  const providedKey = req.headers.get("x-migration-key") ?? "";

  if (migrationKey.length === 0 || providedKey !== migrationKey) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: { users: MigrateUser[] } = await req.json().catch(() => ({ users: [] }));
  if (!body.users || !Array.isArray(body.users)) {
    return NextResponse.json({ error: "users array required" }, { status: 400 });
  }

  const allRoles = await db.select().from(roles);
  const results = { inserted: 0, updated: 0, errors: 0 };

  for (const u of body.users) {
    try {
      const roleId =
        u.role_id ??
        (u.role_name ? allRoles.find((r) => r.name === u.role_name)?.id : null);

      const existingUser = u.id
        ? await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, String(u.id)))
            .limit(1)
        : await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, u.email))
            .limit(1);

      const payload = {
        name: u.name,
        email: u.email,
        role_id: roleId ?? null,
        organisation_id: u.organisation_id ?? null,
        status: (u.status ?? "active") as "active" | "pending" | "deactivated",
        emailVerified: true,
        updatedAt: new Date(),
      };

      if (existingUser.length > 0) {
        await db.update(user).set(payload).where(eq(user.id, existingUser[0].id));
        results.updated += 1;
      } else {
        const userId = u.id ? String(u.id) : crypto.randomUUID();
        await db.insert(user).values({
          ...payload,
          id: userId,
          createdAt: new Date(),
        });
        results.inserted += 1;
      }
    } catch {
      results.errors += 1;
    }
  }

  return NextResponse.json(results);
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/migration/users",
    body: { users: [{ name: "string", email: "string", role_id: 0, organisation_id: 0 }] },
    auth: "x-migration-key header",
  });
}
