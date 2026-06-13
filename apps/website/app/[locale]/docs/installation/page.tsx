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
          {t({ en: "Installation", ja: "インストール" })}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {t({
            en: "Install the core SDK and the engine binding for your durable execution platform.",
            ja: "コア SDK と、耐久実行プラットフォーム用のエンジンバインディングをインストールします。",
          })}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t({ en: "Core packages", ja: "コアパッケージ" })}
        </h2>
        <p className="text-muted-foreground">
          {t({
            en: "hitl provides the server, inbox API, and field builders. @hitl-sdk/resolver-workflow-sdk binds to Workflow DevKit.",
            ja: "hitl はサーバー・inbox API・フィールドビルダーを提供。@hitl-sdk/resolver-workflow-sdk は Workflow DevKit にバインドします。",
          })}
        </p>
        <CodeBlock code={snippets.install} filename="terminal" />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t({ en: "Channel adapters", ja: "チャネルアダプター" })}
        </h2>
        <p className="text-muted-foreground">
          {t({
            en: "Install @hitl-sdk/adapter-chat-sdk and the Chat SDK platforms you need. One adapter covers Slack, Teams, Discord, and every Chat SDK platform.",
            ja: "@hitl-sdk/adapter-chat-sdk と必要な Chat SDK プラットフォームをインストール。1つのアダプターで Slack・Teams・Discord など全プラットフォームに対応。",
          })}
        </p>
        <CodeBlock code={snippets.installAdapters} filename="terminal" />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t({ en: "State backends", ja: "ステートバックエンド" })}
        </h2>
        <p className="text-muted-foreground">
          {t({
            en: "In-memory by default. Use @hitl-sdk/state-sqlite for local dev or @hitl-sdk/state-pg for production Postgres.",
            ja: "デフォルトはインメモリ。ローカル開発は @hitl-sdk/state-sqlite、本番 Postgres は @hitl-sdk/state-pg。",
          })}
        </p>
        <CodeBlock
          code={`npm install @hitl-sdk/state-sqlite\n# or\nnpm install @hitl-sdk/state-pg`}
          filename="terminal"
        />
      </section>

      <DocPager slug="installation" />
    </div>
  );
}
