import type { HitlRequest } from "@hitl-sdk/hitl/core";
import { createWorkflowSdkHitlClient } from "@hitl-sdk/resolver-workflow-sdk";

async function hitlRequest(req: HitlRequest) {
  "use step";
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  return { status: res.status, ok: res.ok, body: await res.text() };
}

export const { waitForHuman, requestHuman, notify } = createWorkflowSdkHitlClient({
  request: hitlRequest,
});
