"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { CodeBlock } from "@/components/docs/code-block";
import {
  Section,
  SectionContainer,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@/components/section";
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
    <Section variant="muted">
      <SectionContainer>
        <SectionHeader>
          <SectionTitle>
            {t({ en: "Effortless setup", ja: "かんたんセットアップ" })}
          </SectionTitle>
          <SectionDescription>
            {t({
              en: "A simple declarative API to define and use human approval in your workflows.",
              ja: "シンプルな宣言的 API で、ワークフローに人間承認を組み込めます。",
            })}
          </SectionDescription>
        </SectionHeader>
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
      </SectionContainer>
    </Section>
  );
}
