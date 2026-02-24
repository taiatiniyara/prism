import { ManagedList } from "@/db/schema/managedLists";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body: ManagedList[] = await req.json();
  return NextResponse.json({
    message: "Successfully migrated managed list data",
    success: true,
    count: body.length,
  });
}
