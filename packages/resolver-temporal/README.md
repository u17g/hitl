# @hitl-sdk/resolver-temporal

Temporal binding for hitl.

## Install

```bash
npm add @hitl-sdk/resolver-temporal @hitl-sdk/hitl @temporalio/client @temporalio/workflow
```

`@hitl-sdk/hitl`, `@temporalio/client`, and `@temporalio/workflow` are peer dependencies.

## Workflow side

Temporal splits activity code (I/O) from workflow code (orchestration). Keep them in separate files:

```ts
// activities/hitl.ts — register with your Worker
import type { HitlRequest, HitlResponse } from "@hitl-sdk/hitl/core";

export async function hitlRequestActivity(req: HitlRequest): Promise<HitlResponse> {
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  return { status: res.status, ok: res.ok, body: await res.text() };
}
```

```ts
// lib/hitl-client.ts — import in workflows
import { proxyActivities } from "@temporalio/workflow";
import { createTemporalHitlClient } from "@hitl-sdk/resolver-temporal";
import type * as activities from "../activities/hitl";

const { hitlRequestActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1m",
});

export const { waitForHuman, requestHuman, notify } = createTemporalHitlClient({
  request: hitlRequestActivity,
});
```

```ts
// workflows/inbound-lead.ts
import { actions, isResolved } from "@hitl-sdk/hitl";
import { waitForHuman } from "../lib/hitl-client";

export async function inboundLead(input: { email: string; draft: { subject: string; body: string } }) {
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
import { Connection, Client } from "@temporalio/client";
import { Hitl } from "@hitl-sdk/hitl";
import { InMemoryState } from "@hitl-sdk/hitl/state";
import { temporalResolver } from "@hitl-sdk/resolver-temporal";

const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS });
const temporalClient = new Client({ connection, namespace: process.env.TEMPORAL_NAMESPACE });

export const hitl = new Hitl({
  state: new InMemoryState(),
  resolver: temporalResolver({ client: temporalClient }),
});
```

```ts
// app/api/hitl/[...path]/route.ts  (Next.js example)
import { hitl } from "@/lib/hitl";

export const GET = hitl.handler;
export const POST = hitl.handler;
```

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `HITL_URL` | Worker | Base URL the activity uses to reach the hitl server |
| `HITL_SECRET` | Worker | Bearer token for the internal API (if configured) |
| `TEMPORAL_ADDRESS` | Server | Temporal frontend for `temporalResolver` |
| `TEMPORAL_NAMESPACE` | Server | Namespace for workflow handles |

Implementation details: [ARCHITECTURE.md](./ARCHITECTURE.md).
