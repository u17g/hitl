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
          {t({ en: "Workflow DevKit", ja: "Workflow DevKit" })}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {t({
            en: "Workflow DevKit runs workflows in a separate sandbox from your app server. The workflow client carries no state backend — it suspends and POSTs to the server over a durable step.",
            ja: "Workflow DevKit はアプリサーバーとは別サンドボックスでワークフローを実行します。ワークフロークライアントはステートを持たず、耐久ステップ経由でサーバーに POST します。",
          })}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t({ en: "Workflow client", ja: "ワークフロークライアント" })}
        </h2>
        <p className="text-muted-foreground">
          {t({
            en: "createWorkflowSdkHitlClient wraps suspend, sleep, and request primitives. Define waitForHuman in your app and call it from use workflow functions.",
            ja: "createWorkflowSdkHitlClient がサスペンド・スリープ・リクエストのプリミティブをラップ。アプリで waitForHuman を定義し、use workflow 関数から呼び出します。",
          })}
        </p>
        <CodeBlock code={snippets.workflowClient} filename="lib/hitl-workflow.ts" />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t({ en: "Server setup", ja: "サーバーセットアップ" })}
        </h2>
        <p className="text-muted-foreground">
          {t({
            en: "new Hitl({ state, resolver: workflowResolver() }) owns persistence and channel delivery. Export hitl.routeHandlers for the internal API.",
            ja: "new Hitl({ state, resolver: workflowResolver() }) が永続化とチャネル配信を担当。内部 API 用に hitl.routeHandlers をエクスポート。",
          })}
        </p>
        <CodeBlock code={snippets.serverSetup} filename="lib/hitl.ts" />
        <CodeBlock
          code={snippets.routeHandlers}
          filename="app/.well-known/hitl/v1/[[...path]]/route.ts"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t({ en: "Approval flow", ja: "承認フロー" })}
        </h2>
        <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
          <li>
            {t({
              en: "Workflow calls waitForHuman — suspends and creates a request.",
              ja: "ワークフローが waitForHuman を呼び出し — サスペンドしてリクエストを作成。",
            })}
          </li>
          <li>
            {t({
              en: "Server delivers to adapters and waits for a decision.",
              ja: "サーバーがアダプターへ配信し、決定を待機。",
            })}
          </li>
          <li>
            {t({
              en: "Reviewer approves — resolver resumes the workflow with the result.",
              ja: "レビュアーが承認 — リゾルバーが結果付きでワークフローを再開。",
            })}
          </li>
        </ol>
      </section>

      <DocPager slug="workflow-devkit" />
    </div>
  );
}
