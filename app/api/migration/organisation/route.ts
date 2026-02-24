import { Organisation } from "@/db/schema/utility";

export async function POST(req: Request) {
  const orgs: Organisation[] = await req.json();

  return {
    message: "Organisations retrieved",
    success: true,
    count: orgs.length,
  };
}
