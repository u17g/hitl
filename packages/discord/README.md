# @hitldev/discord

Discord channel plugin for [hitldev](https://github.com/hitldev/hitldev): embed approval messages with Approve/Deny buttons, Modal-based feedback fields, and signed interaction callbacks.

## Install

```bash
pnpm add @hitldev/discord @hitldev/sdk
```

## Usage

Wire the plugin once at your app edge alongside `createHitl`:

```ts
import { createHitl } from "@hitldev/sdk";
import { discordHitl } from "@hitldev/discord";
import { vercelWorkflowBinding } from "@hitldev/vercel-workflow";

export const hitlApp = createHitl({
  binding: vercelWorkflowBinding(),
  plugins: [
    discordHitl({
      id: "discord-approvals",
      channelId: process.env.DISCORD_CHANNEL_ID!,
      token: process.env.DISCORD_BOT_TOKEN,
      publicKey: process.env.DISCORD_PUBLIC_KEY,
    }),
  ],
});

// Mount the handler so Discord can POST interactions:
// Express:  app.use("/hitl", hitlApp.handler)
// Next.js:  export const { GET, POST } = hitlApp.routeHandlers
```

Workflow code refers to the plugin by `id`:

```ts
const approval = await waitForApproval({
  channel: "discord-approvals",
  message: "Send this reply?",
  fields: {
    subject: field.textField({ label: "Subject", default: draft.subject }),
  },
});
```

## Discord setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications) and add a bot.
2. Under **Bot**, enable **Send Messages**. Enable **Message Content Intent** only if your app needs to read message content.
3. Copy the bot token to `DISCORD_BOT_TOKEN`.
4. Under **General Information**, copy the application **Public Key** (hex) to `DISCORD_PUBLIC_KEY`.
5. Under **General Information**, set **Interactions Endpoint URL** to your mounted hitl handler (e.g. `https://your-app.example/hitl`). Discord sends a PING on save; this plugin responds automatically.
6. Invite the bot to your server with permissions to send messages in the target channel.
7. Pass the channel id (Developer Mode → right-click channel → Copy Channel ID) as `channelId`.

## Environment variables

| Variable | Description |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot token from the Developer Portal |
| `DISCORD_PUBLIC_KEY` | Application public key (hex), used to verify interaction signatures |
| `DISCORD_CHANNEL_ID` | Channel id where approval messages are posted |

## How it works

Unlike Slack Block Kit, Discord does not support inline text inputs on messages. This plugin mirrors the same `HitlPlugin` contract with a two-step flow when feedback fields are present:

1. **`send`** — posts an embed with **Approve** and **Deny** buttons.
2. **Deny** — resolves immediately; the message is updated with the outcome.
3. **Approve (no fields)** — resolves immediately as `APPROVED`.
4. **Approve (with fields)** — opens a **Modal** for the reviewer to edit values, then resolves on submit (as `APPROVED` or `REVIEWED`).
5. **`update`** — patches the original message to show the outcome and removes the buttons.
6. **`notify`** — posts a follow-up message, optionally threaded under the approval via `message_reference`.

Interaction requests are verified with Ed25519 (`X-Signature-Ed25519`, `X-Signature-Timestamp`) before parsing.

## Field mapping

| `field.*` field | Modal control |
|---|---|
| `textField` | Text input (short) |
| `textArea` | Text input (paragraph) |
| `select` | Text input with placeholder listing allowed options |
| `confirm` | Text input (`yes` / `no`) |

## Exports

- `discordHitl(options)` — main plugin factory
- `parseDiscordCallback` — interaction parser (for custom wiring)
- `verifyDiscordRequest` — Ed25519 signature verification
- `renderApprovalMessage`, `renderApprovalModal`, `renderResultMessage`, `parseModalFeedbacks` — rendering helpers
