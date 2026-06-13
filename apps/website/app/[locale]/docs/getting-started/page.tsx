"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { CodeBlock } from "@/components/docs/code-block";
import { DocPager } from "@/components/docs/doc-pager";
import { snippets } from "@/lib/snippets";

export default function Page() {
  const t = useInlineTranslation();

  return (
    <div className="prose-custom space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t({ en: "Getting Started", ja: "はじめに" })}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {t({
            en: "Hitl SDK is a unified TypeScript library for human-in-the-loop approval in AI agents and durable workflows.",
            ja: "Hitl SDK は、AI エージェントと耐久ワークフローに人間の承認を組み込む統一 TypeScript ライブラリです。",
          })}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t({ en: "Prerequisites", ja: "前提条件" })}
        </h2>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>
            {t({
              en: "Node.js 22.13.0+ (for SQLite state via node:sqlite)",
              ja: "Node.js 22.13.0+（node:sqlite による SQLite ステート用）",
            })}
          </li>
          <li>{t({ en: "pnpm (from the monorepo root)", ja: "pnpm（モノレポルートから）" })}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t({ en: "Run the hello-world example", ja: "hello-world サンプルを実行" })}
        </h2>
        <p className="text-muted-foreground">
          {t({
            en: "The example demonstrates a Workflow DevKit workflow that suspends on waitForHuman, you submit through the web inbox, and the workflow resumes.",
            ja: "Workflow DevKit ワークフローが waitForHuman でサスペンドし、Web inbox で submit すると再開するデモです。",
          })}
        </p>
        <CodeBlock code={snippets.helloWorldRun} filename="terminal" />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t({ en: "Try the UI", ja: "UI を試す" })}</h2>
        <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
          <li>
            {t({
              en: "Enter a name and click Run helloWorkflow.",
              ja: "名前を入力して Run helloWorkflow をクリック。",
            })}
          </li>
          <li>
            {t({
              en: "Approve the pending request in the list.",
              ja: "一覧の保留リクエストを承認。",
            })}
          </li>
          <li>
            {t({
              en: "Check the dev server terminal for Hello, …!",
              ja: "開発サーバーのターミナルで Hello, …! を確認。",
            })}
          </li>
        </ol>
      </section>

      <DocPager slug="getting-started" />
    </div>
  );
}
