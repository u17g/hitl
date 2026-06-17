# @hitl-sdk/adapter-line

A hitl channel adapter for the [LINE Messaging API](https://developers.line.biz/en/docs/messaging-api/). Deliver approvals as Flex Messages with postback buttons; resolve through `hitl.inbox` via a LINE webhook. Text and multi-field feedback uses a LIFF form.

For Slack, Teams, Discord, and other Chat SDK platforms, use [`@hitl-sdk/adapter-chat-sdk`](../adapter-chat-sdk/README.md) instead.

## Install

```bash
pnpm add @hitl-sdk/adapter-line @line/bot-sdk
```

`@line/bot-sdk` is a peer dependency.

## Usage

```ts
import { Hitl } from "@hitl-sdk/hitl";
import { LineBotClient } from "@line/bot-sdk";
import { createLineAdapter } from "@hitl-sdk/adapter-line";
import { workflowResolver } from "@hitl-sdk/resolver-workflow-sdk";

const client = LineBotClient.fromChannelAccessToken({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

export const hitl = new Hitl({
  resolver: workflowResolver(),
  adapters: [
    createLineAdapter({
      id: "line-approvals",
      client,
      defaultChannel: "user:Uxxxxxxxx",
      inbox: () => hitl.inbox,
      // Required when actions use text/textarea or multiple feedback fields:
      liffId: process.env.LINE_LIFF_ID,
      feedbackSecret: process.env.LINE_FEEDBACK_SECRET,
    }),
  ],
});
```

### Express

Use `line.middleware` for signature validation and `hitl.handler` for the internal API + LIFF feedback. Branch postbacks with `parsePostback`:

```ts
import express from "express";
import { middleware } from "@line/bot-sdk";
import { handlePostbackEvent, parsePostback } from "@hitl-sdk/adapter-line";

const app = express();

// Workflow internal API + LIFF feedback (GET/POST)
app.all("/.well-known/hitl/v1/*", (req, res) => {
  void hitl.handler(req, res);
});

// Messaging API webhook
app.post(
  "/webhook",
  middleware({ channelSecret: process.env.LINE_CHANNEL_SECRET! }),
  async (req, res) => {
    res.sendStatus(200);

    for (const event of req.body.events ?? []) {
      if (event.type === "postback") {
        if (parsePostback(event.postback.data)) {
          await handlePostbackEvent(event, { client, inbox: hitl.inbox });
        } else {
          await handleMyPostback(event);
        }
        continue;
      }

      if (event.type === "message") {
        await handleMyMessage(event);
      }
    }
  },
);

app.listen(3000);
```

`parsePostback` returns a payload only for hitl Flex buttons. Run this after `line.middleware` (signature already validated). Keep the webhook URL you already registered in LINE Console. Do not apply `express.json()` on `/webhook` before `line.middleware`.

Omit the `else` branch when you only need hitl approvals.

### Fetch-based (Next.js, Hono)

When you are not on Express, use `createLineWebhookHandler`. It validates `x-line-signature` and processes hitl postbacks from a raw `Request`.

Mount the hitl internal API + LIFF feedback route as well:

```ts
// Next.js App Router
// app/.well-known/hitl/v1/[[...path]]/route.ts
export const { GET, POST } = hitl.routeHandlers;

// app/api/webhooks/line/route.ts
import { createLineWebhookHandler } from "@hitl-sdk/adapter-line";
import { hitl, client } from "@/lib/hitl";

export const POST = createLineWebhookHandler({
  channelSecret: process.env.LINE_CHANNEL_SECRET!,
  client,
  inbox: () => hitl.inbox,
  onFallbackEvent: async (event) => {
    if (event.type === "postback") {
      await handleMyPostback(event);
      return;
    }
    if (event.type === "message") {
      await handleMyMessage(event);
    }
  },
});
```

`onFallbackEvent` receives everything hitl does not handle (non-postback events and custom postbacks). Omit it when you only need hitl approvals. Register the webhook route URL in LINE Console.

### LIFF setup (text / textarea / multi-field actions)

When `feedbackSecret` is set, the adapter serves LIFF feedback at:

```
/.well-known/hitl/v1/channels/line/feedback
```

Create a **dedicated LIFF app** for hitl feedback (recommended when you already use LIFF for something else). Set its **Endpoint URL** in LINE Developers Console to:

```
https://{your-domain}/.well-known/hitl/v1/channels/line/feedback
```

Pass that app's LIFF ID to `createLineAdapter({ liffId })`.

### Routing keys

```ts
await waitForHuman({
  channel: "line-approvals:user:U456",
  message: "Approve?",
  actions,
});

await waitForHuman({ channel: "line-approvals", message: "...", actions }); // uses defaultChannel
```

Destination format: `user:Uxxx`, `group:Cxxx`, or `room:Rxxx`.

### Feedback fields

| Field kinds | UX |
|---|---|
| None | Postback button resolves immediately |
| Single `select` or `confirm` | Second Flex message with option buttons |
| `text`, `textarea`, or multiple fields | LIFF form (`liffId` + `feedbackSecret` on the adapter) |

`TimelineAnchor.externalRef` uses `destination#messageId` (e.g. `user:U123#msg-abc`).

### Outcome updates

LINE cannot edit sent messages. After resolve, the adapter pushes a follow-up text message with the outcome (same graceful behavior as other adapters after a process restart).

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full flow.
