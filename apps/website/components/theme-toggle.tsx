"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Button } from "@/components/ui/button";

const THEME_CYCLE = ["system", "light", "dark"] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useInlineTranslation();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Button variant="ghost" size="icon" aria-hidden className="opacity-0" />;
  }

  const currentTheme = THEME_CYCLE.includes(theme as (typeof THEME_CYCLE)[number])
    ? (theme as (typeof THEME_CYCLE)[number])
    : "system";

  function cycleTheme() {
    const index = THEME_CYCLE.indexOf(currentTheme);
    const nextTheme = THEME_CYCLE[(index + 1) % THEME_CYCLE.length] ?? "system";
    setTheme(nextTheme);
  }

  const ariaLabel =
    currentTheme === "system"
      ? t({ en: "Theme: system", ja: "テーマ: システム" })
      : currentTheme === "light"
        ? t({ en: "Theme: light", ja: "テーマ: ライト" })
        : t({ en: "Theme: dark", ja: "テーマ: ダーク" });

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={ariaLabel}
      onClick={cycleTheme}
    >
      {currentTheme === "system" ? (
        <Monitor className="h-4 w-4" />
      ) : currentTheme === "light" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
