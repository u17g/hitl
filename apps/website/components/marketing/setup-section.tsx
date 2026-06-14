"use client";

import { ArrowRight } from "lucide-react";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Link } from "@/i18n/navigation";
import { CodeBlock } from "@/components/docs/code-block";
import {
  Section,
  SectionContainer,
  SectionDescription,
  SectionHeader,
  SectionLabel,
  SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
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
      shortcut: "I",
    },
    {
      title: t({ en: "Define a workflow", ja: "ワークフローを定義" }),
      desc: t({
        en: "Use waitForHuman with typed actions inside a durable workflow.",
        ja: "耐久ワークフロー内で waitForHuman と型付き actions を使います。",
      }),
      code: snippets.workflowUsage,
      filename: "workflows/inbound-lead.ts",
      shortcut: "W",
    },
    {
      title: t({ en: "Mount the server", ja: "サーバーをマウント" }),
      desc: t({
        en: "Expose the internal API and wire up your state backend.",
        ja: "内部 API を公開し、ステートバックエンドを接続します。",
      }),
      code: snippets.serverSetup,
      filename: "lib/hitl.ts",
      shortcut: "S",
    },
  ];

  return (
    <Section variant="muted">
      <SectionContainer size="6xl">
        <SectionHeader>
          <SectionLabel>
            {t({ en: "Setup", ja: "セットアップ" })}
          </SectionLabel>
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

        <div className="mt-16 space-y-20">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
            >
              <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="kbd-hint">{step.shortcut}</span>
                </div>
                <h3 className="mt-4 font-display text-2xl md:text-3xl">
                  {step.title}
                </h3>
                <p className="mt-3 text-muted-foreground">{step.desc}</p>
                <Button
                  variant="link"
                  className="mt-4 h-auto p-0 font-mono text-xs text-muted-foreground"
                  asChild
                >
                  <Link href="/docs/getting-started">
                    {t({ en: "Learn more", ja: "詳しく見る" })}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </Button>
              </div>
              <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                <CodeBlock code={step.code} filename={step.filename} />
              </div>
            </div>
          ))}
        </div>
      </SectionContainer>
    </Section>
  );
}
