import { hitl } from "@/lib/hitl";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const status = params.get("status");
  // Returns one page, newest-first: { items, nextCursor }
  const page = await hitl.inbox.list({
    status: status === "pending" || status === "resolved" ? status : undefined,
    limit: params.get("limit") ? Number(params.get("limit")) : undefined,
    cursor: params.get("cursor") ?? undefined,
  });

  return Response.json(page);
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
