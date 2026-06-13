import { hitl } from "@/lib/hitl";

// Your own inbox endpoint, built on the programmatic `hitl.inbox` API. The UI
// calls these handlers — it never needs to know hitldev's internal HTTP shape.

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status");
  const approvals = await hitl.inbox.list(
    status === "pending" || status === "resolved" ? { status } : undefined,
  );
  return Response.json({ approvals });
}

export async function POST(req: Request) {
  const { id, decision, by, reason, feedbacks } = (await req.json()) as {
    id: string;
    decision: "approve" | "deny";
    by?: { name?: string };
    reason?: string;
    feedbacks?: Record<string, unknown>;
  };

  try {
    const result =
      decision === "approve"
        ? await hitl.inbox.approve(id, { feedbacks, by })
        : await hitl.inbox.deny(id, { reason, by });
    return Response.json({ result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to resolve" },
      { status: 400 },
    );
  }
}
