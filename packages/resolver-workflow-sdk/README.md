# @hitl-sdk/resolver-workflow-sdk

[Vercel Workflow DevKit](https://workflow-sdk.dev) binding for hitl.

## Install

```bash
npm add @hitl-sdk/resolver-workflow-sdk @hitl-sdk/hitl workflow
```

`@hitl-sdk/hitl` and `workflow` are peer dependencies.

## Workflow side

Define a `"use step"` function for HTTP and wire the client in `lib/hitl-client.ts`:

```ts
// lib/hitl-client.ts — import in workflows
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
```

```ts
// workflows/inbound-lead.ts
import { actions, isResolved } from "@hitl-sdk/hitl";
import { waitForHuman } from "../lib/hitl-client";

export async function inboundLead(input: { email: string; draft: { subject: string; body: string } }) {
  "use workflow";

  const approval = await waitForHuman({
    message: `Inbound lead: ${input.email}`,
    actions: actions().approve().deny().build(),
    timeout: "72h",
  });

  if (!isResolved(approval, "approve")) return;
  // ...
}
```

## Server side

```ts
// lib/hitl.ts
import { Hitl } from "@hitl-sdk/hitl";
import { InMemoryState } from "@hitl-sdk/hitl/state";
import { workflowResolver } from "@hitl-sdk/resolver-workflow-sdk";

export const hitl = new Hitl({
  state: new InMemoryState(),
  resolver: workflowResolver(),
});
```

```ts
// app/.well-known/hitl/v1/[[...path]]/route.ts  (Next.js example)
import { hitl } from "@/lib/hitl";

export const { POST } = hitl.routeHandlers;
```

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `HITL_URL` | Workflow runtime | Overrides the server base URL (default: deployment URL from `getWorkflowMetadata()`) |
| `HITL_SECRET` | Workflow runtime | Bearer token for the internal API (if configured) |

Implementation details: [ARCHITECTURE.md](./ARCHITECTURE.md).
