# @hitl-sdk/adapter-chat-sdk

A hitl channel adapter backed by the [Vercel Chat SDK](https://chat-sdk.dev). One adapter delivers approvals to Slack, Teams, Discord, and every other Chat SDK platform — the SDK owns webhook verification, payload parsing, and native card rendering (Block Kit, Adaptive Cards, embeds + modal).

## Install

```bash
pnpm add @hitl-sdk/adapter-chat-sdk chat @chat-adapter/slack
```

`chat` and the `@chat-adapter/*` packages are peer dependencies — install the adapters for the platforms you use.

## Usage

```ts
import { Hitl } from "@hitl-sdk/hitl";
import { createChatSdkAdapter } from "@hitl-sdk/adapter-chat-sdk";
import { workflowResolver } from "@hitl-sdk/resolver-workflow-sdk";
import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";

const bot = new Chat({
  adapters: { slack: createSlackAdapter() }, // Chat SDK platform adapters
  state: createRedisState(), // any Chat SDK state adapter
});

export const hitl = new Hitl({
  resolver: workflowResolver(),
  adapters: [ // hitl channel adapters
    // `inbox` is lazy: `new Hitl()` needs the adapters before hitl.inbox exists.
    createChatSdkAdapter({
      id: "approvals",
      bot,
      defaultChannel: "slack:C123",
      inbox: () => hitl.inbox,
    }),
  ],
});

// Mount the Chat SDK webhook — it owns signature verification + parsing:
export const POST = bot.webhooks.slack; // app/api/webhooks/slack/route.ts
```

`createChatSdkAdapter` registers approve/deny and modal handlers on the `bot`, so the Chat SDK webhook resolves approvals through `hitl.inbox`. Multiple `createChatSdkAdapter` adapters sharing one `bot` register the handlers only once.

### One adapter, multiple channels

Route per-request to any Chat SDK channel ref the bot can post into:

```ts
await waitForHuman({
  channel: "approvals:slack:C456", // adapter id + Chat SDK channel ref
  message: "Approve?",
  actions,
});

// Adapter id only uses defaultChannel when configured:
await waitForHuman({ channel: "approvals", message: "...", actions });

// Or omit defaultChannel and always pass adapter_id:destination:
await waitForHuman({ channel: "approvals:slack:C456", message: "...", actions });
```

Escalation uses the same routing key:

```ts
reminders: [escalate.to("approvals:slack:C999").after("1h", { mode: "redeliver" })],
```

### Post in a thread

Include the Chat SDK thread ref in the channel destination (everything after `adapter_id:`):

```ts
await waitForHuman({
  channel: "approvals:slack:C123:1710000000.123456",
  message: "Approve?",
  actions,
});
```

Inside a workflow, chain later steps with `after` — hitl resolves the thread from state:

```ts
const pending = await requestHuman({ message: "Step 1", actions });
await notify({ after: pending, message: "Extra context" });
```

### TimelineAnchor.externalRef

`requestHuman` and `notify` return a `TimelineAnchor` with an `externalRef` string: the adapter-native ref for the message hitl posted. With this adapter the format is `channel#messageId` (e.g. `slack:C123#1710000000.123456`). It is output-only — the library does not read it for routing. When the adapter returns no id, `externalRef` is `""`.

Use it to correlate hitl deliveries with your Chat SDK bot, for example to post a side note in the same thread:

```ts
const pending = await requestHuman({ message: "Approve?", actions, channel: "approvals" });

if (pending.externalRef) {
  const threadRef = pending.externalRef.replace("#", ":");
  await bot.thread(threadRef).post("Side note from the bot");
}
```
