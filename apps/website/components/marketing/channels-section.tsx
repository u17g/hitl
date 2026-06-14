"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import {
  CustomWebUiPreview,
  DiscordPreview,
  SlackPreview,
  TeamsPreview,
} from "@/components/marketing/channel-previews";
import {
  Section,
  SectionContainer,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@/components/section";
import type { ComponentType } from "react";

export function ChannelsSection() {
  const t = useInlineTranslation();

  const channels: {
    title: string;
    description: string;
    Preview: ComponentType;
  }[] = [
      {
        title: t({ en: "Slack", ja: "Slack" }),
        description: t({
          en: "Approve without leaving the channels and threads where your team already collaborates.",
          ja: "チームが日々やり取りしているチャンネル・スレッド上でスムーズに承認。",
        }),
        Preview: SlackPreview,
      },
      {
        title: t({ en: "Microsoft Teams", ja: "Microsoft Teams" }),
        description: t({
          en: "Sign off inside Teams — right where chats and handoffs already happen.",
          ja: "業務のやり取りが集中するチャンネル・チャット上で、そのまま完結。",
        }),
        Preview: TeamsPreview,
      },
      {
        title: t({ en: "Discord", ja: "Discord" }),
        description: t({
          en: "Drop AI drafts into your server channels and let your team review in place.",
          ja: "サーバーのチャンネルに AI 下書きを届け、その場でチームがレビュー。",
        }),
        Preview: DiscordPreview,
      },
      {
        title: t({ en: "Web UI", ja: "Web UI" }),
        description: t({
          en: "Embed approvals into your web app. Inbox API is included in the SDK.",
          ja: "ウェブアプリに組み込み。HITL SDK の Inbox API で自由にカスタマイズ。",
        }),
        Preview: CustomWebUiPreview,
      },
    ];

  return (
    <Section variant="muted">
      <SectionContainer size="6xl">
        <SectionHeader>
          <SectionTitle>
            {t({ en: "Keep humans in the loop, wherever they work", ja: "人とAIの判断を、使い慣れたツールでつなぐ" })}
          </SectionTitle>
          <SectionDescription>
            {t({
              en: "AI handles the work. Humans make the calls. Integrates with ",
              ja: "AIが処理し、人が判断する。",
            })}
            <a
              href="https://chat-sdk.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
            >
              {t({ en: "Vercel's Chat SDK", ja: "Vercel Chat SDK" })}
            </a>
            {t({
              en: " — all within Slack, Microsoft Teams, and Discord.",
              ja: " と統合し、Slack、Microsoft Teams、Discord 内で完結。",
            })}
          </SectionDescription>
        </SectionHeader>

        <div className="mt-16 grid gap-4 sm:grid-cols-2">
          {channels.map(({ title, description, Preview }) => (
            <div
              key={title}
              className="group overflow-hidden transition-colors hover:border-foreground/20"
            >
              <div className="overflow-hidden border-b border-border">
                <Preview />
              </div>
              <div className="py-5">
                <h3 className="font-mono text-sm font-medium">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </SectionContainer>
    </Section>
  );
}
