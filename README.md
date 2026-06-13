# hitldev

**Human-in-the-loop as a typed, durable primitive for TypeScript workflows.**

```ts
const approval = await waitForApproval({
  message: `Send this reply to ${input.email}?`,
  fields: {
    subject: field.textField({ label: "Subject", default: draft.subject }),
    body: field.textArea({ label: "Body", default: draft.body }),
  },
});
```

One `await`. The workflow suspends — for hours or days, at zero cost, surviving deploys and crashes. A reviewer gets the request in Slack, Teams, or a web inbox, edits the fields, and clicks approve. The workflow resumes with the edited, fully-typed values.

hitldev is **not an agent framework**. Bring your own — the [AI SDK](https://ai-sdk.dev), Mastra, or anything that runs inside a [Workflow DevKit](https://workflow-sdk.dev) workflow. hitldev does one thing: the human part.

> **Status: early.** The core, the Workflow DevKit binding, the Slack / Teams / Discord / webui plugins, and the SQLite / Postgres stores are implemented and tested; the runnable [`examples/hello-world`](examples/hello-world) exercises the full approve loop. The API below is still pre-1.0 and may change.

## Why

Agents that do real work — sending emails, posting messages, issuing refunds — need a human between the draft and the side effect. Everyone building this hits the same wall:

- **Approval is not a boolean.** Reviewers don't just approve or deny; they fix the subject line and rewrite a paragraph. The result must come back typed.
- **The wait is long.** Hours to days. The workflow must suspend durably — no polling loop, no state machine glued to a queue, no lost runs on redeploy.
- **Reviewers live in Slack and Teams**, not in your admin panel. But your workflow code shouldn't know or care which.
- **Existing options are a SaaS or DIY.** Hosted approval services own your data and your flow; hand-rolled Slack glue (interactivity endpoints, payload parsing, state correlation) is the code everyone writes badly, twice.

hitldev is the missing library: open source, typed end-to-end, native to a durable execution engine.

## Design principles

1. **One primitive, done well.** `waitForApproval` (and its list form, `waitForBatchApprovals`) and `notify`. No agent abstraction, no workflow engine, no triggers, no deploy story. Compose it with what you already use.
2. **Typed feedbacks.** Field builders define what a reviewer can edit; `REVIEWED` results carry the edited values, typed by inference. The reviewer's edit is data, not a comment.
3. **Durable by construction.** Built on the engine's native suspension via a thin binding (Workflow DevKit hooks in v0): suspension is event-sourced, resumption survives restarts and deploys. hitldev adds no runtime of its own.
4. **Channel-agnostic.** Workflow code declares *what* needs review. Plugins — explicit instances with an `id` and their own token — decide *where* it renders and *how* it comes back.
5. **Thin by design.** A library, a few channel plugins, an inbox UI. No platform, no vault, no control plane. Nothing to operate beyond what you already run.

## Quick example

A Workflow DevKit workflow using the plain AI SDK for drafting and hitldev for the human step:

```ts
// workflows/inbound-lead.ts
import { z } from "zod";
import { generateObject } from "ai";
import { field } from "@hitldev/sdk";
import { waitForApproval } from "../lib/hitl-workflow";
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
    fields: {
      subject: field.textField({ label: "Subject", default: draft.subject }),
      body: field.textArea({ label: "Body", default: draft.body }),
    },
    timeout: "72h",
    reminder: [
      { after: "0s", message: `Original message:\n${input.message}` },
      { after: "24h", message: "Still waiting for review" },
    ],
  });

  if (approval.type === "DENIED" || approval.type === "TIMED_OUT") return;

  const { subject, body } =
    approval.type === "REVIEWED" ? approval.feedbacks : draft;

  await sendEmail({ to: input.email, subject, body });
}
```

hitldev has two sides. The **server** owns the store and the channel plugins and runs at the app edge. The **workflow client** knows neither — it is a thin HTTP client that reaches the server over a stable, secret-authenticated API.

Wire the server once:

```ts
// lib/hitl.ts — the server: store + channel plugins, mounted as route handlers.
import { createHitl } from "@hitldev/sdk";
import { discordHitl } from "@hitldev/discord";
import { slackHitl } from "@hitldev/slack";
import { teamsHitl } from "@hitldev/teams";
import { workflowResolver } from "@hitldev/vercel-workflow";

export const hitl = createHitl({
  resolver: workflowResolver(),         // resumes the suspended workflow when a callback lands
  secret: process.env.HITLDEV_SECRET,   // bearer shared with the workflow client (optional in local dev)
  plugins: [
    slackHitl({
      id: "lead-approvals",
      channel: "#inbound-leads",
      token: process.env.SLACK_BOT_TOKEN,
    }),
    teamsHitl({
      id: "teams-approvals",
      target: { type: "channel", teamId: process.env.TEAMS_TEAM_ID!, channelId: process.env.TEAMS_CHANNEL_ID! },
      appId: process.env.MICROSOFT_APP_ID,
      appPassword: process.env.MICROSOFT_APP_PASSWORD,
      tenantId: process.env.MICROSOFT_APP_TENANT_ID,
    }),
    discordHitl({
      id: "discord-approvals",
      channelId: process.env.DISCORD_CHANNEL_ID!,
      token: process.env.DISCORD_BOT_TOKEN,
      publicKey: process.env.DISCORD_PUBLIC_KEY,
    }),
  ],
});

// Mount it under /.well-known/hitldev/v1 — serves channel callbacks (Slack interactivity,
// Teams Bot Framework, Discord interactions), the internal workflow API, and the webui inbox:
// Next.js:  export const { GET, POST } = hitl.routeHandlers   // app/.well-known/hitldev/v1/[[...path]]/route.ts
// Express:  app.use("/.well-known/hitldev/v1", hitl.handler)
```

Build the workflow client once too. It needs one durable step — a plain `"use step"` `fetch` to the server, defined in your app so the Workflow DevKit compiler picks up the directive:

```ts
// lib/hitl-workflow.ts — the workflow side: a thin HTTP client. No store, no plugins.
import type { HitlRequest } from "@hitldev/sdk";
import { workflowHitl } from "@hitldev/vercel-workflow";

async function hitlRequest(req: HitlRequest) {
  "use step";
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  return { status: res.status, ok: res.ok, body: await res.text() };
}

export const { waitForApproval, waitForBatchApprovals, notify } = workflowHitl({ request: hitlRequest });
```

Workflow code imports from there:

```ts
import { waitForApproval } from "../lib/hitl-workflow";

const approval = await waitForApproval({ message: "..." });
```

The workflow suspends on an engine hook, POSTs the request to the server, and the server delivers it to the channel. When the reviewer responds, the callback hits the server, which resolves the hook and resumes the run. The base URL defaults to the deployment's own URL (set `HITLDEV_URL` to override); the two sides share `HITLDEV_SECRET` to authenticate the internal API. The server's store can stay the default in-memory one for a single process, or be a shared `@hitldev/store-sqlite` / `@hitldev/store-postgres` for production.

## API

### `waitForApproval`

```ts
const approval = await waitForApproval({
  message: string,
  fields?: Record<string, HitlField>,  // fields the reviewer can edit
  channel?: string,                       // plugin id; defaults to the first configured plugin
  timeout?: Duration,                     // e.g. "72h"; resolves as { type: "TIMED_OUT" }
  reminder?: ReminderEntry[],            // remind / escalate while pending (see below)
});
```

While pending, `reminder` entries fire on a durable timer:

```ts
reminder: [
  { after: "24h", message: "Still waiting for review" },           // same-channel thread remind
  { after: "48h", channel: "oncall", message: "Unanswered" },      // escalate (notify fallback channel)
  { after: "48h", channel: "oncall", mode: "redeliver" },          // escalate (re-send approval UI)
]
```

- `{ after, message? }` — threaded remind on the approval channel (`message` defaults to `"Reminder: approval still pending"`)
- `{ after, channel, message?, mode? }` — escalate to another plugin id (`mode` defaults to `"notify"`)

The result is a discriminated union, with `feedbacks` typed by the field definitions:

```ts
type ApprovalResult<F> =
  | { type: "APPROVED"; id: string; by?: Reviewer }
  | { type: "DENIED"; id: string; by?: Reviewer; reason?: string }
  | { type: "REVIEWED"; id: string; by?: Reviewer; feedbacks: F }  // approved with edits
  | { type: "TIMED_OUT"; id: string };
```

Under the hood, `waitForApproval` suspends on a Workflow DevKit hook and POSTs the request to the server over a durable step; the server records it and delivers it via the plugin. The human's response resolves the hook and resumes the run — across restarts and deploys. `timeout` and `reminder` run on the workflow's durable timer, calling the server's API when they fire.

### `waitForBatchApprovals`

The list form of `waitForApproval`: deliver many approvals as **one message**, reviewed and submitted together.

```ts
const results = await waitForBatchApprovals({
  title: "Outbound emails",
  fields: {
    subject: field.textField({ label: "Subject", default: "Hi" }),
  },
  items: [
    { message: "Email to ACME", defaults: { subject: "Hello ACME" } },
    { message: "Email to Globex" },   // uses the shared field defaults
  ],
  channel: "lead-approvals",
  timeout: "72h",                      // one timeout for the whole batch
  reminder: [{ after: "24h" }],        // reminders/escalation are batch-level too
});
// results: ApprovalResult<{ subject: string }>[], in item order
```

- **Shared field schema.** `fields` is defined once for the whole batch; each item overrides initial values via `defaults`. Every result's `feedbacks` is typed by the same schema.
- **One submit.** The reviewer picks approve/deny per item (and edits fields where the channel supports it), then submits once — one callback resolves the whole batch. Items resolve independently: the same submit can produce `APPROVED`, `DENIED`, and `REVIEWED` results side by side.
- **All-items completion.** The workflow suspends until every item is resolved and returns results in input order. On `timeout`, items already resolved keep their result; the rest become `TIMED_OUT`.
- **Fallback delivery.** Channels that can't render the batch as one message (no `sendBatch`, or `canSendBatch` returns `false` — e.g. over the channel's size limits) receive one regular approval message per item; the batch still waits for all of them.

