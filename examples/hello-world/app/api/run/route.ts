import { helloWorkflow } from "@/workflows/hello";
import { start } from "workflow/api";

export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string };
  const name = body.name ?? "world";
  const run = await start(helloWorkflow, [name]);
  return Response.json({ runId: run.runId, name });
}
