# @hitl-sdk/resolver-inngest

[Inngest](https://www.inngest.com) binding for hitl.

## Install

```bash
npm install @hitl-sdk/resolver-inngest @hitl-sdk/hitl inngest
```

`@hitl-sdk/hitl` and `inngest` are peer dependencies.

## Workflow side

Register hitl once; each export is an Inngest function you invoke with `step.invoke`:

```ts
// inngest/client.ts
import { Inngest } from "inngest";
import { createHitlInngestFunctions } from "@hitl-sdk/resolver-inngest";

export const inngest = new Inngest({ id: "my-app" });

export const { waitForHuman, requestHuman, notify } = createHitlInngestFunctions(inngest);
```

Include the hitl functions in your serve handler alongside your app functions:

```ts
// app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest, waitForHuman, requestHuman, notify } from "@/inngest/client";
import { inboundLead } from "@/inngest/functions/inbound-lead";

export const { GET, POST } = serve({
  client: inngest,
  functions: [inboundLead, waitForHuman, requestHuman, notify],
});
```

Call hitl from your functions via `step.invoke`. Pull `actions` into a variable and assert the result so `isResolved` keeps action ids and feedback types:

```ts
// inngest/functions/inbound-lead.ts
import { actions, isResolved, type HumanResult } from "@hitl-sdk/hitl";
import { inngest, waitForHuman } from "../client";

export const inboundLead = inngest.createFunction(
  { id: "inbound-lead" },
  { event: "lead/inbound" },
  async ({ event, step }) => {
    const actionsDef = actions().approve().deny().build();

    const approval = (await step.invoke("approve-lead", {
      function: waitForHuman,
      data: {
        message: `Inbound lead: ${event.data.email}`,
        actions: actionsDef,
        timeout: "72h",
      },
    })) as HumanResult<typeof actionsDef>;

    if (!isResolved(approval, "approve")) return;
    // approval.feedbacks is typed for the approve action
  },
);
```

`step.invoke` crosses a JSON boundary, so TypeScript cannot infer `HumanResult` from inline `data`. The `actionsDef` variable ties input actions to the asserted result type.

Pass options such as `url`, `secret`, or `event` as the second argument to `createHitlInngestFunctions` if needed. Durable HTTP uses incrementing `hitl-fetch-N` step IDs inside each invoke target.

Typed event names and payloads are exported for `EventSchemas`:

```ts
import { EventSchemas, Inngest } from "inngest";
import {
  HITL_NOTIFY_EVENT,
  HITL_REQUEST_HUMAN_EVENT,
  HITL_RESUME_EVENT,
  HITL_WAIT_FOR_HUMAN_EVENT,
  type HitlInngestEvent,
  type HitlNotifyEvent,
  type HitlRequestHumanEvent,
  type HitlResumeEvent,
  type HitlWaitForHumanEvent,
  type HitlWaitForHumanEventData,
} from "@hitl-sdk/resolver-inngest";

type Events = {
  [HITL_WAIT_FOR_HUMAN_EVENT]: HitlWaitForHumanEvent;
  [HITL_REQUEST_HUMAN_EVENT]: HitlRequestHumanEvent;
  [HITL_NOTIFY_EVENT]: HitlNotifyEvent;
  [HITL_RESUME_EVENT]: HitlResumeEvent;
};

export const inngest = new Inngest({
  id: "my-app",
  schemas: new EventSchemas().fromRecord<Events>(),
});
```

Use `HitlWaitForHumanEventData` when wiring `EventSchemas`. For per-call action typing at invoke sites, prefer `HumanResult<typeof actionsDef>` as shown above.

## Server side

```ts
// lib/hitl.ts
import { Hitl } from "@hitl-sdk/hitl";
import { InMemoryState } from "@hitl-sdk/hitl/state";
import { inngestResolver } from "@hitl-sdk/resolver-inngest";
import { inngest } from "@/inngest/client";

export const hitl = new Hitl({
  state: new InMemoryState(),
  resolver: inngestResolver({ client: inngest }),
});
```

```ts
// app/.well-known/hitl/v1/[[...path]]/route.ts  (Next.js example)
import { hitl } from "@/lib/hitl";

export const { POST } = hitl.routeHandlers;
```

The same Inngest app must serve the hitl HTTP routes and run the functions that invoke hitl.

## Environment

| Variable | Where | Purpose |
|---|---|---|
| `HITL_URL` | Inngest function runtime | Base URL for `step.run` fetch calls to the hitl server |
| `HITL_SECRET` | Inngest function runtime | Bearer token for the internal API (if configured) |

## Advanced

For tests or a custom `request` `step.run` wrapper, use the lower-level client (not for app handlers — use `step.invoke` instead):

```ts
import { createInngestHitlClient, type InngestStep } from "@hitl-sdk/resolver-inngest";

export function createHitl(step: InngestStep) {
  return createInngestHitlClient({ step, url: "https://my-app.example" });
}
```

Implementation details: [ARCHITECTURE.md](./ARCHITECTURE.md).
