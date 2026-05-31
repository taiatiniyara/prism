import { db } from "@/db/connection";
import { utilityContextData } from "@/db/schema/governance";
import { organisations } from "@/db/schema/utility";
import { inputDefinitions } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, asc, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user.service";
import { revalidatePath } from "next/cache";

export async function GET() {
  try {
    await getCurrentUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const utilities = await db
    .select()
    .from(organisations)
    .where(eq(organisations.is_utility, true))
    .orderBy(asc(organisations.name));

  const inputDefs = await db
    .select()
    .from(inputDefinitions)
    .where(eq(inputDefinitions.is_active, true));

  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const records = await db.select().from(utilityContextData);

  const outList = utilities.map((o) => {
    const data = records.filter((r) => r.utility_id === o.id);
    return {
      utility: o.name,
      utility_id: o.id,
      utilityAcronym: o.acronym || o.name,
      data: inputDefs.map((dl) => {
        const val = data.find((d) => d.dl_def_id === dl.id);
        return {
          dl_def_id: dl.id,
          dl_def: dl.name,
          value: val?.value ?? null,
          unit: allItems.find((m) => m.id === dl.unit_id)?.name,
          type: allItems.find((m) => m.id === dl.data_type_id)?.name,
        };
      }),
    };
  });

  return NextResponse.json(outList);
}

export async function POST(req: NextRequest) {
  try {
    await getCurrentUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    dl_def_id: number;
    utility_id: number;
    value: string;
  };

  const [existing] = await db
    .select({ id: utilityContextData.id })
    .from(utilityContextData)
    .where(
      and(
        eq(utilityContextData.dl_def_id, body.dl_def_id),
        eq(utilityContextData.utility_id, body.utility_id),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(utilityContextData)
      .set({
        value: body.value,
        updated_date: new Date(),
      })
      .where(eq(utilityContextData.id, existing.id));
  } else {
    await db.insert(utilityContextData).values({
      dl_def_id: body.dl_def_id,
      utility_id: body.utility_id,
      value: body.value,
      updated_date: new Date(),
    });
  }

  revalidatePath("/settings/utility-context");
  return NextResponse.json({ success: true });
}
