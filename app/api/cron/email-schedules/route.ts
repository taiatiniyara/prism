import { NextResponse } from "next/server";
import { checkAndSendDueSchedules } from "@/app/settings/email-schedules/service";

const CRON_API_KEY = process.env.CRON_API_KEY ?? process.env.API_KEY;

export async function GET(request: Request) {
  const providedKey = request.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const configuredKey = CRON_API_KEY ?? "";

  if (!configuredKey || providedKey !== configuredKey) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

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
