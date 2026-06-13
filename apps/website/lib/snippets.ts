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
  workflowUsage: `import { field, humanActions, isResolved } from "hitl";
import { waitForHuman } from "../lib/hitl-workflow";

const actions = humanActions()
  .action("submit", {
    fields: {
      subject: field.textField({ label: "Subject" }),
      body: field.textArea({ label: "Body" }),
    },
  })
  .action("deny", {
    fields: { reason: field.textArea({ label: "Reason" }) },
  })
  .build();

export async function inboundLead(input: {
  email: string;
  draft: { subject: string; body: string };
}) {
  "use workflow";

  const approval = await waitForHuman({
    message: \`Inbound lead: \${input.email}\`,
    actions,
    timeout: "72h",
  });

  if (!isResolved(approval, "submit")) return;

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
  withHitl: `const actions = humanActions()
  .action("submit", { fields: { subject, body } })
  .build();

const approval = await waitForHuman({
  message: \`Inbound lead: \${input.email}\`,
  actions,
  timeout: "72h",
});

if (isResolved(approval, "submit") && approval.edited) {
  await sendEmail({ ...approval.feedbacks });
}`,
  serverSetup: `import { Hitl } from "hitl";
import { workflowResolver } from "@hitl/resolver-workflow-sdk";
import { SqliteState } from "@hitl/state-sqlite";

export const hitl = new Hitl({
  state: new SqliteState({ path: ".hitl/human_requests.db" }),
  resolver: workflowResolver(),
});`,
  routeHandlers: `import { hitl } from "@/lib/hitl";

export const { POST } = hitl.routeHandlers;`,
  workflowClient: `import { workflowHitl } from "@hitl/resolver-workflow-sdk";

export const { waitForHuman } = workflowHitl({
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
  inboxApi: `// List pending human requests
const pending = await hitl.inbox.list({ status: "pending" });

// Resolve with optional field edits
await hitl.inbox.resolve(id, {
  actionId: "submit",
  by: { name: "you" },
  feedbacks: { subject: "Updated subject" },
});`,
  helloWorldRun: `pnpm install
pnpm --filter @hitl/example-hello-world dev`,
} as const;
