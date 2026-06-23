# @hitl-sdk/resolver-upstash-workflow

[Upstash Workflow](https://upstash.com/docs/workflow) binding for hitl.

## Install

```bash
npm add @hitl-sdk/resolver-upstash-workflow @hitl-sdk/hitl @upstash/workflow
```

`@hitl-sdk/hitl` and `@upstash/workflow` are peer dependencies.

## Workflow side

Register hitl once; each export is an invokable workflow you call with
`context.invoke`. Pass the `createWorkflow` from your framework adapter
(`@upstash/workflow/nextjs`, `/hono`, …):

```ts
// workflow/hitl.ts
import { createWorkflow } from "@upstash/workflow/nextjs";
import { createHitlUpstashWorkflows } from "@hitl-sdk/resolver-upstash-workflow";

export const { waitForHuman, requestHuman, notify } = createHitlUpstashWorkflows(createWorkflow);
```

Register the hitl workflows with `serveMany` alongside your own:

```ts
// app/api/workflow/route.ts
import { serveMany } from "@upstash/workflow/nextjs";
import { waitForHuman, requestHuman, notify } from "@/workflow/hitl";
import { inboundLead } from "@/workflow/inbound-lead";

export const { POST } = serveMany({ inboundLead, waitForHuman, requestHuman, notify });
```

Call hitl from your workflows via `context.invoke`. Pull `actions` into a variable
and assert the result so `isResolved` keeps action ids and feedback types:

```ts
// workflow/inbound-lead.ts
import { createWorkflow } from "@upstash/workflow/nextjs";
import { actions, isResolved, type HumanResult } from "@hitl-sdk/hitl";
import { waitForHuman } from "./hitl";

export const inboundLead = createWorkflow<{ email: string }>(async (context) => {
  const actionsDef = actions().approve().deny().build();

  const { body: approval } = await context.invoke("approve-lead", {
    workflow: waitForHuman,
    body: {
      message: `Inbound lead: ${context.requestPayload.email}`,
      actions: actionsDef,
      timeout: "72h",
    },
  });

  if (!isResolved(approval as HumanResult<typeof actionsDef>, "approve")) return;
  // ...
});
```

`context.invoke` crosses a JSON boundary, so TypeScript cannot infer `HumanResult`
from inline `body`. The `actionsDef` variable ties input actions to the asserted
result type.

Pass options such as `url`, `secret`, or a custom `request` step as the second
argument to `createHitlUpstashWorkflows` if needed.

## Server side

```ts
// lib/hitl.ts
import { Hitl } from "@hitl-sdk/hitl";
import { InMemoryState } from "@hitl-sdk/hitl/state";
import { upstashWorkflowResolver } from "@hitl-sdk/resolver-upstash-workflow";
import { Client } from "@upstash/workflow";

const client = new Client({ token: process.env.QSTASH_TOKEN! });

export const hitl = new Hitl({
  state: new InMemoryState(),
  resolver: upstashWorkflowResolver({ client }),
});
```

```ts
// app/.well-known/hitl/v1/[[...path]]/route.ts  (Next.js example)
import { hitl } from "@/lib/hitl";

export const { POST } = hitl.routeHandlers;
```

When a reviewer resolves a request, `upstashWorkflowResolver` calls
`client.notify({ eventId, eventData })` and the suspended run resumes. The same
deployment must expose both the workflow route and `/.well-known/hitl/v1`.

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `HITL_URL` | Workflow runtime | Base URL for the durable `context.run` fetch to the hitl server |
| `HITL_SECRET` | Workflow runtime | Bearer token for the internal API (if configured) |
| `QSTASH_TOKEN` | hitl server | Token for the `@upstash/workflow` `Client` used to notify runs |

## Advanced

For tests or a custom transport, use the lower-level client (not for app handlers —
prefer `context.invoke` so each wait is a separate, durable workflow):

```ts
import { createUpstashWorkflowHitlClient } from "@hitl-sdk/resolver-upstash-workflow";

const hitl = createUpstashWorkflowHitlClient({ context, url: "https://my-app.example" });
```

Implementation details: [ARCHITECTURE.md](./ARCHITECTURE.md).
