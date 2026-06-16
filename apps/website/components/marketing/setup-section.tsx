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
          <SectionTitle>
            {t({ en: "Quick setup", ja: "クイックにセットアップ" })}
          </SectionTitle>
          <SectionDescription>
            {t({
              en: "A simple declarative API to define and use human approval in your workflows.",
              ja: "シンプルな宣言的 API で、ワークフローに人間承認を組み込めます。",
            })}
          </SectionDescription>
        </SectionHeader>
        <Button
          variant="link"
          className="mt-4 h-auto p-0 font-mono text-xs text-muted-foreground"
          asChild
        >
          <Link href="/docs/quickstart">
            {t({ en: "Learn more", ja: "詳しく見る" })}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </SectionContainer>
    </Section>
  );
}
