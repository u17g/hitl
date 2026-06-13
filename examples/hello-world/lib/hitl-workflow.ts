import type { HitlRequest } from "@hitldev/sdk";
import { workflowHitl } from "@hitldev/vercel-workflow";

// The one durable step the workflow client needs: a plain "use step" function
// that calls the hitldev server. Defined here in the app so the Workflow DevKit
// compiler sees the directive — no stdlib-fetch import, no special bundling.
async function hitlRequest(req: HitlRequest) {
  "use step";
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  return { status: res.status, ok: res.ok, body: await res.text() };
}

export const { waitForApproval, waitForBatchApprovals, notify } = workflowHitl({
  request: hitlRequest,
});