Channel limits: Slack renders up to the 50-block message limit (roughly 15 items with one field); Teams up to the ~28 KB card limit; Discord renders field-less batches of up to 25 items as a multi-select + Submit (batches **with** fields fall back to per-item delivery, where edits use the modal).

### Field builders

```ts
field.textField({ label, default? })
field.textArea({ label, default? })
field.select({ label, options, default? })
field.confirm({ label, default? })
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
  // A batch submit comes back as one HitlBatchCallback carrying every item's decision.
  handleCallback?(req: Request): Promise<HitlCallback | HitlBatchCallback | null>;
  // Batch capability (optional): render a whole batch as a single message.
  // Absent sendBatch — or canSendBatch returning false — makes the core
  // fall back to one send() per item.
  sendBatch?(request: BatchApprovalRequest): Promise<{ externalId: string }>;
  canSendBatch?(request: BatchApprovalRequest): boolean;
  updateBatch?(externalId: string, results: ApprovalResult[]): Promise<void>;
}
```

Official plugins:

| Plugin | Package | Renders as |
|---|---|---|
| `slackHitl()` | `@hitldev/slack` | Block Kit message with input fields and approve/deny buttons |
| `discordHitl()` | `@hitldev/discord` | Embed message with approve/deny buttons; feedback fields open in a Modal |
| `teamsHitl()` | `@hitldev/teams` | Adaptive Card with input fields and approve/deny actions |
| `webui()` | built into `hitldev` | Approval inbox (React components from `@hitldev/ui`) |

