# hello-world

## Prerequisites

- Node.js 22+
- pnpm (from the repo root)

## Run

From the repository root:

```bash
pnpm install
pnpm --filter example-hello-world dev
```

## Smoke test (recommended)

The approve/resume loop is verified without Next.js or Workflow DevKit:

```bash
pnpm --filter example-hello-world test
```

## Try the UI

With `pnpm dev` running, open [http://localhost:3000](http://localhost:3000):

1. Enter a name and click **Run helloWorkflow**
2. Approve the pending request in the list
3. Check the dev server terminal for `Hello, …!`

The page polls its own `/api/inbox` route (built on `hitl.inbox`) every 2 seconds.

## Try with curl

In another terminal (with `pnpm dev` running):

**1. Start the workflow**

```bash
curl -s -X POST http://localhost:3000/api/run \
  -H 'content-type: application/json' \
  -d '{"name":"world"}'
```

**2. List pending requests**

```bash
curl -s 'http://localhost:3000/api/inbox?status=pending'
```

Copy the `id` from the first request in the `items` array. The response is one page, newest-first: `{ items, nextCursor }` — pass `?limit=` and `?cursor=<nextCursor>` to page further.

**3. Submit**

```bash
curl -s -X POST "http://localhost:3000/api/inbox" \
  -H 'content-type: application/json' \
  -d '{"id":"<id>","actionId":"approve","by":{"name":"you"}}'
```

**4. Check the dev server logs**

You should see `Hello, world!` printed when the workflow resumes after approval.

> **Note:** Workflow DevKit runs workflows in a separate sandbox from Next.js API routes. The workflow holds no state backend — it suspends and POSTs to the server's `.well-known/hitl/v1` API over a `"use step"` `fetch`. This example keeps pending requests in an in-memory `InMemoryState` (resets on server restart). For production, swap in a persistent backend such as [`@hitl-sdk/state-sqlite`](../../packages/state-sqlite/README.md).

## What this shows

- [`lib/hitl.ts`](lib/hitl.ts) — the server: `new Hitl({ state: new InMemoryState(), resolver: workflowResolver() })` — the web inbox is built in, no adapters needed
- [`app/api/inbox/route.ts`](app/api/inbox/route.ts) — your own inbox endpoint built on `hitl.inbox.list/resolve` (what the UI calls)
- [`lib/hitl-workflow.ts`](lib/hitl-workflow.ts) — the workflow client: a `"use step"` `fetch` passed to `createWorkflowSdkHitlClient({ request })`, exposing `waitForHuman`
- [`workflows/hello.ts`](workflows/hello.ts) — `"use workflow"` + `waitForHuman` from the workflow client
- [`app/.well-known/hitl/v1/[[...path]]/route.ts`](app/.well-known/hitl/v1/%5B%5B...path%5D%5D/route.ts) — `export const { POST } = hitl.routeHandlers`
- [`app/api/run/route.ts`](app/api/run/route.ts) — trigger the workflow with `start()` from Workflow DevKit
