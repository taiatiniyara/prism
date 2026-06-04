import { dimManagedListRoute } from "@/lib/dim-route-helper";

export async function GET(req: Request) {
  return dimManagedListRoute(req, "Feeder Type", "Feeder");
}
