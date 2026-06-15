"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";
import type { ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const installPillClassName =
  "flex w-fit max-w-full items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-2 shadow-md backdrop-blur-md";

export function InstallCommandPill({
  install,
  className,
  prefix,
}: {
  install: string;
  className?: string;
  prefix?: ReactNode;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    await navigator.clipboard.writeText(install);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn(installPillClassName, className)}>
      {prefix}
      <code className="min-w-0 truncate font-mono text-[10px] text-foreground">
        {install}
      </code>
      <Button
        variant="ghost"
        size="icon"
        className="h-4 w-4 shrink-0 rounded-sm text-muted-foreground hover:text-foreground [&_svg]:size-3"
        onClick={copy}
        aria-label={`Copy ${install}`}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

export function StackInstallRow({
  name,
  Logo,
  install,
  className,
}: {
  name: string;
  Logo: ComponentType<{ className?: string }>;
  install: string;
  className?: string;
}) {
  return (
    <InstallCommandPill
      install={install}
      className={className}
      prefix={
        <div
          className="flex shrink-0 items-center justify-center"
          title={name}
          aria-label={name}
        >
          <Logo className="h-4 w-4" />
        </div>
      }
    />
  );
}
