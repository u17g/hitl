export const snippets = {
  install: `npm i @hitl-sdk/hitl`,
  installAiAgent: `npm i @workflow/ai ai`,
  installResolverWorkflow: `npm i @hitl-sdk/resolver-workflow-sdk`,
  installResolverInngest: `npm i @hitl-sdk/resolver-inngest`,
  installResolverTemporal: `npm i @hitl-sdk/resolver-temporal`,
  installStatePg: `npm i @hitl-sdk/state-pg`,
  installStateSqlite: `npm i @hitl-sdk/state-sqlite`,
  installStateRedis: `npm i @hitl-sdk/state-ioredis`,
  installChatAdapter: `npm i @hitl-sdk/adapter-chat-sdk`,
  installAdapters: `npm i @hitl-sdk/adapter-chat-sdk chat @chat-adapter/slack @chat-adapter/teams`,
  workflowUsage: `import { field, actions, isResolved } from "@hitl-sdk/hitl";
import { waitForHuman } from "../lib/hitl-workflow";

export async function inboundLead(input: {
  email: string;
  draft: { subject: string; body: string };
}) {
  "use workflow";

  const approval = await waitForHuman({
    message: \`Inbound lead: \${input.email}\`,
    actions: actions()
      .approve({
        label: "Review and send",
        fields: {
          subject: field.textField({ label: "Subject" }),
          body: field.textArea({ label: "Body" }),
        },
      })
      .deny({
        fields: { reason: field.textArea({ label: "Reason" }) },
      })
      .build(),
    timeout: "72h",
  });

  if (!isResolved(approval, "approve")) return;

  const { subject, body } = approval.edited
    ? approval.feedbacks
    : input.draft;

  await sendEmail({ to: input.email, subject, body });
}`,
  withoutHitl: `const approvalId = crypto.randomUUID();

await db.approvals.insert({
  id: approvalId,
  status: "pending",
  leadEmail: input.email,
  draft: input.draft,
  expiresAt: addHours(new Date(), 72),
});

await slack.postMessage({
  channel: "#sales",
  text: \`Inbound lead: \${input.email}\`,
  blocks: buildApprovalBlocks(approvalId),
});

await queue.enqueue("approval.poll", { approvalId }, {
  repeat: { every: "15m" },
  attempts: 288,
});

// workflow pauses here — resume via cron/webhook
let row = await db.approvals.findById(approvalId);
while (row.status === "pending") {
  if (row.expiresAt < new Date()) {
    await db.approvals.update(approvalId, { status: "expired" });
    return;
  }
  await sleep(POLL_INTERVAL_MS);
  row = await db.approvals.findById(approvalId);
}

if (row.status !== "approved") return;

const edits = await db.approvalEdits.findByApprovalId(approvalId);
await sendEmail({
  to: input.email,
  subject: edits?.subject ?? input.draft.subject,
  body: edits?.body ?? input.draft.body,
});`,
  withHitl: `const approval = await waitForHuman({
  message: \`Draft email to \${input.email} ready for your review.\`,
  actions: actions()
    .approve({ fields: { subject, body } })
    .deny()
    .build(),
});

if (isResolved(approval, "approve")) {
  await sendEmail({ ...approval.feedbacks });
}`,
  hitlPatternEmailReview: `const approval = await waitForHuman({
  message: \`Draft email to \${input.email} ready for your review.\`,
  actions: actions()
    .approve({
      label: "Review and send",
      fields: {
        subject: field.textField({ label: "Subject", default: draft.subject }),
        body: field.textArea({ label: "Body", default: draft.body }),
      },
    })
    .deny({ fields: { reason: field.textArea({ label: "Reason" }) } })
    .build(),
});`,
  hitlPatternExpense: `const approval = await waitForHuman({
  message: "Expense report: $1,200 · Marketing Q2",
  actions: actions()
    .approve({
      fields: {
        amount: field.textField({ label: "Amount" }),
        category: field.textField({ label: "Category" }),
      },
    })
    .deny({ fields: { reason: field.textArea({ label: "Reason" }) } })
    .build(),
});`,
  hitlPatternDeploy: `const approval = await waitForHuman({
  message: "Deploy v2.4 to production?",
  actions: actions()
    .approve({ label: "Ship it" })
    .custom("request_info", {
      label: "Request info",
      fields: { question: field.textArea({ label: "What's blocking?" }) },
    })
    .deny({ label: "Rollback" })
    .build(),
});`,
  hitlPatternRefund: `const approval = await waitForHuman({
  message: "Refund request #4821 — $89.00",
  actions: actions()
    .approve({ label: "Approve refund" })
    .deny({
      label: "Decline",
      fields: { reason: field.textArea({ label: "Reason" }) },
    })
    .build(),
});`,
  hitlPatternAccess: `const approval = await waitForHuman({
  message: \`Grant \${input.role} access to \${input.resource}?\`,
  actions: actions()
    .approve({ label: "Grant access" })
    .deny({ fields: { reason: field.textArea({ label: "Reason" }) } })
    .custom("temporary", {
      label: "Grant temporary",
      fields: { duration: field.textField({ label: "Duration" }) },
    })
    .build(),
});`,
  hitlPatternDataExport: `const approval = await waitForHuman({
  message: \`Export \${input.recordCount} customer records to CSV?\`,
  actions: actions()
    .approve({
      label: "Approve export",
      fields: {
        justification: field.textArea({ label: "Business justification" }),
      },
    })
    .deny({ label: "Deny" })
    .build(),
});`,
  remindersExample: `import { remind, escalate } from "@hitl-sdk/hitl";

const approval = await waitForHuman({
  message: "Approve expense report?",
  actions,
  timeout: "72h",
  reminders: [
    remind.after("1h", { message: "Still waiting for approval" }),
    remind.weekdaysAt("07:00", { tz: "UTC", message: "Morning reminder" }),
    escalate.to("oncall").after("2d"),
  ],
});`,
  serverSetup: `import { Hitl } from "@hitl-sdk/hitl";
import { workflowResolver } from "@hitl-sdk/resolver-workflow-sdk";
import { SqliteState } from "@hitl-sdk/state-sqlite";

export const hitl = new Hitl({
  state: new SqliteState({ path: ".hitl/human_requests.db" }),
  resolver: workflowResolver(),
});`,
  routeHandlers: `import { hitl } from "@/lib/hitl";

export const { POST } = hitl.routeHandlers;`,
  workflowClient: `import { createWorkflowSdkHitlClient } from "@hitl-sdk/resolver-workflow-sdk";

export const { waitForHuman } = createWorkflowSdkHitlClient({
  request: async (url, init) => {
    "use step";
    return fetch(url, init);
  },
});`,
  chatAdapter: `import { Hitl } from "@hitl-sdk/hitl";
import { createChatSdkAdapter } from "@hitl-sdk/adapter-chat-sdk";
import { Chat } from "chat";

const bot = new Chat({ /* platform adapters + state */ });

export const hitl = new Hitl({
  adapters: [
    createChatSdkAdapter({
      id: "approvals",
      bot,
      defaultChannel: "slack:C123",
      inbox: () => hitl.inbox,
    }),
  ],
});

// Per-request destination (one adapter, many channels):
await waitForHuman({
  channel: "approvals:slack:C456",
  message: "Approve?",
  actions,
});`,
  inboxApi: `// List pending human requests, one page at a time (newest-first)
const { items, nextCursor } = await hitl.inbox.list({ status: "pending", limit: 50 });
// Pass nextCursor back to fetch the next page

// Count without loading records (e.g. a pending badge)
const pendingCount = await hitl.inbox.count({ status: "pending" });

// Resolve with optional field edits
await hitl.inbox.resolve(id, {
  actionId: "approve",
  by: { name: "you" },
  feedbacks: { subject: "Updated subject" },
});`,
  helloWorldRun: `pnpm install
pnpm --filter example-hello-world dev`,
} as const;
