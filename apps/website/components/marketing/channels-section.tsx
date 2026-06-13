"use client";

import { Inbox, MessageSquare } from "lucide-react";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ChannelsSection() {
  const t = useInlineTranslation();

  const channels = [
    {
      icon: MessageSquare,
      title: t({ en: "Slack", ja: "Slack" }),
      description: t({
        en: "Block Kit cards with Approve/Deny and editable modals.",
        ja: "Block Kit カードと Approve/Deny、編集可能なモーダル。",
      }),
    },
    {
      icon: MessageSquare,
      title: t({ en: "Microsoft Teams", ja: "Microsoft Teams" }),
      description: t({
        en: "Adaptive Cards with native interactivity.",
        ja: "Adaptive Cards とネイティブなインタラクティブ操作。",
      }),
    },
    {
      icon: MessageSquare,
      title: t({ en: "Discord", ja: "Discord" }),
      description: t({
        en: "Embeds and modals via Chat SDK.",
        ja: "Chat SDK 経由の Embed とモーダル。",
      }),
    },
    {
      icon: Inbox,
      title: t({ en: "Web inbox", ja: "Web inbox" }),
      description: t({
        en: "Built into hitl — resolve via hitl.inbox or your own UI.",
        ja: "hitl に内蔵 — hitl.inbox または独自 UI で解決。",
      }),
    },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t({ en: "Deliver approvals anywhere", ja: "どこでも承認を届ける" })}
        </h2>
        <p className="mt-4 text-muted-foreground">
          {t({
            en: "One adapter covers every Chat SDK platform. Or use the built-in web inbox.",
            ja: "1つのアダプターで Chat SDK の全プラットフォームに対応。Web inbox も内蔵。",
          })}
        </p>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {channels.map(({ icon: Icon, title, description }) => (
          <Card key={title} className="transition-colors hover:bg-muted/50">
            <CardHeader>
              <Icon className="mb-2 h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
