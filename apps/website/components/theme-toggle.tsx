"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme } = useTheme();
  const t = useInlineTranslation();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Button variant="ghost" size="icon" aria-hidden className="opacity-0" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t({ en: "Toggle theme", ja: "テーマを切り替え" })}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          {t({ en: "Light", ja: "ライト" })}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          {t({ en: "Dark", ja: "ダーク" })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
