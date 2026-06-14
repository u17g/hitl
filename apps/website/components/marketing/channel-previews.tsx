import type { ReactNode } from "react";
import {
  DiscordLogo,
  MicrosoftTeamsLogo,
  SlackLogo,
} from "@/components/ui/icons/chat-sdk-logos";
import { cn } from "@/lib/utils";

function WindowChrome({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="flex h-56 min-h-[224px] select-none flex-col bg-zinc-200/70 p-4 dark:bg-zinc-900/60"
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-black/10 shadow-lg shadow-black/20 dark:border-white/10 dark:shadow-black/40",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function BotAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white">
      H
    </div>
  );
}

function ChannelHeader({
  logo,
  label,
}: {
  logo: ReactNode;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2">
      {logo}
      <span className="font-mono text-xs text-zinc-300">{label}</span>
    </div>
  );
}

export function SlackPreview() {
  return (
    <WindowChrome>
      <div className="flex min-h-0 flex-1 flex-col bg-[#1a1d21]">
        <ChannelHeader
          logo={<SlackLogo className="h-4 w-4" />}
          label="#marketing"
        />
        <div className="flex flex-1 gap-2.5 overflow-hidden p-4">
          <BotAvatar />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-xs font-semibold text-zinc-200">
              hitl-bot
            </div>
            <div className="py-1 text-sm text-zinc-200">
              Should I research competitor pricing for the Q3 launch?
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded bg-[#007a5a] px-3 py-1 text-xs font-medium text-white">
                Research
              </span>
              <span className="rounded border border-white/20 px-3 py-1 text-xs text-zinc-300">
                Replan
              </span>
              <span className="rounded border border-white/20 px-3 py-1 text-xs text-zinc-300">
                Cancel
              </span>
            </div>
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

export function TeamsPreview() {
  return (
    <WindowChrome>
      <div className="flex min-h-0 flex-1 flex-col bg-[#201f1f]">
        <ChannelHeader
          logo={<MicrosoftTeamsLogo className="h-4 w-4" />}
          label="general"
        />
        <div className="flex flex-1 items-start overflow-hidden p-4">
          <div className="w-full rounded-lg bg-white p-3 shadow-md">
            <div className="text-sm font-semibold text-zinc-900">
              Approve this AI-drafted campaign brief?
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Q3 launch — positioning, channels, and KPI targets included
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded bg-[#6264A7] px-3 py-1 text-xs font-medium text-white">
                Approve
              </span>
              <span className="rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-700">
                Edit draft
              </span>
            </div>
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

export function DiscordPreview() {
  return (
    <WindowChrome>
      <div className="flex min-h-0 flex-1 flex-col bg-[#313338]">
        <ChannelHeader
          logo={<DiscordLogo className="h-4 w-4" />}
          label="#announcements"
        />
        <div className="flex flex-1 gap-2.5 overflow-hidden p-4">
          <BotAvatar />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-xs font-semibold text-zinc-200">
              hitl-bot
            </div>
            <div className="mt-1 border-l-4 border-[#5865F2] bg-[#2b2d31] px-3 py-2">
              <div className="text-xs font-semibold text-zinc-100">
                Launch post draft — Product Hunt
              </div>
              <div className="mt-0.5 text-xs text-zinc-400">
                AI wrote announcement copy from v2.4 release notes
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded bg-[#5865F2] px-3 py-1 text-xs font-medium text-white">
                Approve
              </span>
              <span className="rounded border border-white/20 px-3 py-1 text-xs text-zinc-300">
                Edit
              </span>
            </div>
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

const PENDING_ITEMS = [
  "Competitor research",
  "Campaign brief Q3",
  "Launch post draft",
] as const;

export function CustomWebUiPreview() {
  return (
    <WindowChrome>
      <div className="flex min-h-0 flex-1 flex-col bg-zinc-50">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-2">
          <span className="text-sm font-semibold text-zinc-900">Approvals</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
            3 pending
          </span>
        </div>
        <div className="flex-1 overflow-hidden p-3">
          <ul className="space-y-2">
            {PENDING_ITEMS.map((item) => (
              <li
                key={item}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2"
              >
                <span className="truncate text-xs text-zinc-700">{item}</span>
                <div className="flex shrink-0 gap-1.5">
                  <span className="rounded-md bg-[#15803d] px-2 py-0.5 text-[10px] font-semibold text-white">
                    Approve
                  </span>
                  <span className="rounded-md border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                    Deny
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </WindowChrome>
  );
}
