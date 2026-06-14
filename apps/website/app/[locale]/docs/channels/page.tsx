"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { CodeBlock } from "@/components/docs/code-block";
import { DocPager } from "@/components/docs/doc-pager";
import { snippets } from "@/lib/snippets";

export default function Page() {
  const t = useInlineTranslation();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t({ en: "Channels", ja: "チャネル" })}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {t({
            en: "Deliver approvals to reviewers on the platforms they already use.",
            ja: "レビュアーが普段使うプラットフォームに承認を届けます。",
          })}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t({ en: "Routing keys", ja: "ルーティングキー" })}
        </h2>
        <p className="text-muted-foreground">
          {t({
            en: "Pass an adapter id to use its defaultChannel, or adapter_id:destination to target a specific Chat SDK channel ref. Escalation uses the same format.",
            ja: "adapter id だけなら defaultChannel、adapter_id:destination で Chat SDK の channel ref を指定できます。escalation も同じ形式です。",
          })}
        </p>
        <CodeBlock
          code={`await waitForHuman({ channel: "approvals", ... });
await waitForHuman({ channel: "approvals:slack:C456", ... });
escalate.to("approvals:slack:C999").after("1h", { mode: "redeliver" });`}
          filename="workflow.ts"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t({ en: "Chat SDK adapter", ja: "Chat SDK アダプター" })}
        </h2>
        <p className="text-muted-foreground">
          {t({
            en: "The @hitl-sdk/adapter-chat-sdk adapter renders native cards and routes interactivity to hitl.inbox across every Chat SDK platform.",
            ja: "@hitl-sdk/adapter-chat-sdk はネイティブカードを描画し、全 Chat SDK プラットフォームのインタラクティブ操作を hitl.inbox にルーティングします。",
          })}
        </p>
        <CodeBlock code={snippets.chatAdapter} filename="lib/chat.ts" />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t({ en: "Web inbox", ja: "Web inbox" })}
        </h2>
        <p className="text-muted-foreground">
          {t({
            en: "Built into hitl. List, approve, and deny via hitl.inbox or expose your own endpoint — the hello-world example shows both.",
            ja: "hitl に内蔵。hitl.inbox で一覧・承認・拒否、または独自エンドポイントを公開 — hello-world が両方を示します。",
          })}
        </p>
        <CodeBlock code={snippets.inboxApi} filename="api/inbox/route.ts" />
      </section>

      <DocPager slug="channels" />
    </div>
  );
}
