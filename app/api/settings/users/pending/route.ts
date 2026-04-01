import { listPendingUsers } from "@/app/settings/users/service";

export async function GET() {
  try {
    const items = await listPendingUsers();
    return Response.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (message.startsWith("FORBIDDEN:")) {
      return Response.json(
        { message: message.replace("FORBIDDEN:", "").trim() },
        { status: 403 },
      );
    }

    if (message === "Unauthorized") {
      return Response.json({ message: "Unauthorized" }, { status: 401 });
    }

    return Response.json(
      { message: "Unable to list pending users." },
      { status: 500 },
    );
  }
}
