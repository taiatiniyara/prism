import { getCurrentUser, type CurrentUser } from "@/lib/user.service";

/** Resolve the current user or return a 401 response. */
export const requireUser = async (): Promise<
  { user: CurrentUser } | { response: Response }
> => {
  try {
    const user = await getCurrentUser();
    return { user };
  } catch {
    return { response: Response.json({ message: "Unauthorized" }, { status: 401 }) };
  }
};

/** Map a thrown error to the conventional VALIDATION/FORBIDDEN/500 response. */
export const errorResponse = (error: unknown, fallback: string): Response => {
  const message = error instanceof Error ? error.message : "Unexpected error";

  if (message.startsWith("VALIDATION:")) {
    return Response.json(
      { message: message.replace("VALIDATION:", "") },
      { status: 400 },
    );
  }
  if (message.startsWith("FORBIDDEN:")) {
    return Response.json(
      { message: message.replace("FORBIDDEN:", "") },
      { status: 403 },
    );
  }
  console.error(message, error instanceof Error ? error : undefined);
  return Response.json({ message: fallback }, { status: 500 });
};
