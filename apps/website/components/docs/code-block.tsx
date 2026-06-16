"use client";

import { Check, Copy } from "lucide-react";
import type { BundledLanguage } from "shiki";
import * as React from "react";
import { SyntaxHighlight } from "@/components/syntax-highlight";
import { Button } from "@/components/ui/button";
import { inferLang } from "@/lib/shiki";
import { cn } from "@/lib/utils";

export function CodeBlock({
  code,
  className,
  filename,
  lang,
}: {
  code: string;
  className?: string;
  filename?: string;
  lang?: BundledLanguage;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden border border-border bg-zinc-950 text-zinc-300 dark:bg-black/50",
        className,
      )}
    >
      {filename ? (
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-zinc-400">
          <span>{filename}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-400 hover:text-zinc-50"
            onClick={copy}
            aria-label="Copy code"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10 h-7 w-7 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-zinc-50"
          onClick={copy}
          aria-label="Copy code"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
      <div className="overflow-x-auto p-4 text-sm leading-relaxed">
        <SyntaxHighlight
          code={code}
          lang={lang ?? inferLang(filename)}
          className="leading-relaxed"
        />
      </div>
    </div>
  );
}
