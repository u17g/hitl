"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import {
  Section,
  SectionContainer,
  SectionDescription,
  SectionHeader,
  SectionLabel,
  SectionTitle,
} from "@/components/section";

export function ChannelsSection() {
  const t = useInlineTranslation();

  const channels = [
    {
      title: t({ en: "Slack", ja: "Slack" }),
      description: t({
        en: "Block Kit cards with Approve/Deny and editable modals.",
        ja: "Block Kit カードと Approve/Deny、編集可能なモーダル。",
      }),
      preview: [
        "┌─ Expense approval ─────────┐",
        "│ $1,200 · Marketing Q2     │",
        "│ [Approve] [Deny] [Edit]   │",
        "└───────────────────────────┘",
      ],
    },
    {
      title: t({ en: "Microsoft Teams", ja: "Microsoft Teams" }),
      description: t({
        en: "Adaptive Cards with native interactivity.",
        ja: "Adaptive Cards とネイティブなインタラクティブ操作。",
      }),
      preview: [
        "┌─ Adaptive Card ───────────┐",
        "│ Deploy v2.4 to production?  │",
        "│ [Approve]  [Request info] │",
        "└───────────────────────────┘",
      ],
    },
    {
      title: t({ en: "Discord", ja: "Discord" }),
      description: t({
        en: "Embeds and modals via Chat SDK.",
        ja: "Chat SDK 経由の Embed とモーダル。",
      }),
      preview: [
        "┌─ Embed ───────────────────┐",
        "│ Refund request #4821      │",
        "│ [Approve]  [Deny]         │",
        "└───────────────────────────┘",
      ],
    },
    {
      title: t({ en: "Web inbox", ja: "Web inbox" }),
      description: t({
        en: "Built into hitl — resolve via hitl.inbox or your own UI.",
        ja: "hitl に内蔵 — hitl.inbox または独自 UI で解決。",
      }),
      preview: [
        "pending · 3 requests",
        "├─ Expense $1,200",
        "├─ Deploy v2.4",
        "└─ Refund #4821",
      ],
    },
  ];

  return (
    <Section>
      <SectionContainer size="6xl">
        <SectionHeader>
          <SectionTitle>
            {t({ en: "Deliver approvals anywhere", ja: "どこでも承認を届ける" })}
          </SectionTitle>
          <SectionDescription>
            {/* Vercel's chat sdk handle rest of the work. */}
            {t({
              en: "One adapter covers every Chat SDK platform. Or use the built-in web inbox.",
              ja: "1つのアダプターで Chat SDK の全プラットフォームに対応。Web inbox も内蔵。",
            })}
          </SectionDescription>
        </SectionHeader>

        <div className="mt-16 grid gap-4 sm:grid-cols-2">
          {channels.map(({ title, description, preview }) => (
            <div
              key={title}
              className="parallel-card group overflow-hidden transition-colors hover:border-foreground/20"
            >
              <div className="border-b border-border bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-400 dark:bg-black/40">
                {preview.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
              <div className="p-5">
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
