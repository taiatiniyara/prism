import {
  logRegistrationClarificationResponse,
  listRegistrationClarificationMessages,
  sendRegistrationClarificationMessage,
} from "@/app/settings/users/service";
import { parseClarificationRequest } from "@/app/api/settings/users/_lib/validators";
import { revalidatePath } from "next/cache";

type RouteParams = {
  params: Promise<{
    userId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { userId } = await params;

  try {
    const items = await listRegistrationClarificationMessages(userId);
    return Response.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (message.startsWith("FORBIDDEN:")) {
      return Response.json(
        { message: message.replace("FORBIDDEN:", "").trim() },
        { status: 403 },
      );
    }

    if (message.startsWith("NOT_FOUND:")) {
      return Response.json(
        { message: message.replace("NOT_FOUND:", "").trim() },
        { status: 404 },
      );
    }

    if (message === "Unauthorized") {
      return Response.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (message.startsWith("SETUP:")) {
      return Response.json(
        { message: message.replace("SETUP:", "").trim() },
        { status: 503 },
      );
    }

    return Response.json(
      { message: "Unable to fetch clarification messages." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { userId } = await params;

  try {
    const json = await request.json();
    const payload = parseClarificationRequest(json);

    if (payload.action === "send") {
      const result = await sendRegistrationClarificationMessage({
        userId,
        subject: payload.subject,
        message: payload.message,
      });

      revalidatePath("/settings/users");

      return Response.json(result);
    }

    const result = await logRegistrationClarificationResponse({
      userId,
      subject: payload.subject,
      message: payload.message,
      receivedFromEmail: payload.receivedFromEmail,
    });

    revalidatePath("/settings/users");

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (message.startsWith("VALIDATION:")) {
      return Response.json(
        { message: message.replace("VALIDATION:", "").trim() },
        { status: 400 },
      );
    }

    if (message.startsWith("FORBIDDEN:")) {
      return Response.json(
        { message: message.replace("FORBIDDEN:", "").trim() },
        { status: 403 },
      );
    }

    if (message.startsWith("NOT_FOUND:")) {
      return Response.json(
        { message: message.replace("NOT_FOUND:", "").trim() },
        { status: 404 },
      );
    }

    if (message.startsWith("INVALID_TRANSITION:")) {
      return Response.json(
        { message: message.replace("INVALID_TRANSITION:", "").trim() },
        { status: 409 },
      );
    }

    if (message.startsWith("SETUP:")) {
      return Response.json(
        { message: message.replace("SETUP:", "").trim() },
        { status: 503 },
      );
    }

    if (message.startsWith("EMAIL:")) {
      return Response.json(
        { message: message.replace("EMAIL:", "").trim() },
        { status: 502 },
      );
    }

    if (message === "Unauthorized") {
      return Response.json({ message: "Unauthorized" }, { status: 401 });
    }

    return Response.json(
      { message: "Unable to process clarification message." },
      { status: 500 },
    );
  }
}
