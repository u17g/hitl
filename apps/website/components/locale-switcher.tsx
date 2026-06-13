"use client";

import { Languages } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { type Locale, routing } from "@/i18n/routing";
import { useLocale } from "@/i18n/use-inline-translation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const localeLabels: Record<Locale, string> = {
  en: "English",
  ja: "日本語",
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Language">
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {routing.locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => router.replace(pathname, { locale: loc })}
            className={locale === loc ? "bg-accent" : undefined}
          >
            {localeLabels[loc]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
