"use client";

import type { ReactNode } from "react";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import {
  DiscordLogo,
  GitHubChatLogo,
  GoogleChatLogo,
  LinearLogo,
  MessengerLogo,
  MicrosoftTeamsLogo,
  SlackLogo,
  TelegramLogo,
  TwilioLogo,
  WebChatLogo,
  WhatsAppLogo,
} from "@/components/ui/icons/chat-sdk-logos";
import {
  InngestLogo,
  PostgreSQLLogo,
  RedisLogo,
  SQLiteLogo,
  TemporalLogo,
  WorkflowDevKitLogo,
} from "@/components/ui/icons/integration-logos";

function LogoRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-6 text-center font-mono text-md tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
        {children}
      </div>
    </div>
  );
}

function LogoItem({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <div
      className="opacity-100 transition-opacity hover:opacity-70"
      title={name}
      aria-label={name}
    >
      {children}
    </div>
  );
}

export function LogoStrip() {
  const t = useInlineTranslation();

  const chatChannels = [
    { name: "Slack", Logo: SlackLogo },
    { name: "Microsoft Teams", Logo: MicrosoftTeamsLogo },
    { name: "Google Chat", Logo: GoogleChatLogo },
    { name: "Discord", Logo: DiscordLogo },
    { name: "GitHub", Logo: GitHubChatLogo },
    { name: "Linear", Logo: LinearLogo },
    { name: "Messenger", Logo: MessengerLogo },
    { name: "Telegram", Logo: TelegramLogo },
    { name: "Twilio", Logo: TwilioLogo },
    { name: "Web", Logo: WebChatLogo },
    { name: "WhatsApp", Logo: WhatsAppLogo },
  ] as const;

  const workflowEngines = [
    { name: "Vercel Workflow SDK", Logo: WorkflowDevKitLogo },
    { name: "Inngest", Logo: InngestLogo },
    { name: "Temporal", Logo: TemporalLogo },
  ] as const;

  const persistenceStores = [
    { name: "PostgreSQL", Logo: PostgreSQLLogo },
    { name: "SQLite", Logo: SQLiteLogo },
    { name: "Redis", Logo: RedisLogo },
  ] as const;

  return (
    <section className="border-b border-border py-12 md:py-16">
      <div className="flex flex-col gap-12 px-6 md:px-8">
        <LogoRow
          label={t({
            en: "The Chat Platform Agnostic",
            ja: "あらゆるチャットプラットフォームに対応",
          })}
        >
          {chatChannels.map(({ name, Logo }) => (
            <LogoItem key={name} name={name}>
              <Logo />
            </LogoItem>
          ))}
        </LogoRow>

        <LogoRow
          label={t({
            en: "The Workflow Engine Agnostic",
            ja: "あらゆるワークフローエンジンに対応",
          })}
        >
          {workflowEngines.map(({ name, Logo }) => (
            <LogoItem key={name} name={name}>
              <Logo />
            </LogoItem>
          ))}
        </LogoRow>

        <LogoRow
          label={t({
            en: "The Persistence Agnostic",
            ja: "あらゆるデータベースに対応",
          })}
        >
          {persistenceStores.map(({ name, Logo }) => (
            <LogoItem key={name} name={name}>
              <Logo />
            </LogoItem>
          ))}
        </LogoRow>
      </div>
    </section>
  );
}
