import type { ComponentType } from "react";
import {
  ClaudeLogo,
  CursorLogo,
  GeminiLogo,
  OpenAILogo,
  OpenCodeLogo,
} from "@/components/ui/icons/ai-provider-logos";
import { snippets } from "@/lib/snippets";

export type GetStartedAgent = {
  id: string;
  label: string;
  Logo?: ComponentType<{ className?: string }>;
  buildCommand: (siteUrl: string) => string;
};

function onboardGuideCommand(cli: string, siteUrl: string): string {
  return `${cli} "Follow this guide: ${siteUrl}/onboard.md"`;
}

export const getStartedInstall = snippets.install;

export const getStartedAgents: GetStartedAgent[] = [
  {
    id: "claude",
    label: "Claude",
    Logo: ClaudeLogo,
    buildCommand: (siteUrl) => onboardGuideCommand("claude", siteUrl),
  },
  {
    id: "codex",
    label: "Codex",
    Logo: OpenAILogo,
    buildCommand: (siteUrl) => onboardGuideCommand("codex", siteUrl),
  },
  {
    id: "opencode",
    label: "OpenCode",
    Logo: OpenCodeLogo,
    buildCommand: (siteUrl) =>
      onboardGuideCommand("opencode run", siteUrl),
  },
  {
    id: "cursor",
    label: "Cursor",
    Logo: CursorLogo,
    buildCommand: (siteUrl) =>
      onboardGuideCommand("cursor-agent", siteUrl),
  },
  {
    id: "gemini",
    label: "Gemini",
    Logo: GeminiLogo,
    buildCommand: (siteUrl) =>
      onboardGuideCommand("gemini -p", siteUrl),
  },
];

export const defaultGetStartedAgentId = getStartedAgents[0]?.id ?? "claude";
