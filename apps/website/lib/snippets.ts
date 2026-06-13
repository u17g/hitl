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
  withoutHitl: `// Hand-rolled approval flow
const job = await queue.enqueue("wait-approval", { leadId });
await pollUntilApproved(job.id); // cron + DB + retries
const edits = await db.getEdits(job.id);
await sendEmail({ ...edits });`,
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
  chatAdapter: `import { Chat } from "chat";
import { createChatSdkAdapter } from "@hitl-sdk/adapter-chat-sdk";
import { slack } from "@chat-adapter/slack";

const chat = new Chat({
  adapters: [createChatSdkAdapter({ hitl })],
});

chat.register(slack({ ... }));`,
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
