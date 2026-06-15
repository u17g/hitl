"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    await navigator.clipboard.writeText(install);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2",
        className,
      )}
    >
      <div
        className="flex shrink-0 items-center justify-center"
        title={name}
        aria-label={name}
      >
        <Logo className="h-5 w-5" />
      </div>
      <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
        {install}
      </code>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={copy}
        aria-label={`Copy ${install}`}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
