import { ManagedListItem } from "@/db/schema/managedLists";

export async function POST(req: Request) {
  const body: ManagedListItem[] = await req.json();
  return new Response(
    JSON.stringify({
      message: "Successfully migrated managed list item data",
      success: true,
      count: body.length,
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}
