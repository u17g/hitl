import { type Locale } from "@/i18n/routing";

export const docPages = [
  { slug: "getting-started", titleKey: "docs.gettingStarted.title" },
  { slug: "installation", titleKey: "docs.installation.title" },
  { slug: "channels", titleKey: "docs.channels.title" },
  { slug: "workflow-devkit", titleKey: "docs.workflowDevkit.title" },
] as const;

export type DocSlug = (typeof docPages)[number]["slug"];

export function docHref(locale: Locale, slug: DocSlug) {
  return `/${locale}/docs/${slug}`;
}

export const snippets = {
  install: `npm install hitl @hitl/resolver-workflow-sdk`,
  installAdapters: `npm install @hitl/adapter-chat-sdk chat @chat-adapter/slack @chat-adapter/teams`,
  workflowUsage: `import { field } from "hitl";
import { waitForApproval } from "../lib/hitl-workflow";

export async function inboundLead(input: {
  email: string;
  draft: { subject: string; body: string };
}) {
  "use workflow";

  const approval = await waitForApproval({
    message: \`Inbound lead: \${input.email}\`,
    fields: {
      subject: field.textField({ label: "Subject", default: input.draft.subject }),
      body: field.textArea({ label: "Body", default: input.draft.body }),
    },
    timeout: "72h",
  });

  if (approval.type === "DENIED" || approval.type === "TIMED_OUT") return;

  const { subject, body } =
    approval.type === "REVIEWED" ? approval.feedbacks : input.draft;

  await sendEmail({ to: input.email, subject, body });
}`,
  withoutHitl: `// Hand-rolled approval flow
const job = await queue.enqueue("wait-approval", { leadId });
await pollUntilApproved(job.id); // cron + DB + retries
const edits = await db.getEdits(job.id);
await sendEmail({ ...edits });`,
  withHitl: `const approval = await waitForApproval({
  message: \`Inbound lead: \${input.email}\`,
  fields: { subject, body },
  timeout: "72h",
});

if (approval.type === "REVIEWED") {
  await sendEmail({ ...approval.feedbacks });
}`,
  serverSetup: `import { Hitl } from "hitl";
import { workflowResolver } from "@hitl/resolver-workflow-sdk";
import { SqliteState } from "@hitl/state-sqlite";

export const hitl = new Hitl({
  state: new SqliteState({ path: ".hitldev/approvals.db" }),
  resolver: workflowResolver(),
});`,
  routeHandlers: `import { hitl } from "@/lib/hitl";

export const { POST } = hitl.routeHandlers;`,
  workflowClient: `import { workflowHitl } from "@hitl/resolver-workflow-sdk";

export const { waitForApproval } = workflowHitl({
  request: async (url, init) => {
    "use step";
    return fetch(url, init);
  },
});`,
  chatAdapter: `import { Chat } from "chat";
import { chatHitl } from "@hitl/adapter-chat-sdk";
import { slack } from "@chat-adapter/slack";

const chat = new Chat({
  adapters: [chatHitl({ hitl })],
});

chat.register(slack({ ... }));`,
  inboxApi: `// List pending approvals
const pending = await hitl.inbox.list({ status: "pending" });

// Approve with optional field edits
await hitl.inbox.approve(id, {
  by: { name: "you" },
  feedbacks: { subject: "Updated subject" },
});`,
  helloWorldRun: `pnpm install
pnpm --filter @hitldev/example-hello-world dev`,
} as const;
