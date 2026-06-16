"use client";

import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useInlineTranslation } from "@/i18n/use-inline-translation";
import { type DocNavItem } from "@/lib/docs";
import { cn } from "@/lib/utils";

type DocsSidebarProps = {
  nav: DocNavItem[];
  titles: Record<string, string>;
};

function NavLink({
  slug,
  titles,
}: {
  slug: string;
  titles: Record<string, string>;
}) {
  const pathname = usePathname();
  const href = `/docs/${slug}`;
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
        active && "bg-accent font-medium",
      )}
    >
      {titles[slug] ?? slug}
    </Link>
  );
}

export function DocsSidebar({ nav, titles }: DocsSidebarProps) {
  const t = useInlineTranslation();

  return (
    <nav className="space-y-6">
      <p className="text-sm font-semibold">
        {t({ en: "Documentation", ja: "ドキュメント" })}
      </p>
      {nav.map((item, index) => {
        if ("pages" in item) {
          return (
            <div key={item.group?.en ?? `group-${index}`} className="space-y-1">
              {item.group ? (
                <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t(item.group)}
                </p>
              ) : null}
              {item.pages.map((page) => (
                <NavLink key={page.slug} slug={page.slug} titles={titles} />
              ))}
            </div>
          );
        }

        return <NavLink key={item.slug} slug={item.slug} titles={titles} />;
      })}
    </nav>
  );
}
