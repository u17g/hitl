import { Github, Package } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const t = await getTranslations("nav");

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
              H
            </span>
            Hitl SDK
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-muted-foreground md:flex">
            <Link href="/docs/getting-started" className="transition-colors hover:text-foreground">
              {t("docs")}
            </Link>
            <a
              href="https://github.com/hitldev/hitldev"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              {t("github")}
            </a>
            <a
              href="https://www.npmjs.com/package/hitl"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              {t("npm")}
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="hidden sm:inline-flex" asChild>
            <a
              href="https://www.npmjs.com/package/hitl"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Package className="h-3.5 w-3.5" />
              npm
            </a>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <a
              href="https://github.com/hitldev/hitldev"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <Github className="h-4 w-4" />
            </a>
          </Button>
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
