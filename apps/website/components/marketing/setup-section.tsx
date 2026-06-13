"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { CodeBlock } from "@/components/docs/code-block";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { snippets } from "@/lib/snippets";

export function SetupSection() {
  const t = useInlineTranslation();

  const steps = [
    {
      title: t({ en: "Install", ja: "インストール" }),
      desc: t({
        en: "Add the core SDK and the Workflow DevKit binding.",
        ja: "コア SDK と Workflow DevKit バインディングを追加します。",
      }),
      code: snippets.install,
      filename: "terminal",
    },
    {
      title: t({ en: "Define a workflow", ja: "ワークフローを定義" }),
      desc: t({
        en: "Use waitForHuman with typed actions inside a durable workflow.",
        ja: "耐久ワークフロー内で waitForHuman と型付き actions を使います。",
      }),
      code: snippets.workflowUsage,
      filename: "workflows/inbound-lead.ts",
    },
    {
      title: t({ en: "Mount the server", ja: "サーバーをマウント" }),
      desc: t({
        en: "Expose the internal API and wire up your state backend.",
        ja: "内部 API を公開し、ステートバックエンドを接続します。",
      }),
      code: snippets.serverSetup,
      filename: "lib/hitl.ts",
    },
  ];

  return (
    <section className="border-y bg-muted/30 py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            {t({ en: "Effortless setup", ja: "かんたんセットアップ" })}
          </h2>
          <p className="mt-4 text-muted-foreground">
            {t({
              en: "A simple declarative API to define and use human approval in your workflows.",
              ja: "シンプルな宣言的 API で、ワークフローに人間承認を組み込めます。",
            })}
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <Card key={step.title} className="border bg-background">
              <CardHeader>
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </div>
                <CardTitle>{step.title}</CardTitle>
                <CardDescription>{step.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <CodeBlock code={step.code} filename={step.filename} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
