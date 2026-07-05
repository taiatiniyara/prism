import { dimManagedListRoute } from "@/lib/legacy/dim-route-helper";

export async function GET(req: Request) {
  return dimManagedListRoute(req, "Data Label Sub-Category", "Division");
}
