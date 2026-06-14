import { getPathname } from "@/i18n/navigation";
import { type Locale } from "@/i18n/routing";

export const docPages = [
  { slug: "getting-started", titleKey: "docs.gettingStarted.title" },
  { slug: "installation", titleKey: "docs.installation.title" },
  { slug: "channels", titleKey: "docs.channels.title" },
  { slug: "workflow-devkit", titleKey: "docs.workflowDevkit.title" },
] as const;

export type DocSlug = (typeof docPages)[number]["slug"];

export function docHref(locale: Locale, slug: DocSlug) {
  return getPathname({ locale, href: `/docs/${slug}` });
}

export const snippets = {
  install: `npm install @hitl-sdk/hitl`,
  installAdapters: `npm install @hitl-sdk/adapter-chat-sdk chat @chat-adapter/slack @chat-adapter/teams`,
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
  message: \`Inbound lead: \${input.email}\`,
  actions: actions()
    .approve({ fields: { subject, body } })
    .build(),
  timeout: "72h",
});

if (isResolved(approval, "approve") && approval.edited) {
  await sendEmail({ ...approval.feedbacks });
}`,
  actionPatterns: `const approval = await waitForHuman({
  message: "Review expense report?",
  actions: actions()
    .approve({
      label: "Approve",
      fields: {
        amount: field.textField({ label: "Amount" }),
        category: field.textField({ label: "Category" }),
      },
    })
    .deny({
      label: "Reject",
      fields: { reason: field.textArea({ label: "Reason" }) },
    })
    .custom("request_info", {
      label: "Request info",
      fields: { question: field.textArea({ label: "What do you need?" }) },
    })
    .build(),
  timeout: "72h",
});`,
  remindersExample: `import { remind, escalate } from "@hitl-sdk/hitl";

const approval = await waitForHuman({
  message: "Approve expense report?",
  actions,
  timeout: "72h",
  reminders: [
    remind.after("1h", { message: "Still waiting for approval" }),
    escalate.to("oncall").after("4h", { mode: "redeliver" }),
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
  inboxApi: `// List pending human requests
const pending = await hitl.inbox.list({ status: "pending" });

// Resolve with optional field edits
await hitl.inbox.resolve(id, {
  actionId: "approve",
  by: { name: "you" },
  feedbacks: { subject: "Updated subject" },
});`,
  helloWorldRun: `pnpm install
pnpm --filter example-hello-world dev`,
} as const;
