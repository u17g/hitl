import { hitl } from "@/lib/hitl";

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status");
  const requests = await hitl.inbox.list(
    status === "pending" || status === "resolved" ? { status } : undefined,
  );

  return Response.json({ requests });
}

export async function POST(req: Request) {
  const { id, actionId, by, feedbacks } = (await req.json()) as {
    id: string;
    actionId: string;
    by?: { name?: string };
    feedbacks?: Record<string, unknown>;
  };

  if (!actionId) {
    return Response.json({ error: "actionId is required" }, { status: 400 });
  }

  try {
    const result = await hitl.inbox.resolve(id, { actionId, feedbacks, by });
    return Response.json({ result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to resolve" },
      { status: 400 },
    );
  }
}
