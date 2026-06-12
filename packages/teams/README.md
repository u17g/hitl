# @hitldev/teams

Microsoft Teams channel plugin for [hitldev](https://github.com/hitldev/hitldev): Adaptive Card approval messages with inline input fields, Approve/Deny actions, and Bot Framework callbacks.

## Install

```bash
pnpm add @hitldev/teams @hitldev/sdk
```

## Usage

Wire the plugin once at your app edge alongside `createHitl`:

```ts
import { createHitl } from "@hitldev/sdk";
import { teamsHitl } from "@hitldev/teams";
import { vercelWorkflowBinding } from "@hitldev/vercel-workflow";

export const hitlApp = createHitl({
  binding: vercelWorkflowBinding(),
  plugins: [
    // Team channel approvals
    teamsHitl({
      id: "lead-approvals",
      target: { type: "channel", teamId: process.env.TEAMS_TEAM_ID!, channelId: process.env.TEAMS_CHANNEL_ID! },
      appId: process.env.MICROSOFT_APP_ID,
      appPassword: process.env.MICROSOFT_APP_PASSWORD,
      tenantId: process.env.MICROSOFT_APP_TENANT_ID,
    }),
    // 1:1 DM approvals (separate plugin instance)
    teamsHitl({
      id: "dm-approvals",
      target: { type: "user", userId: process.env.TEAMS_REVIEWER_AAD_ID! },
      appId: process.env.MICROSOFT_APP_ID,
      appPassword: process.env.MICROSOFT_APP_PASSWORD,
      tenantId: process.env.MICROSOFT_APP_TENANT_ID,
    }),
  ],
});

// Mount the handler so Teams can POST Bot Framework activities:
// Express:  app.use("/hitl", hitlApp.handler)
// Next.js:  export const { GET, POST } = hitlApp.routeHandlers
```

Workflow code refers to the plugin by `id`:

```ts
const approval = await waitForApproval({
  channel: "lead-approvals",
  message: "Send this reply?",
  fields: {
    subject: field.textField({ label: "Subject", default: draft.subject }),
  },
});
```

## Teams setup

1. Register an app in [Azure Bot Service](https://portal.azure.com/#create/Microsoft.AzureBot) (or reuse an existing bot registration).
2. Copy the **Microsoft App ID** and create a **Client secret** under **Certificates & secrets** → `MICROSOFT_APP_PASSWORD`.
3. Under **Configuration**, set the **Messaging endpoint** to your mounted hitl handler URL, e.g. `https://your-app.example/hitl`.
4. Enable the **Microsoft Teams** channel for the bot.
5. Create or update a Teams app package using [manifest.json](./manifest.json):
   - Replace placeholder `id` / `botId` with your App ID.
   - Add icon files (`outline.png`, `color.png`) and update `validDomains` with your host.
6. Upload the app to Teams and install it in the target team (channel approvals) and/or for individual users (DM approvals).
7. Invite the bot to the approval channel if needed.

### Target options

| Target | When to use |
|---|---|
| `{ type: "channel", teamId, channelId }` | Post into a team channel; the plugin creates a conversation on first send |
| `{ type: "channel", conversationId, serviceUrl? }` | Reuse a known channel conversation id (skip createConversation) |
| `{ type: "user", userId }` | Proactive 1:1 DM to a reviewer (`userId` = Azure AD object id) |

## Environment variables

| Variable | Description |
|---|---|
| `MICROSOFT_APP_ID` | Bot / App registration client id |
| `MICROSOFT_APP_PASSWORD` | Client secret for Bot Framework token acquisition |
| `MICROSOFT_APP_TENANT_ID` | Azure AD tenant id (recommended for multi-tenant bots) |
| `TEAMS_TEAM_ID` | Microsoft Teams team id (channel target) |
| `TEAMS_CHANNEL_ID` | Channel id within the team |
| `TEAMS_REVIEWER_AAD_ID` | Azure AD object id for DM target |

## How it works

1. **`send`** — acquires a Bot Framework token, creates a conversation if needed, posts an Adaptive Card with one input per feedback field and **Approve** / **Deny** actions.
2. **Action.Submit** — Teams POSTs a `message` activity to your hitl handler; the plugin verifies the JWT, parses field values, and resolves the approval.
3. **`update`** — replaces the card with the outcome (inputs and actions removed).
4. **`notify`** — posts a follow-up message, optionally as a reply under the approval activity.

Unlike Discord, Teams supports inline inputs directly in the card — no modal step is needed when feedback fields are present.

## Field mapping

| `field.*` field | Adaptive Card control |
|---|---|
| `textField` | `Input.Text` |
| `textArea` | `Input.Text` (`isMultiline: true`) |
| `select` | `Input.ChoiceSet` |
| `confirm` | `Input.ChoiceSet` (Yes / No) |

## Constraints

- The bot must be **installed** in the target team or user context before proactive messages work.
- Channel posting requires **Create Conversation** on first send (one extra step vs Slack `chat.postMessage`).
- **serviceUrl** is region-specific; the plugin caches the value returned by Bot Framework.
- Inbound requests are verified via Bot Framework JWT (`Authorization: Bearer`).

## Exports

- `teamsHitl(options)` — main plugin factory
- `parseTeamsCallback` — activity parser (for custom wiring)
- `renderApprovalCard`, `renderResultCard`, `extractFeedbacks` — Adaptive Card helpers
- `verifyTeamsRequest` — Bot Framework JWT verification
