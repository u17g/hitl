# @hitldev/slack

Slack channel plugin for [hitldev](https://github.com/hitldev/hitldev): Block Kit approval messages with inline input fields, Approve/Deny buttons, and interactivity callbacks.

## Install

```bash
pnpm add @hitldev/slack @hitldev/sdk
```

## Usage

Wire the plugin once at your app edge alongside `createHitl`:

```ts
import { createHitl } from "@hitldev/sdk";
import { slackHitl } from "@hitldev/slack";
import { workflowResolver } from "@hitldev/vercel-workflow";

export const hitlApp = createHitl({
  resolver: workflowResolver(),
  secret: process.env.HITLDEV_SECRET,
  plugins: [
    slackHitl({
      id: "lead-approvals",
      channel: "#inbound-leads",
      token: process.env.SLACK_BOT_TOKEN,
    }),
  ],
});

// Mount under /.well-known/hitldev/v1 so Slack can POST interactivity payloads:
// Express:  app.use("/.well-known/hitldev/v1", hitlApp.handler)
// Next.js:  export const { GET, POST } = hitlApp.routeHandlers
```

Workflow code refers to the plugin by `id` (import from your workflow-side module — see the root README):

```ts
import { field } from "@hitldev/sdk";
import { waitForApproval } from "../lib/hitl-workflow";

const approval = await waitForApproval({
  channel: "lead-approvals",
  message: "Send this reply?",
  fields: {
    subject: field.textField({ label: "Subject", default: draft.subject }),
  },
});
```

## Slack setup

The fastest path is to import the bundled [manifest.json](./manifest.json).

1. Open [Slack API → Your Apps](https://api.slack.com/apps) and choose **Create New App** → **From an app manifest**.
2. Pick your workspace, paste the contents of `manifest.json`, and create the app.
3. Before saving in production, edit `settings.interactivity.request_url` in the manifest (or under **Interactivity & Shortcuts** in the app settings) to your mounted hitl handler URL with the `slack` callback segment, e.g. `https://your-app.example/.well-known/hitldev/v1/slack`.
4. Under **OAuth & Permissions**, click **Install to Workspace** (or reinstall after scope changes).
5. Copy the **Bot User OAuth Token** (`xoxb-...`) to `SLACK_BOT_TOKEN`.
6. Invite the bot to your approval channel (`/invite @hitldev` in `#inbound-leads`), or rely on `chat:write.public` (included in the manifest) to post to public channels without joining.

### Manual setup

If you prefer not to use the manifest:

| Setting | Value |
|---|---|
| **Bot Token Scopes** | `chat:write`, `chat:write.public` |
| **Interactivity** | Enabled; Request URL → `https://your-app.example/.well-known/hitldev/v1/slack` |
| **Socket Mode** | Off (not used by this plugin) |

## Environment variables

| Variable | Description |
|---|---|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (`xoxb-...`) from **OAuth & Permissions** |

Only the bot token is required at runtime. Slack also issues a **Signing Secret** under **Basic Information**; this plugin does not verify interactivity signatures yet (unlike `@hitldev/discord`, which verifies Ed25519 signatures). Treat your Request URL as a trusted endpoint or add verification before exposing it publicly.

## How it works

1. **`send`** — posts a Block Kit message with one input block per feedback field and **Approve** / **Deny** buttons.
2. **Button click** — Slack POSTs a `block_actions` payload to your hitl handler; the plugin parses it and resolves the approval.
3. **`update`** — replaces the interactive message with the outcome (inputs and buttons removed).
4. **`notify`** — posts a follow-up message, optionally as a thread reply under the approval message.

Unlike Discord, Slack supports inline inputs directly in the message — no modal step is needed when feedback fields are present.

## Field mapping

| `field.*` field | Block Kit control |
|---|---|
| `textField` | `plain_text_input` |
| `textArea` | `plain_text_input` (multiline) |
| `select` | `static_select` |
| `confirm` | `radio_buttons` (Yes / No) |

## Exports

- `slackHitl(options)` — main plugin factory
- `parseSlackCallback` — interactivity parser (for custom wiring)
- `renderApprovalBlocks`, `renderResultBlocks` — Block Kit rendering helpers
