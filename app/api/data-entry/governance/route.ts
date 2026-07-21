import { db } from "@/db/connection";
import { governanceData } from "@/db/schema/governance";
import { organisations } from "@/db/schema/utility";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, asc, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user.service";
import { revalidatePath } from "next/cache";

const GOVERNANCE_ROLES = new Set(["DEV", "BMO"]);

export async function GET() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!user.role || !GOVERNANCE_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const utilities = await db
    .select()
    .from(organisations)
    .where(eq(organisations.is_utility, true))
    .orderBy(asc(organisations.name));

  const inputDefs = await db
    .select()
    .from(measureDefinitions)
    .where(eq(measureDefinitions.is_active, true));

  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const records = await db.select().from(governanceData);

  const outList = utilities.map((u) => ({
    utility: u.name,
    utilityId: u.id,
    utilityAcronym: u.acronym || u.name,
    data: inputDefs.map((dl) => {
      const d = records.find(
        (r) => r.dl_def_id === dl.id && r.utility_id === u.id,
      );
      return {
        dlDefId: dl.id,
        dlDef: dl.name,
        value: d?.value ?? "No",
        unit: allItems.find((m) => m.id === dl.unit_id)?.name,
        type: allItems.find((m) => m.id === dl.data_type_id)?.name,
      };
    }),
  }));

  return NextResponse.json(outList);
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!user.role || !GOVERNANCE_ROLES.has(user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    dlDefId: number;
    utilityId: number;
    value: string;
  };

  const [existing] = await db
    .select({ id: governanceData.id })
    .from(governanceData)
    .where(
      and(
        eq(governanceData.dl_def_id, body.dlDefId),
        eq(governanceData.utility_id, body.utilityId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(governanceData)
      .set({
        value: body.value,
        updated_date: new Date(),
      })
      .where(eq(governanceData.id, existing.id));
  } else {
    await db.insert(governanceData).values({
      dl_def_id: body.dlDefId,
      utility_id: body.utilityId,
      value: body.value,
      updated_date: new Date(),
    });
  }

  revalidatePath("/settings/governance");
  return NextResponse.json({ success: true });
}
