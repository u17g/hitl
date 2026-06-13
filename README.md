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
import { field, actions, isResolved } from "hitl";
import { waitForHuman } from "../lib/hitl-workflow";

export async function inboundLead(input: { email: string; draft: { subject: string; body: string } }) {
  "use workflow";

  const approval = await waitForHuman({
    message: `Inbound lead: ${input.email}`,
    actions: actions()
      .approve({
        label: "Review and send",
        fields: {
          subject: field.textField({ label: "Subject", default: input.draft.subject }),
          body: field.textArea({ label: "Body", default: input.draft.body }),
        },
      })
      .deny({
        label: "Reject",
        submitLabel: "Confirm rejection", // optional; defaults to label, then "Deny"
        closeLabel: "Go back", // optional; defaults to "Cancel"
        fields: { reason: field.textArea({ label: "Reason" }) },
      })
      .build(),
    timeout: "72h",
  });

  if (!isResolved(approval, "approve")) return;

  const { subject, body } = approval.edited ? approval.feedbacks : input.draft;

  await sendEmail({ to: input.email, subject, body });
}
```

For one-shot approval, `waitForHuman({ … })` is enough. To post follow-up details while the request is still pending — for example after fetching logs in another step — split the flow:

```ts
const pending = await requestHuman({ message: "Approve deploy?", actions });

await notify({ after: pending, message: "Diff summary", detail: { url: diffUrl } });

const approval = await waitForHuman(pending, { timeout: "24h", reminders: [remind.after("1h")] });
```

See [`examples/hello-world`](examples/hello-world) for a full walkthrough — server setup, workflow client, and web inbox.

Actions with `fields` open a modal on Slack and other Chat SDK platforms. The card button uses `label`; the modal title and submit button default to the same `label` (override with `submitLabel` / `closeLabel`).

Persistence backends: [`@hitl/state-pg`](packages/state-pg/README.md) (Postgres) and [`@hitl/state-sqlite`](packages/state-sqlite/README.md) (SQLite).

## Channels

| Adapter | Package |
|---|---|
| `createChatSdkAdapter()` | `@hitl/adapter-chat-sdk` — Slack, Teams, Discord, and every [Chat SDK](https://chat-sdk.dev) platform |
| Web inbox | built into `hitl` — resolve via `hitl.inbox` or your own UI |

One `@hitl/adapter-chat-sdk` adapter covers every Chat SDK platform. Enable platforms by registering their adapters on a `Chat` instance, not by installing more Hitl packages.

