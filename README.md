# HITL sdk

[![npm version](https://img.shields.io/npm/v/@hitl-sdk/hitl)](https://www.npmjs.com/package/@hitl-sdk/hitl)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A unified TypeScript SDK for human-in-the-loop approval in your mission ciritcal agentic workflows.

## Installation

```bash
npm install @hitl-sdk/hitl
```

Install the workflow engine resolver for your platforms:

```bash
# for vercel's workflow sdk
npm install @hitl-sdk/resolver-workflow-sdk

# for inngest
npm install @hitl-sdk/resolver-inngest

# for temporal
npm install @hitl-sdk/resolver-temporal
```

Install channel adapters for the platforms:

```bash
# adapter for vercel's chat sdk
npm install @hitl-sdk/adapter-chat-sdk

# adapter for LINE Messaging API
npm install @hitl-sdk/adapter-line @line/bot-sdk
```

## Usage

```ts
import { field, actions, isResolved } from "@hitl-sdk/hitl";
import { waitForHuman, notify } from "@/lib/hitl-client";

export async function handleInboundLead(input: { email: string; }) {
  "use workflow";

  const report = await researchAgent({ email: input.email });
  const draft = await emailWriterAgent({ email: input.email, report });

  const approval = await waitForHuman({
    message: `I wrote email to: ${input.email}. Review the email. I'll send it if you approve.`,
    actions: actions()
      .approve({
        label: "Review and send",
        fields: {
          subject: field.textField({ label: "Subject", default: draft.subject }),
          body: field.textArea({ label: "Body", default: draft.body }),
        },
      })
      .deny({
        label: "Reject",
        fields: { reason: field.textArea({ label: "Reason" }) },
      })
      .build(),
    timeout: "72h",
  });
  if (!isResolved(approval, "approve")) {
    await notify({ after: approval, message: "Rejected." });
    return;
  }

  await notify({ after: approval, message: `I'm sending email to ${input.email}...` });

  const { subject, body } = approval.feedbacks;
  await sendEmail({ to: input.email, subject, body });

  await notify({ after: approval, message: `Done.` });
}
```

## Supported workflow engines

- [Vercel Workflow SDK](https://workflow-sdk.dev): `@hitl-sdk/resolver-workflow-sdk`
- [Inngest](https://www.inngest.com): `@hitl-sdk/resolver-inngest`
- [Temporal](https://temporal.io): `@hitl-sdk/resolver-temporal`

## Supported backends for persistence

Approval state is in-memory by default. For persistence across restarts and replicas, pass a `State` implementation when constructing `Hitl`:

- [Postgres](https://www.postgresql.org): `@hitl-sdk/state-pg`
- [SQLite](https://www.sqlite.org) (Node 22.13+): `@hitl-sdk/state-sqlite`
- [Redis](https://redis.io): `@hitl-sdk/state-ioredis`

## Supported chat channels

Use `@hitl-sdk/adapter-chat-sdk` with the [Vercel Chat SDK](https://chat-sdk.dev). One Hitl adapter covers every Chat SDK platform — install `chat` plus the `@chat-adapter/*` packages you need:

```bash
npm install @hitl-sdk/adapter-chat-sdk chat @chat-adapter/slack
```

- Discord: `@chat-adapter/discord`
- Google Chat: `@chat-adapter/gchat`
- GitHub: `@chat-adapter/github`
- Linear: `@chat-adapter/linear`
- Messenger: `@chat-adapter/messenger`
- Slack: `@chat-adapter/slack`
- Microsoft Teams: `@chat-adapter/teams`
- Telegram: `@chat-adapter/telegram`
- Twilio: `@chat-adapter/twilio`
- Web: `@chat-adapter/web`
- WhatsApp: `@chat-adapter/whatsapp`

See the [Chat SDK packages](https://github.com/vercel/chat/tree/main/packages) for the full, up-to-date list.

For LINE Official Accounts, use `@hitl-sdk/adapter-line` with `@line/bot-sdk` instead of the Chat SDK adapter. See [`packages/adapter-line/README.md`](packages/adapter-line/README.md).