One package per channel — install only what you use. Writing your own plugin is implementing the interface above.

### `createHitl` (server side)

The server. Takes plugins, a store, and a resolver; returns mountable handlers:

```ts
const hitl = createHitl({ resolver, store, plugins: [...], secret });

hitl.fetch             // fetch-style handler — mount under any base path
hitl.handler           // Node/Express-style handler
hitl.routeHandlers     // Next.js route handlers
hitl.runtime / hitl.store / hitl.plugins   // explicit access (advanced)
```

`store` defaults to one in-memory store per process; `secret` defaults to `process.env.HITLDEV_SECRET`. Lower-level building blocks: `createHitlRuntime` and `createHitlApp`.

The handler serves three things under its mount path:

- **The internal workflow API** (`POST /requests`, `/batches`, `/requests/:id/timeout`, `/requests/:id/remind`, `/notifications`, …) — what the workflow client calls. Authenticated with the bearer `secret`; when no secret is set it is open and logs a warning (local dev only).
- **Channel callbacks** (e.g. Slack interactivity) — authenticated by each channel's own scheme (Slack signing, Discord public key, …), so they are not behind the bearer.
- **The inbox API** (`GET /approvals`, `GET /approvals/:id`, `GET /batches/:id`) — used by the webui plugin and available for your own integrations and audit lookups.

