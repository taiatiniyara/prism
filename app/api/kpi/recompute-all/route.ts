import { getCurrentUser } from "@/lib/user.service";
import { recomputeAllKpis } from "@/app/settings/kpi/unified-formula-service";

// The batch recompute (every active KPI with a formula + inputs, across all
// participating periods) can take minutes, so it runs as a fire-and-forget job
// on the persistent Node process and the client polls GET for status. This
// maxDuration only bounds the short POST/GET handlers, not the background job.
export const maxDuration = 60;

interface RecomputeJob {
  status: "idle" | "running" | "done" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  processed: number;
  failed: number;
  error: string | null;
  startedByUserId: string | null;
}

// Single-instance in-process singleton (pinned to globalThis so it survives
// module re-evaluation within the one pm2 worker).
const store = globalThis as unknown as { __kpiRecomputeAllJob?: RecomputeJob };
const job: RecomputeJob =
  store.__kpiRecomputeAllJob ??
  (store.__kpiRecomputeAllJob = {
    status: "idle",
    startedAt: null,
    finishedAt: null,
    processed: 0,
    failed: 0,
    error: null,
    startedByUserId: null,
  });

async function requireAdmin(): Promise<
  { user: { id: string; role: string }; error: null } | { user: null; error: Response }
> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return { user: null, error: Response.json({ message: "Unauthorized" }, { status: 401 }) };
  }
  if (user.role !== "DEV" && user.role !== "BMO") {
    return { user: null, error: Response.json({ message: "Forbidden" }, { status: 403 }) };
  }
  return { user: { id: user.id, role: user.role }, error: null };
}

export async function GET(): Promise<Response> {
  const { error } = await requireAdmin();
  if (error) return error;
  return Response.json(job);
}

export async function POST(): Promise<Response> {
  const { user, error } = await requireAdmin();
  if (error) return error;

  if (job.status === "running") {
    return Response.json(
      { ...job, message: "A recompute is already running." },
      { status: 409 },
    );
  }

  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  job.processed = 0;
  job.failed = 0;
  job.error = null;
  job.startedByUserId = user.id;

  // Fire-and-forget. recomputeAllKpis() reruns every active KPI that has a
  // formula + inputs across all participating periods: those whose inputs are
  // present compute a value, the rest are recorded missing-input. Uses the same
  // per-target pipeline as the triggered worker, so results are consistent.
  void recomputeAllKpis()
    .then((result) => {
      job.status = "done";
      job.processed = result.processed ?? 0;
      job.failed = result.failed ?? 0;
      job.finishedAt = new Date().toISOString();
    })
    .catch((e: unknown) => {
      job.status = "error";
      job.error = e instanceof Error ? e.message : String(e);
      job.finishedAt = new Date().toISOString();
    });

  return Response.json(
    { started: true, status: job.status, startedAt: job.startedAt },
    { status: 202 },
  );
}
