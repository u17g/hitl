"use client";

import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

const installPillBaseClassName =
  "install-pill-inner flex w-fit max-w-full items-center";

const installPillSizeClassName = {
  default: {
    pill: "gap-2 px-3 py-2",
    code: "text-[10px]",
    button: "h-4 w-4 [&_svg]:size-3",
  },
  lg: {
    pill: "gap-2.5 px-4 py-2",
    code: "text-xs",
    button: "h-4 w-4 [&_svg]:size-3.5",
  },
} as const;

const swapEase = [0.22, 1, 0.36, 1] as const;

const contentTransition = {
  duration: 0.32,
  ease: swapEase,
};

const layoutTransition = {
  layout: {
    duration: 0.32,
    ease: swapEase,
  },
};

export function InstallPillSwapContent({
  swapKey,
  reducedMotion = false,
  className,
  children,
}: {
  swapKey: string;
  reducedMotion?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const animate = !reducedMotion;

  return (
    <span className={cn("relative inline-flex", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={swapKey}
          initial={animate ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          exit={animate ? { opacity: 0, y: -6 } : undefined}
          transition={contentTransition}
          className="inline-flex"
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function InstallCommandPill({
  install,
  className,
  prefix,
  size = "default",
  swapKey,
  animateSwap = false,
  reducedMotion = false,
}: {
  install: string;
  className?: string;
  prefix?: ReactNode;
  size?: keyof typeof installPillSizeClassName;
  swapKey?: string;
  animateSwap?: boolean;
  reducedMotion?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const styles = installPillSizeClassName[size];
  const layoutEnabled = animateSwap && !reducedMotion;

  async function copy() {
    await navigator.clipboard.writeText(install);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void copy();
    }
  }

  const code = (
    <code
      className={cn(
        "block font-mono text-foreground",
        animateSwap ? "whitespace-nowrap" : "min-w-0 truncate",
        styles.code,
      )}
    >
      {install}
    </code>
  );

  return (
    <motion.div
      layout={layoutEnabled ? "size" : false}
      transition={layoutTransition}
      className={cn("install-pill-shell w-fit max-w-full", className)}
    >
      <motion.div
        layout={layoutEnabled ? "size" : false}
        transition={layoutTransition}
        role="button"
        tabIndex={0}
        aria-label={`Copy ${install}`}
        onClick={() => void copy()}
        onKeyDown={handleKeyDown}
        className={cn(installPillBaseClassName, styles.pill, "cursor-pointer")}
      >
        {prefix ? (
          <span
            className="shrink-0"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {prefix}
          </span>
        ) : null}
        {animateSwap && swapKey ? (
          <span className="relative min-w-0 flex-1">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={swapKey}
                layout={layoutEnabled ? "size" : false}
                initial={layoutEnabled ? { opacity: 0, y: 6 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={layoutEnabled ? { opacity: 0, y: -6 } : undefined}
                transition={contentTransition}
                className="block whitespace-nowrap"
              >
                {code}
              </motion.span>
            </AnimatePresence>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate">{code}</span>
        )}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none shrink-0 text-muted-foreground",
            styles.button,
            "inline-flex items-center justify-center [&_svg]:size-[inherit]",
          )}
        >
          {copied ? <Check /> : <Copy />}
        </span>
      </motion.div>
    </motion.div>
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