### `workflowHitl` (workflow side)

The workflow client, built on the engine's primitives. Returns the workflow helpers:

```ts
const { waitForApproval, waitForBatchApprovals, notify } = workflowHitl({
  request,             // your "use step" function that fetches the server (required)
  url?,                // server base URL; defaults to HITLDEV_URL, then the deployment URL
  basePath?,           // defaults to "/.well-known/hitldev/v1"
  secret?,             // bearer for the internal API; defaults to HITLDEV_SECRET
});
```

`request` is the one piece you write yourself: a `"use step"` function returning the response as plain `{ status, ok, body }` (a `Response` can't cross a step boundary). Defining it in your app — rather than importing a magic durable `fetch` — keeps it an ordinary step the Workflow DevKit compiler can see.

For engines other than Workflow DevKit, drop down to `createHitlClient` from `@hitldev/sdk` and inject the engine's primitives directly (see [Engine bindings](#engine-bindings)).

## How it works

```mermaid
sequenceDiagram
  participant W as Workflow (WDK run)
  participant H as hitldev server
  participant S as Slack
  participant R as Reviewer
  W->>W: suspend on a WDK hook (get resume token)
  W->>H: POST /requests {token, fields} - durable step
  H->>H: record request
  H->>S: plugin.send - Block Kit with fields
  Note over W: suspended - event-sourced, zero cost
  R->>S: edits fields, clicks Approve
  S->>H: interactivity callback
  H->>H: validate + type feedbacks, resolve hook
  H->>W: run resumes with ApprovalResult
  H->>S: plugin.update - "Approved by @ryosuke"
```

The workflow and the server are separate processes (Workflow DevKit runs workflows in their own sandbox); the `.well-known/hitldev/v1` API is the only thing between them. The workflow client carries no store and no plugins.

What hitldev **owns** (all thin, bounded pieces):

| Piece | What it is |
|---|---|
| Server (`createHitl`) | The `.well-known/hitldev/v1` API: request creation, timeout/remind, callbacks, inbox. Owns the store and plugins |
| Workflow client (`createHitlClient` / `workflowHitl`) | `waitForApproval` / `waitForBatchApprovals` / `notify` — suspends, calls the server, drives the timeout/reminder loop |
| Engine bindings | One small package per engine (`@hitldev/vercel-workflow`, ...) implementing `WorkflowPrimitives` + `HitlResolver` |
| Plugins | Slack / Teams / Discord / webui renderers and callback parsers |
| Inbox UI | React components: pending approvals, request detail, audit trail |
| Approval store | The `Store` interface for pending/resolved requests (powers the inbox and audit). In-memory by default; `@hitldev/store-postgres` and `@hitldev/store-sqlite` for persistence |

What it **deliberately does not own**:

- Durable execution, suspension, replay → **the engine** (Workflow DevKit in v0; see [Engine bindings](#engine-bindings))
- Agents, LLM calls, tools → **AI SDK** (or Mastra, or anything else)
- Deployment, secrets, versioning → **your app and your platform**

## Engine bindings

hitldev asks very little of the execution engine — exactly four things, split across the two sides:

1. **Suspend with a token** (workflow side): create a durable wait and obtain an opaque resume token
2. **A durable timer** (workflow side, for `timeout` and `reminder`)
3. **A durable request** (workflow side): an HTTP call to the server, memoized across replays
4. **Resolve by token** (server side): resume the wait with a payload when a callback arrives

All store and plugin IO lives on the server, so the workflow side never runs arbitrary effects — it only suspends, sleeps, and makes durable HTTP calls. Every major durable execution engine has native primitives for all four:

| Engine | Suspend | Timer | Request (durable step) | Resolve |
|---|---|---|---|---|
| Workflow DevKit | `createHook()` | `sleep()` | `"use step"` `fetch` | `resumeHook(token, payload)` |
| Temporal | signal + `condition()` | `condition(pred, timeout)` | activity | `handle.signal(workflowId, payload)` |
| Inngest | `step.waitForEvent(...)` | built-in (null → `TIMED_OUT`) | `step.run` `fetch` | `inngest.send(event)` with correlation |
| Restate | `ctx.awakeable()` | `ctx.sleep` | `ctx.run` `fetch` | `resolveAwakeable(id, payload)` |

The architecture is split along that contract:

- **Core (engine-agnostic):** the approval store, field builders, `ApprovalResult` typing and validation, the plugin interface, the server services (`createApprovalRequest`, `resolveApproval`, `timeoutApproval`, …) and HTTP layer (`createHitl`), and the workflow-side client (`createHitlClient`) that drives the reminder/timeout loop and talks to the server. The bulk of the code; knows nothing about engines.
- **Binding (per engine, thin):** two small interfaces. `WorkflowPrimitives` (`suspend` / `sleep` / `request`) is injected into `createHitlClient` on the workflow side; `HitlResolver` (`resolve`) is passed to `createHitl` on the server side. For WDK: a hook for `suspend`, `sleep` for the timer, your `"use step"` `fetch` for `request`, and `resumeHook` for `resolve`. `@hitldev/vercel-workflow` packages this as `workflowHitl()` + `workflowResolver()`.

The resume token is **opaque to the core**: for Temporal it encodes `{ workflowId, signalId }`, for Inngest a correlation key. The core just stores it and hands it back.

Switching engines means switching one import (`@hitldev/vercel-workflow` → `@hitldev/temporal`) and the `resolver` entry in `createHitl`. Plugins, the approval store, the inbox, the workflow client — all shared. Today ships the Workflow DevKit binding (`@hitldev/vercel-workflow`) only; the interfaces exist from day one so the others stay an honest estimate of 50–100 lines each.

## Requirements and setup

- Your code runs inside Workflow DevKit workflows — on Vercel (Vercel world, zero config) or self-hosted (`@workflow/world-postgres`).
- **Environment:** set `HITLDEV_SECRET` to the same value for the server and the workflow client — it authenticates the internal `.well-known/hitldev/v1` API. Without it the API is open (and logs a warning), which is fine for local dev. Set `HITLDEV_URL` if the server's base URL isn't the deployment's own URL (`workflowHitl` reads it from the run metadata by default).
- hitldev needs a store for approvals, held by the **server** (`createHitl`). It defaults to one in-memory store per process; pass a `@hitldev/store-postgres` or `@hitldev/store-sqlite` store for persistence and to share state across server instances.
- **Custom `Store` implementations:** beyond the single-approval methods, a store implements `findByToken` (idempotent request creation keys on the resume token) and the batch methods (`createBatch`, `getBatch`, `setBatchExternalId`, `listByBatch`) — two extra columns plus a companion `<table>_batches` table in the SQL schema, applied automatically by the bundled stores. `describeStoreContract` from `@hitldev/sdk/store-contract` covers the expected behavior.
- **SQLite** — schema is created automatically in the constructor; no extra step:

```ts
import { DatabaseSync } from "node:sqlite";
import { SqliteStore } from "@hitldev/store-sqlite";

const store = new SqliteStore(new DatabaseSync("hitldev.db"));
```

- **Postgres** — call `ensureSchema()` once at startup, or apply the exported `schemaSql()` through your own migration tool:

```ts
import pg from "pg";
import { PostgresStore } from "@hitldev/store-postgres";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const store = new PostgresStore(pool);
await store.ensureSchema();
```

- **Self-hosted Postgres** — one command creates the hitldev approvals table and runs WDK world migrations (when `@workflow/world-postgres` is installed):

```bash
DATABASE_URL=postgres://... npx hitldev setup
```

  Use `npx hitldev schema` to print idempotent DDL for your migration pipeline (`--dialect postgres|sqlite`, `--table hitldev.approvals`).

- Local dev: the `webui()` plugin works with zero external services — approve from a local inbox page, no Slack required.

### Discord setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications) and add a bot.
2. Enable **Send Messages** and **Message Content Intent** (if reading message content).
3. Copy the bot token to `DISCORD_BOT_TOKEN` and the application **Public Key** to `DISCORD_PUBLIC_KEY`.
4. Set **Interactions Endpoint URL** to your mounted hitl handler (e.g. `https://your-app.example/.well-known/hitldev/v1`). Discord sends a PING on save; `@hitldev/discord` responds automatically.
5. Invite the bot to your server and pass the target channel id as `channelId`.

When a reviewer clicks **Approve** and the request has feedback fields, Discord opens a Modal to collect edits before resolving the approval.

Batches (`waitForBatchApprovals`) render as a multi-select (every item preselected = approve) plus a **Submit** button, for up to 25 field-less items. Discord has no message-level form, so batches **with** fields fall back to per-item delivery automatically — edits then use the modal as usual.

### Teams setup

1. Register a bot in [Azure Bot Service](https://portal.azure.com/#create/Microsoft.AzureBot) and enable the **Microsoft Teams** channel.
2. Copy the **Microsoft App ID** and a client secret to `MICROSOFT_APP_ID` / `MICROSOFT_APP_PASSWORD`.
3. Set the **Messaging endpoint** to your mounted hitl handler (e.g. `https://your-app.example/.well-known/hitldev/v1`).
4. Package and install the Teams app (see [packages/teams/manifest.json](packages/teams/manifest.json)) in the target team and/or for individual reviewers.
5. Pass `teamId` + `channelId` for channel approvals, or a reviewer's Azure AD object id for 1:1 DM approvals.

Teams renders feedback fields inline in the Adaptive Card — no modal step is needed. Batches render as one card with per-item inputs and a single **Submit**; batches over the ~28 KB card limit fall back to per-item delivery.

## Packages

| Package | Contents |
|---|---|
| `@hitldev/sdk` | Core: `createHitl` (server) + `createHitlClient` (workflow), `field.*` field builders, `webui()` plugin, inbox + internal API, `Store` interface + `InMemoryStore`, `@hitldev/sdk/testing` |
| `@hitldev/vercel-workflow` | `workflowHitl()` (workflow client) + `workflowResolver()` (server) — Workflow DevKit engine binding |
| `@hitldev/store-postgres` | `PostgresStore` — bring your own pg-compatible pool |
| `@hitldev/store-sqlite` | `SqliteStore` — `node:sqlite`, zero dependencies |
| `@hitldev/cli` | `hitldev setup` / `hitldev schema` — Postgres setup and DDL export |
| `@hitldev/slack` | `slackHitl()` |
| `@hitldev/discord` | `discordHitl()` |
| `@hitldev/teams` | `teamsHitl()` |
| `@hitldev/ui` | Inbox React components |

## Roadmap

- **More channels** — email (approve via magic link)
- **Engine bindings** — `@hitldev/temporal`, `@hitldev/inngest`, `@hitldev/restate`, Cloudflare Workflows (see [Engine bindings](#engine-bindings) for the contract)
- **Approval policies** — multi-approver, quorum, role routing, auto-approve rules (batched lists ship today as `waitForBatchApprovals`)
- **Escalation** — SLA timers, reminder nudges (`waitForApproval({ reminder })`), fallback channels
- **Audit export** — approval history as structured logs
- **hitldev Cloud (hosted relay)** — a hosted server that owns the platform integrations, replacing per-platform setup with one `cloud({ apiKey })` plugin. One-click OAuth installs instead of hand-built Slack/Azure/Discord apps; resolutions delivered to your app as normalized, HMAC-signed callbacks; `hitldev listen` forwards them to localhost during development. Implements the same `HitlPlugin` interface and event schema as the in-process plugins — the relay is an alternative transport, not a fork. Library mode stays primary and fully self-contained.

## Repository layout

```
examples/
  hello-world/      # Next.js + Workflow DevKit + webui minimal example
packages/
  sdk/              # @hitldev/sdk (core: createHitl, createHitlClient, field builders, webui)
  vercel-workflow/  # @hitldev/vercel-workflow (Workflow DevKit binding: workflowHitl + workflowResolver)
  store-postgres/   # @hitldev/store-postgres (PostgresStore)
  store-sqlite/     # @hitldev/store-sqlite (SqliteStore on node:sqlite)
  cli/              # @hitldev/cli (hitldev setup / schema)
  slack/            # @hitldev/slack
  discord/          # @hitldev/discord
  teams/            # @hitldev/teams
  ...               # @hitldev/ui follows as it is implemented
```
