"use client";

import { ArrowRight } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Link } from "@/i18n/navigation";
import { StackInstallRow, InstallCommandPill } from "@/components/marketing/stack-install-row";
import { AiAgentFadeStrip } from "@/components/marketing/ai-agent-fade-strip";
import { CodeWindowChrome } from "@/components/marketing/code-comparison";
import {
  ChatPlatformFadeStrip,
} from "@/components/marketing/chat-platform-fade-strip";
import {
  InngestLogo,
  PostgreSQLLogo,
  RedisLogo,
  SQLiteLogo,
  TemporalLogo,
  WorkflowDevKitLogo,
} from "@/components/ui/icons/integration-logos";
import {
  Section,
  SectionBody,
  SectionContainer,
  SectionDescription,
  SectionInfo,
  SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import { snippets } from "@/lib/snippets";

type StackOption = {
  name: string;
  Logo: ComponentType<{ className?: string }>;
  install: string;
};

type StackLayer = {
  id: string;
  title: string;
  description: string;
  options: StackOption[];
  visual?: ReactNode;
};

function StackLayerCard({ layer }: { layer: StackLayer }) {
  return (
    <div className="flex h-full flex-col">
      <h3 className="font-mono text-sm font-medium">{layer.title}</h3>
      <p className="mt-2 min-h-10 text-sm text-muted-foreground">
        {layer.description}
      </p>
      <div className="mt-2 flex h-42 flex-col overflow-hidden">
        <CodeWindowChrome className="flex h-full flex-col justify-center overflow-hidden">
          {layer.visual ? (
            layer.visual
          ) : (
            <div className="flex flex-col items-center space-y-2">
              {layer.options.map((option) => (
                <StackInstallRow
                  key={option.name}
                  name={option.name}
                  Logo={option.Logo}
                  install={option.install}
                />
              ))}
            </div>
          )}
        </CodeWindowChrome>
      </div>
    </div>
  );
}

export function StackSection() {
  const t = useInlineTranslation();

  const layers: StackLayer[] = [
    {
      id: "ai-agent",
      title: t({ en: "AI Agent layer", ja: "AI エージェントレイヤー" }),
      description: t({
        en: "Build durable agents with Workflow SDK and the AI SDK.",
        ja: "Workflow DevKit と AI SDK で耐久エージェントを構築。",
      }),
      visual: <AiAgentFadeStrip install={snippets.installAiAgent} />,
      options: [],
    },
    {
      id: "chat",
      title: t({ en: "Chat layer", ja: "チャットレイヤー" }),
      description: t({
        en: "Deliver approvals to Slack, Teams, Discord, and every Chat SDK platform.",
        ja: "Slack・Teams・Discord など、Chat SDK 対応プラットフォームへ承認を届ける。",
      }),
      visual: (
        <ChatPlatformFadeStrip install={snippets.installChatAdapter} />
      ),
      options: [],
    },
    {
      id: "durable-execution",
      title: t({ en: "Workflow layer", ja: "ワークフローレイヤー" }),
      description: t({
        en: "Pick your workflow engine. HITL ships a resolver for each.",
        ja: "ワークフローエンジンを選ぶだけ。HITL が各エンジン用 resolver を提供。",
      }),
      options: [
        {
          name: "Workflow DevKit",
          Logo: WorkflowDevKitLogo,
          install: snippets.installResolverWorkflow,
        },
        {
          name: "Inngest",
          Logo: InngestLogo,
          install: snippets.installResolverInngest,
        },
        {
          name: "Temporal",
          Logo: TemporalLogo,
          install: snippets.installResolverTemporal,
        },
      ],
    },
    {
      id: "persistent-layer",
      title: t({ en: "Persistent layer", ja: "データベースレイヤー" }),
      description: t({
        en: "Store approval state in the backend you already run.",
        ja: "承認ステートを、既存のバックエンドに保存。",
      }),
      options: [
        {
          name: "PostgreSQL",
          Logo: PostgreSQLLogo,
          install: snippets.installStatePg,
        },
        {
          name: "SQLite",
          Logo: SQLiteLogo,
          install: snippets.installStateSqlite,
        },
        {
          name: "Redis",
          Logo: RedisLogo,
          install: snippets.installStateRedis,
        },
      ],
    },
  ];

  return (
    <Section className="stack-section-bg">
      <SectionContainer size="6xl">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <SectionInfo>
            <SectionTitle className="text-left text-2xl md:text-3xl">
              {t({
                en: "Your durable agent stack.",
                ja: "AI スタック",
              })}
              <br />
              {t({
                en: "No lock-in.",
                ja: "ノー・ロックイン",
              })}
            </SectionTitle>
            <SectionDescription className="text-left text-sm md:text-base">
              {t({
                en: "HITL SDK plugs into the tools you already use.",
                ja: "HITL SDK は既存ツールに差し込むだけ。",
              })}
            </SectionDescription>
            <div className="mt-6">
              <InstallCommandPill install={snippets.install} size="lg" />
            </div>
          </SectionInfo>

          <SectionBody>
            <div className="grid auto-rows-fr gap-4 sm:grid-cols-2">
              {layers.map((layer) => (
                <StackLayerCard key={layer.id} layer={layer} />
              ))}
            </div>
          </SectionBody>
        </div>
      </SectionContainer>
    </Section>
  );
}
