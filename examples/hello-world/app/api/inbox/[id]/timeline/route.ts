import { hitl } from "@/lib/hitl";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const request = await hitl.inbox.get(id);
  if (!request) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const timeline = await hitl.state.timeline(id);
  return Response.json({ timeline });
}
