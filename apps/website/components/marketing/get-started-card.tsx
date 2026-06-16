"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import {
  InstallCommandPill,
  InstallPillSwapContent,
} from "@/components/marketing/stack-install-row";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  defaultGetStartedAgentId,
  getStartedAgents,
  getStartedInstall,
} from "@/lib/get-started";
import { cn } from "@/lib/utils";

const AGENT_ROTATION_INTERVAL_MS = 3000;

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (event: MediaQueryListEvent) =>
      setReducedMotion(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reducedMotion;
}

export function GetStartedCard({ className }: { className?: string }) {
  const t = useInlineTranslation();
  const siteUrl = "https://hitl-sdk.dev";
  const reducedMotion = useReducedMotion();
  const [selectedAgentId, setSelectedAgentId] = React.useState(
    defaultGetStartedAgentId,
  );
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  React.useEffect(() => {
    if (dropdownOpen || reducedMotion) return;

    const timer = window.setInterval(() => {
      setSelectedAgentId((currentId) => {
        const currentIndex = getStartedAgents.findIndex(
          (agent) => agent.id === currentId,
        );
        const nextIndex =
          (currentIndex + 1 + getStartedAgents.length) %
          getStartedAgents.length;
        return getStartedAgents[nextIndex]?.id ?? defaultGetStartedAgentId;
      });
    }, AGENT_ROTATION_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [dropdownOpen, reducedMotion]);

  const selectedAgent =
    getStartedAgents.find((agent) => agent.id === selectedAgentId) ??
    getStartedAgents[0];

  const agentCommand = selectedAgent?.buildCommand(siteUrl) ?? "";
  const AgentLogo = selectedAgent?.Logo;

  return (
    <div
      className={cn(
        "flex max-w-full flex-wrap items-center gap-x-2 gap-y-2",
        className,
      )}
    >
      <InstallCommandPill install={getStartedInstall} size="lg" />

      <span className="font-mono text-xs text-muted-foreground">
        {t({ en: "or", ja: "または" })}
      </span>

      <InstallCommandPill
        install={agentCommand}
        size="lg"
        swapKey={selectedAgentId}
        animateSwap
        reducedMotion={reducedMotion}
        prefix={
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex shrink-0 items-center gap-0.5 rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={t({ en: "Choose agent", ja: "エージェントを選択" })}
              >
                <InstallPillSwapContent
                  swapKey={selectedAgentId}
                  reducedMotion={reducedMotion}
                  className="inline-flex"
                >
                  {AgentLogo ? <AgentLogo className="h-3.5 w-3.5" /> : null}
                </InstallPillSwapContent>
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={selectedAgentId}
                onValueChange={setSelectedAgentId}
              >
                {getStartedAgents.map((agent) => {
                  const Logo = agent.Logo;

                  return (
                    <DropdownMenuRadioItem
                      key={agent.id}
                      value={agent.id}
                      className="font-mono text-xs"
                    >
                      <span className="flex items-center gap-2">
                        {Logo ? <Logo className="h-3.5 w-3.5" /> : null}
                        {agent.label}
                      </span>
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    </div>
  );
}
