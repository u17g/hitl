"use client";

import type { ComponentType } from "react";
import {
  DiscordLogo,
  GitHubChatLogo,
  GoogleChatLogo,
  LinearLogo,
  MessengerLogo,
  MicrosoftTeamsLogo,
  SlackLogo,
  TelegramLogo,
  WebChatLogo,
  WhatsAppLogo,
} from "@/components/ui/icons/chat-sdk-logos";
import { InstallCommandPill } from "@/components/marketing/stack-install-row";
import { cn } from "@/lib/utils";

type Platform = {
  name: string;
  Logo: ComponentType<{ className?: string }>;
};

const rows: Platform[][] = [
  [
    { name: "WhatsApp", Logo: WhatsAppLogo },
    { name: "Discord", Logo: DiscordLogo },
    { name: "Telegram", Logo: TelegramLogo },
  ],
  [
    { name: "Linear", Logo: LinearLogo },
    { name: "Microsoft Teams", Logo: MicrosoftTeamsLogo },
    { name: "Slack", Logo: SlackLogo },
    { name: "Google Chat", Logo: GoogleChatLogo },
  ],
  [
    { name: "Messenger", Logo: MessengerLogo },
    { name: "Web", Logo: WebChatLogo },
    { name: "GitHub", Logo: GitHubChatLogo },
  ],
];

const ICON_GRID_MASK =
  "radial-gradient(ellipse 80% 50% at 50% 50%, black 18%, transparent 80%)";

function ChatPlatformIcon({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  const { name, Logo } = platform;

  return (
    <div
      className={cn(
        "relative flex h-18 w-18 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-full border border-border bg-background shadow-sm",
        className,
      )}
      title={name}
    >
      <Logo className="h-8 w-8 sm:h-10 sm:w-10" />
    </div>
  );
}

function InstallOverlay({ install }: { install: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
      <InstallCommandPill
        install={install}
        className="pointer-events-auto max-w-[92%] translate-y-5"
      />
    </div>
  );
}

export function ChatPlatformFadeStrip({
  install,
  className,
}: {
  install: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto flex min-h-36 w-full max-w-60 items-center justify-center py-2 sm:min-h-40 sm:max-w-72",
        className,
      )}
    >
      <div
        className="relative z-0 flex flex-col items-center [&>*+*]:-mt-4 sm:[&>*+*]:-mt-4"
        style={{
          WebkitMaskImage: ICON_GRID_MASK,
          maskImage: ICON_GRID_MASK,
        }}
      >
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center">
            {row.map((platform, colIndex) => (
              <ChatPlatformIcon
                key={`${platform.name}-${rowIndex}-${colIndex}`}
                platform={platform}
                className={colIndex > 0 ? "-ml-4 sm:-ml-4" : undefined}
              />
            ))}
          </div>
        ))}
      </div>

      <InstallOverlay install={install} />
    </div>
  );
}

export { WebChatLogo as ChatSdkLogo };
