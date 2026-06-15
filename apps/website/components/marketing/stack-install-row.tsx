"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";
import type { ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const installPillBaseClassName =
  "flex w-fit max-w-full items-center rounded-full border border-border bg-background/80 shadow-md backdrop-blur-md";

const installPillSizeClassName = {
  default: {
    pill: "gap-2 px-3 py-2",
    code: "text-[10px]",
    button: "h-4 w-4 [&_svg]:size-3",
  },
  lg: {
    pill: "gap-2.5 px-4 py-2.5",
    code: "text-xs",
    button: "h-5 w-5 [&_svg]:size-3.5",
  },
} as const;

export function InstallCommandPill({
  install,
  className,
  prefix,
  size = "default",
}: {
  install: string;
  className?: string;
  prefix?: ReactNode;
  size?: keyof typeof installPillSizeClassName;
}) {
  const [copied, setCopied] = React.useState(false);
  const styles = installPillSizeClassName[size];

  async function copy() {
    await navigator.clipboard.writeText(install);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        installPillBaseClassName,
        styles.pill,
        className,
      )}
    >
      {prefix}
      <code
        className={cn(
          "min-w-0 truncate font-mono text-foreground",
          styles.code,
        )}
      >
        {install}
      </code>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "shrink-0 rounded-sm text-muted-foreground hover:text-foreground",
          styles.button,
        )}
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
