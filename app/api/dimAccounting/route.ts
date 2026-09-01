import { dimManagedListRoute } from "@/lib/legacy/dim-route-helper";

export async function GET(req: Request) {
  return dimManagedListRoute(req, "Accounting Standards", "Accounting Standard");
}
