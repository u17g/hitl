# openhitl

**Human-in-the-loop as a typed, durable primitive for TypeScript workflows.**

```ts
const approval = await waitForApproval({
  message: `Send this reply to ${input.email}?`,
  feedbacks: {
    subject: hitl.textField({ label: "Subject", default: draft.subject }),
    body: hitl.textArea({ label: "Body", default: draft.body }),
  },
});
```

One `await`. The workflow suspends — for hours or days, at zero cost, surviving deploys and crashes. A reviewer gets the request in Slack, Teams, or a web inbox, edits the fields, and clicks approve. The workflow resumes with the edited, fully-typed values.

openhitl is **not an agent framework**. Bring your own — the [AI SDK](https://ai-sdk.dev), Mastra, or anything that runs inside a [Workflow DevKit](https://workflow-sdk.dev) workflow. openhitl does one thing: the human part.

> **Status: design phase.** This README is the design document. The API described here is the target interface; implementation follows it.

## Why

Agents that do real work — sending emails, posting messages, issuing refunds — need a human between the draft and the side effect. Everyone building this hits the same wall:

- **Approval is not a boolean.** Reviewers don't just approve or deny; they fix the subject line and rewrite a paragraph. The result must come back typed.
- **The wait is long.** Hours to days. The workflow must suspend durably — no polling loop, no state machine glued to a queue, no lost runs on redeploy.
- **Reviewers live in Slack and Teams**, not in your admin panel. But your workflow code shouldn't know or care which.
- **Existing options are a SaaS or DIY.** Hosted approval services own your data and your flow; hand-rolled Slack glue (interactivity endpoints, payload parsing, state correlation) is the code everyone writes badly, twice.

openhitl is the missing library: open source, typed end-to-end, native to a durable execution engine.

## Design principles

1. **One primitive, done well.** `waitForApproval` and `notify`. No agent abstraction, no workflow engine, no triggers, no deploy story. Compose it with what you already use.
2. **Typed feedbacks.** Field builders define what a reviewer can edit; `REVIEWED` results carry the edited values, typed by inference. The reviewer's edit is data, not a comment.
3. **Durable by construction.** Built on the engine's native suspension via a thin binding (Workflow DevKit hooks in v0): suspension is event-sourced, resumption survives restarts and deploys. openhitl adds no runtime of its own.
4. **Channel-agnostic.** Workflow code declares *what* needs review. Plugins — explicit instances with an `id` and their own token — decide *where* it renders and *how* it comes back.
5. **Thin by design.** A library, a few channel plugins, an inbox UI. No platform, no vault, no control plane. Nothing to operate beyond what you already run.

## Quick example

A Workflow DevKit workflow using the plain AI SDK for drafting and openhitl for the human step:

```ts
// workflows/inbound-lead.ts
import { z } from "zod";
import { generateObject } from "ai";
import { hitl, notify, waitForApproval } from "@openhitl/sdk";
import { sendEmail } from "../lib/email";

export async function inboundLead(input: { email: string; message: string }) {
  "use workflow";

  const { object: draft } = await generateObject({
    model: "anthropic/claude-sonnet-4-5",
    schema: z.object({ subject: z.string(), body: z.string() }),
    prompt: `Draft a reply to this inbound lead:\n${input.message}`,
  });

  // Suspends the run until a human responds — days if necessary.
  const approval = await waitForApproval({
    channel: "lead-approvals",            // plugin id; defaults to the first configured plugin
    message: `Inbound lead: ${input.email}`,
    feedbacks: {
      subject: hitl.textField({ label: "Subject", default: draft.subject }),
      body: hitl.textArea({ label: "Body", default: draft.body }),
    },
    timeout: "72h",
  });

  // Thread context under the approval request
  await notify({
    parent: approval.id,
    message: `Original message:\n${input.message}`,
  });

  if (approval.type === "DENIED" || approval.type === "TIMED_OUT") return;

  const { subject, body } =
    approval.type === "REVIEWED" ? approval.feedbacks : draft;

  await sendEmail({ to: input.email, subject, body });
}
```

Wire the plugins once, at the app edge:

```ts
// hitl.ts
import { createHitl } from "@openhitl/sdk";
import { slackHitl } from "@openhitl/slack";
import { vercelWorkflowBinding } from "@openhitl/vercel-workflow";

export const hitlApp = createHitl({
  binding: vercelWorkflowBinding(),
  plugins: [
    slackHitl({
      id: "lead-approvals",
      channel: "#inbound-leads",
      token: process.env.SLACK_BOT_TOKEN,
    }),
  ],
});

// Mount the callback handler (Slack interactivity, webui inbox API) into your app:
// Express:  app.use("/hitl", hitlApp.handler)
// Hono:     app.route("/hitl", hitlApp.hono)
// Next.js:  export const { GET, POST } = hitlApp.routeHandlers
```

Plugins are explicit instances: secrets are plain `process.env` references passed right here, and the same platform can be wired multiple times (two Slack workspaces, an approvals channel and an alerts channel, ...). Workflow code refers to plugins only by `id`. The `binding` picks the durable execution engine (see [Engine bindings](#engine-bindings)). No other configuration exists.

## API

### `waitForApproval`

```ts
const approval = await waitForApproval({
  message: string,
  feedbacks?: Record<string, HitlField>,  // fields the reviewer can edit
  channel?: string,                       // plugin id; defaults to the first configured plugin
  timeout?: Duration,                     // e.g. "72h"; resolves as { type: "TIMED_OUT" }
});
```

The result is a discriminated union, with `feedbacks` typed by the field definitions:

```ts
type ApprovalResult<F> =
  | { type: "APPROVED"; id: string; by?: Reviewer }
  | { type: "DENIED"; id: string; by?: Reviewer; reason?: string }
  | { type: "REVIEWED"; id: string; by?: Reviewer; feedbacks: F }  // approved with edits
  | { type: "TIMED_OUT"; id: string };
```

Under the hood, `waitForApproval` is a Workflow DevKit hook: the workflow suspends, the plugin delivers the request, and the human's response resolves the hook and resumes the run — across restarts and deploys.

### Field builders

```ts
hitl.textField({ label, default? })
hitl.textArea({ label, default? })
hitl.select({ label, options, default? })
hitl.confirm({ label, default? })
```

Each field renders natively per channel (Slack Block Kit inputs, Teams Adaptive Card fields, web form controls) and contributes its type to `feedbacks`.

### `notify`

Fire-and-forget progress updates and threaded context:

```ts
await notify({ message: string, parent?: string, channel?: string });
```

### Plugin interface

Workflow code declares intent; a plugin — instantiated in `createHitl`, never imported by workflow code — owns rendering and callbacks:

```ts
interface HitlPlugin {
  id: string;   // routing key used by waitForApproval({ channel }) / notify({ channel })
  // Render and deliver an approval request (Slack Block Kit message,
  // Teams Adaptive Card, email with a link to the web inbox, ...)
  send(request: ApprovalRequest): Promise<{ externalId: string }>;
  // Reflect resolution back into the channel (e.g. replace buttons with "Approved by @ryosuke")
  update?(externalId: string, result: ApprovalResult): Promise<void>;
  notify(notification: Notification): Promise<void>;
  // Parse inbound interaction callbacks (Slack interactivity payloads etc.)
  // The runtime resolves the matching Workflow DevKit hook, resuming the workflow.
  handleCallback?(req: Request): Promise<HitlCallback | null>;
}
```

Official plugins:

| Plugin | Package | Renders as |
|---|---|---|
| `slackHitl()` | `@openhitl/slack` | Block Kit message with input fields and approve/deny buttons |
| `teamsHitl()` | `@openhitl/teams` | Adaptive Card |
| `webui()` | built into `openhitl` | Approval inbox (React components from `@openhitl/ui`) |

One package per channel — install only what you use. Writing your own plugin is implementing the interface above.

### `createHitl`

The single wiring point. Takes the plugin list, returns mountable handlers:

```ts
const hitlApp = createHitl({ plugins: [...] });

hitlApp.handler        // Node/Express-style handler
hitlApp.hono           // Hono sub-app
hitlApp.routeHandlers  // Next.js route handlers
```

The handler serves: channel callbacks (e.g. Slack interactivity), the inbox API (`GET /approvals`, used by the webui plugin and available for your own integrations), and approval audit lookups.

## How it works

```mermaid
sequenceDiagram
  participant W as Workflow (WDK run)
  participant A as openhitl
  participant S as Slack
  participant R as Reviewer
  W->>A: waitForApproval(fields)
  A->>A: create WDK hook + record request
  A->>S: plugin.send - Block Kit with fields
  Note over W: suspended - event-sourced, zero cost
  R->>S: edits fields, clicks Approve
  S->>A: interactivity callback
  A->>A: validate + type feedbacks, resolve hook
  A->>W: run resumes with ApprovalResult
  A->>S: plugin.update - "Approved by @ryosuke"
```

What openhitl **owns** (all thin, bounded pieces):

| Piece | What it is |
|---|---|
| `hitl` core | `waitForApproval` / `notify` / field builders / result types, on top of the engine binding |
| Engine bindings | One small package per engine (`@openhitl/vercel-workflow`, ...) implementing `EngineBinding` |
| Plugins | Slack / Teams / webui renderers and callback parsers |
| Inbox UI | React components: pending approvals, request detail, audit trail |
| Approval store | The `Store` interface for pending/resolved requests (powers the inbox and audit). In-memory by default; `@openhitl/store-postgres` and `@openhitl/store-sqlite` for persistence |

What it **deliberately does not own**:

- Durable execution, suspension, replay → **the engine** (Workflow DevKit in v0; see [Engine bindings](#engine-bindings))
- Agents, LLM calls, tools → **AI SDK** (or Mastra, or anything else)
- Deployment, secrets, versioning → **your app and your platform**

## Engine bindings

openhitl asks very little of the execution engine — exactly four things:

1. **Suspend with a token** (workflow side): create a durable wait and obtain an opaque resume token
2. **Resolve by token** (callback side): an external process resumes the wait with a payload
3. **A durable timer** (for `timeout`)
4. **A durable step** (workflow side): run non-deterministic IO (record the request, `plugin.send`) memoized across replays

Every major durable execution engine has native primitives for all four:

| Engine | Suspend | Resume | Timeout | Step |
|---|---|---|---|---|
| Workflow DevKit (v0) | `createHook()` | `resolveHook(token, payload)` | `sleep()` + race | pass-through (workflow code may do IO) |
| Temporal | signal + `condition()` | `handle.signal(workflowId, payload)` | `condition(pred, timeout)` | activity |
| Inngest | `step.waitForEvent(...)` | `inngest.send(event)` with correlation | built-in (null → `TIMED_OUT`) | `step.run` |
| Restate | `ctx.awakeable()` | `resolveAwakeable(id, payload)` | `ctx.sleep` + race | `ctx.run` |

The architecture is split along that contract:

- **Core (engine-agnostic):** approval store, field builders, `ApprovalResult` typing and validation, plugin interface, `createHitl` callback handling, and the approval flow itself (`requestApproval`), which performs all IO through the binding's step primitive. The bulk of the code; knows nothing about engines.
- **Binding (per engine, thin):** the `EngineBinding` interface, implemented by a dedicated package and passed to `createHitl({ binding })`. The *workflow side* is `suspend` / `sleep` / `run` — create the engine-native wait, run IO as durable steps. The *resolver side* is one function, `resolve(token, result)`, called by `createHitl` when a callback arrives — `resumeHook` for WDK, a signal for Temporal, an event for Inngest, `resolveAwakeable` for Restate.

The resume token is **opaque to the core**: for Temporal it encodes `{ workflowId, signalId }`, for Inngest a correlation key. The core just stores it and hands it back. Differences that can't be absorbed surface honestly in the API — e.g. Inngest has no ambient workflow context, so its package ships its own entrypoint taking the step (`waitForApproval(step, opts)`), built from the exported `requestApproval` + `getRuntime`.

Switching engines means switching one import (`@openhitl/vercel-workflow` → `@openhitl/temporal`) and the `binding` entry in `createHitl`. Plugins, the approval store, the inbox — all shared. v0 ships the Workflow DevKit binding (`@openhitl/vercel-workflow`) only; the binding interface exists from day one so the others stay an honest estimate of 50–100 lines each.

## Requirements and setup

- Your code runs inside Workflow DevKit workflows — on Vercel (Vercel world, zero config) or self-hosted (`@workflow/world-postgres`).
- openhitl needs a store for approvals. `createHitl` defaults to the in-memory store; pass a `@openhitl/store-postgres` store (call `await store.ensureSchema()` once at startup, or apply the exported `schemaSql()` via your migrations) or a `@openhitl/store-sqlite` store (schema is created in the constructor) for persistence. With Postgres, setup is one command, which also runs WDK's world migrations when self-hosting:

```bash
DATABASE_URL=postgres://... npx openhitl setup
```

- Local dev: the `webui()` plugin works with zero external services — approve from a local inbox page, no Slack required.

## Packages

| Package | Contents |
|---|---|
| `@openhitl/sdk` | Core: `waitForApproval`, `notify`, `hitl.*` field builders, `createHitl`, `webui()` plugin, inbox API, `Store` interface + `InMemoryStore` |
| `@openhitl/vercel-workflow` | `vercelWorkflowBinding()` — Workflow DevKit engine binding |
| `@openhitl/store-postgres` | `PostgresStore` — bring your own pg-compatible pool |
| `@openhitl/store-sqlite` | `SqliteStore` — `node:sqlite`, zero dependencies |
| `@openhitl/slack` | `slackHitl()` |
| `@openhitl/teams` | `teamsHitl()` |
| `@openhitl/ui` | Inbox React components |

## Roadmap

- **More channels** — email (approve via magic link), Discord
- **Engine bindings** — `@openhitl/temporal`, `@openhitl/inngest`, `@openhitl/restate`, Cloudflare Workflows (see [Engine bindings](#engine-bindings) for the contract)
- **Approval policies** — multi-approver, quorum, role routing, auto-approve rules
- **Escalation** — SLA timers, reminder nudges, fallback channels
- **Audit export** — approval history as structured logs
- **openhitl Cloud (hosted relay)** — a hosted server that owns the platform integrations, replacing per-platform setup with one `cloud({ apiKey })` plugin. One-click OAuth installs instead of hand-built Slack/Azure/Discord apps; resolutions delivered to your app as normalized, HMAC-signed callbacks at `.well-known/openhitl/v1/webhook/:token`; `openhitl listen` forwards them to localhost during development. Implements the same `HitlPlugin` interface and event schema as the in-process plugins — the relay is an alternative transport, not a fork. Library mode stays primary and fully self-contained.

## Repository layout

```
packages/
  sdk/              # @openhitl/sdk (core: waitForApproval, notify, field builders, createHitl, webui)
  vercel-workflow/  # @openhitl/vercel-workflow (Workflow DevKit engine binding)
  store-postgres/   # @openhitl/store-postgres (PostgresStore)
  store-sqlite/     # @openhitl/store-sqlite (SqliteStore on node:sqlite)
  slack/            # @openhitl/slack
  ...               # @openhitl/teams, @openhitl/ui follow as they are implemented
```
