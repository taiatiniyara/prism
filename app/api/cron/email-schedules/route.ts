import { NextResponse } from "next/server";
import { checkAndSendDueSchedules } from "@/app/settings/email-schedules/service";

export async function GET() {
  try {
    const results = await checkAndSendDueSchedules();
    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
