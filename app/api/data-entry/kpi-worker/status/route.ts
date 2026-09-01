import { listKpiWorkerStatuses } from "@/app/data-entry/kpi-worker/status.service";
import { getCurrentUser } from "@/lib/user.service";

const parseRequiredNumber = (
  value: string | null,
  fieldName: string,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`VALIDATION:${fieldName} must be a valid number.`);
  }

  return parsed;
};

const parseOptionalNumber = (value: string | null): number | undefined => {
  if (value == null || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export async function GET(request: Request) {
  try {
    await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const reportPeriodId = parseRequiredNumber(
      searchParams.get("reportPeriodId"),
      "reportPeriodId",
    );

    const serviceAreaId = parseOptionalNumber(
      searchParams.get("serviceAreaId"),
    );
    const unitId = parseOptionalNumber(
      searchParams.get("unitId"),
    );

    const attempts = await listKpiWorkerStatuses({
      reportPeriodId,
      serviceAreaId,
      unitId,
    });

    return Response.json(attempts);
  } catch (error) {
    const dbErrorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : null;
    const errorMessage = error instanceof Error ? error.message : "";

    const isKpiAttemptQueryFailure =
      errorMessage.includes("Failed query:") &&
      errorMessage.includes("kpi_calculation_attempts");

    // During rollout, table/column mismatches should not break the data-entry screen.
    if (
      dbErrorCode === "42P01" ||
      dbErrorCode === "42703" ||
      isKpiAttemptQueryFailure
    ) {
      return Response.json([]);
    }

    if (errorMessage.startsWith("VALIDATION:")) {
      return Response.json(
        { message: errorMessage.replace("VALIDATION:", "") },
        { status: 400 },
      );
    }

    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to read KPI worker status.",
      },
      { status: 500 },
    );
  }
}
