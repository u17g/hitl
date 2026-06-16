"use client";

import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { GitHubIcon } from "@/components/ui/icons/github";
import { Link, usePathname } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const t = useInlineTranslation();
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <header
      className={cn(
        "sticky top-0 z-50 bg-background",
        isHome && "border-b border-border",
      )}
    >
      <div
        className={cn(
          "mx-auto flex h-16 max-w-6xl items-center justify-between px-6 md:px-8",
          isHome && "border-x border-border",
        )}
      >
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-lg font-mono tracking-tight"
          >
            HITL sdk<span className="ml-2 text-brand text-xs bg-brand/10 px-1 py-0.5">Beta</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground md:gap-6">
            <Link
              href="/docs/overview"
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              {t({ en: "Docs", ja: "ドキュメント" })}
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" asChild>
            <a
              href="https://github.com/u17g/hitl"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <GitHubIcon />
            </a>
          </Button>
        </div>
      </div>
    </header >
  );
}
