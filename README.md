# Hitl SDK

[![npm version](https://img.shields.io/npm/v/hitl)](https://www.npmjs.com/package/hitl)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A unified TypeScript SDK for human-in-the-loop approval in durable workflows. Insert typed review steps into agents and automations — one `await`, suspend for hours or days, resume when a human approves in Slack, Teams, Discord, or a web inbox.

Not an agent framework — bring your own [AI SDK](https://ai-sdk.dev) or [Workflow DevKit](https://workflow-sdk.dev) workflow. Hitl SDK does one thing: the human part.

## Installation

```bash
npm install hitl @hitl/resolver-workflow-sdk
```

Install channel adapters for the platforms you want:

```bash
npm install @hitl/adapter-chat-sdk chat @chat-adapter/slack @chat-adapter/teams
```

## Usage

```ts
import { field } from "hitl";
import { waitForApproval } from "../lib/hitl-workflow";

export async function inboundLead(input: { email: string; draft: { subject: string; body: string } }) {
  "use workflow";

  const approval = await waitForApproval({
    message: `Inbound lead: ${input.email}`,
    fields: {
      subject: field.textField({ label: "Subject", default: input.draft.subject }),
      body: field.textArea({ label: "Body", default: input.draft.body }),
    },
    timeout: "72h",
  });

  if (approval.type === "DENIED" || approval.type === "TIMED_OUT") return;

  const { subject, body } =
    approval.type === "REVIEWED" ? approval.feedbacks : input.draft;

  await sendEmail({ to: input.email, subject, body });
}
```

See [`examples/hello-world`](examples/hello-world) for a full walkthrough — server setup, workflow client, and web inbox.

Persistence backends: [`@hitl/state-pg`](packages/state-pg/README.md) (Postgres) and [`@hitl/state-sqlite`](packages/state-sqlite/README.md) (SQLite).

## Channels

| Adapter | Package |
|---|---|
| `chatHitl()` | `@hitl/adapter-chat-sdk` — Slack, Teams, Discord, and every [Chat SDK](https://chat-sdk.dev) platform |
| Web inbox | built into `hitl` — resolve via `hitl.inbox` or your own UI |

One `@hitl/adapter-chat-sdk` adapter covers every Chat SDK platform. Enable platforms by registering their adapters on a `Chat` instance, not by installing more Hitl packages.

