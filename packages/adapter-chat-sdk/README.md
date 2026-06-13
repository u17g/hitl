# @hitl/adapter-chat-sdk

A hitldev channel plugin backed by the [Vercel Chat SDK](https://chat-sdk.dev). One adapter delivers approvals to Slack, Teams, Discord, and every other Chat SDK platform — the SDK owns webhook verification, payload parsing, and native card rendering (Block Kit, Adaptive Cards, embeds + modal).

## Install

```bash
pnpm add @hitl/adapter-chat-sdk chat @chat-adapter/slack
```

`chat` and the `@chat-adapter/*` packages are peer dependencies — install the adapters for the platforms you use.

## Usage

```ts
import { Hitl } from "hitl";
import { chatHitl } from "@hitl/adapter-chat-sdk";
import { workflowResolver } from "@hitl/resolver-workflow-sdk";
import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";

const bot = new Chat({
  adapters: { slack: createSlackAdapter() },
  state: createRedisState(), // any Chat SDK state adapter
});

export const hitl = new Hitl({
  resolver: workflowResolver(),
  plugins: [
    // `inbox` is lazy: `new Hitl()` needs the plugins before hitl.inbox exists.
    chatHitl({ id: "approvals", bot, channel: "slack:C123", inbox: () => hitl.inbox }),
  ],
});

// Mount the Chat SDK webhook — it owns signature verification + parsing:
export const POST = bot.webhooks.slack; // app/api/webhooks/slack/route.ts
```

`chatHitl` registers approve/deny and modal handlers on the `bot`, so the Chat SDK webhook resolves approvals through `hitl.inbox`. Multiple `chatHitl` plugins sharing one `bot` register the handlers only once.

## How it maps to `HitlPlugin`

- **send** — posts an approval card (message + Approve/Deny buttons carrying the request id) to `channel`; the `SentMessage` handle is kept in memory for `update`.
- **update** — edits the card in place to show the outcome once resolved.
- **notify** — posts to the channel, threading under the parent approval's message when `parentExternalId` is set.
- Feedback fields (`textField` / `textArea` / `select` / `confirm`) are collected through a **modal** opened on Approve, because Chat SDK cards can't hold inline text inputs. So any approval with fields uses the two-step approve → modal → submit flow on every platform.
- **Batches** have no dedicated UI here: without `sendBatch`, the core delivers each item on its own, so every item goes through the same card + modal flow.

### Caveats

- `update` relies on the in-process `SentMessage` handle. After a server restart the handle is gone and `update` becomes a no-op — the approval still resolves; only the in-place card edit is skipped. This matches the behaviour of the previous per-platform plugins.

## JSX

Cards and modals are authored as JSX compiled by the Chat SDK runtime. This package sets `jsxImportSource: "chat"` in its `tsconfig.json`; if you fork the renderer, mirror that in your build (and in vitest's `esbuild` options).
