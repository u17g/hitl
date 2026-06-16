"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import {
  type InlineTranslations,
  useInlineTranslation,
} from "@/i18n/use-inline-translation";
import { type DocNavItem } from "@/lib/docs";
import { cn } from "@/lib/utils";

type DocsSidebarProps = {
  nav: DocNavItem[];
  titles: Record<string, string>;
};

function isNavGroup(item: DocNavItem): item is Extract<DocNavItem, { pages: unknown }> {
  return "pages" in item;
}

function containsActivePage(items: DocNavItem[], pathname: string): boolean {
  for (const item of items) {
    if (isNavGroup(item)) {
      if (containsActivePage(item.pages, pathname)) {
        return true;
      }
      continue;
    }

    const href = `/docs/${item.slug}`;
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      return true;
    }
  }

  return false;
}

function NavLink({
  slug,
  titles,
  depth,
}: {
  slug: string;
  titles: Record<string, string>;
  depth: number;
}) {
  const pathname = usePathname();
  const href = `/docs/${slug}`;
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "block rounded-md py-2 text-sm transition-colors hover:text-foreground/50",
        depth === 0 ? "px-3" : "px-3 pl-6",
        active && "text-brand!",
      )}
    >
      {titles[slug] ?? slug}
    </Link>
  );
}

function NavCollapsibleGroup({
  group,
  items,
  titles,
  depth,
}: {
  group: InlineTranslations;
  items: DocNavItem[];
  titles: Record<string, string>;
  depth: number;
}) {
  const t = useInlineTranslation();
  const pathname = usePathname();
  const containsActive = containsActivePage(items, pathname);
  const [open, setOpen] = useState(containsActive);

  useEffect(() => {
    if (containsActive) {
      setOpen(true);
    }
  }, [containsActive]);

  return (
    <div className={cn(depth === 0 ? "mt-1" : "space-y-1")}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-1 rounded-md py-1.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50",
          depth === 0 ? "px-3 pl-3" : "px-3 pl-3",
        )}
      >
        {t(group)}
        <ChevronRight
          className={cn(
            "h-3 w-3 ml-auto shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open ? (
        <div className="space-y-1">
          <NavSection items={items} titles={titles} depth={depth + 1} />
        </div>
      ) : null}
    </div>
  );
}

function NavSection({
  items,
  titles,
  depth,
}: {
  items: DocNavItem[];
  titles: Record<string, string>;
  depth: number;
}) {
  const t = useInlineTranslation();

  return (
    <>
      {items.map((item, index) => {
        if (isNavGroup(item)) {
          if (depth === 0 && item.group) {
            return (
              <NavCollapsibleGroup
                key={item.group.en ?? `group-${depth}-${index}`}
                group={item.group}
                items={item.pages}
                titles={titles}
                depth={depth}
              />
            );
          }

          return (
            <div
              key={item.group?.en ?? `group-${depth}-${index}`}
              className={cn(depth === 0 ? "mt-3 space-y-1" : "space-y-1")}
            >
              {item.group ? (
                <p
                  className={cn(
                    "px-3 font-medium text-muted-foreground",
                    depth === 0 && "pl-5",
                    depth > 0 && "pl-7",
                  )}
                >
                  {t(item.group)}
                </p>
              ) : null}
              <NavSection items={item.pages} titles={titles} depth={depth + 1} />
            </div>
          );
        }

        return (
          <NavLink
            key={item.slug}
            slug={item.slug}
            titles={titles}
            depth={depth}
          />
        );
      })}
    </>
  );
}

export function DocsSidebar({ nav, titles }: DocsSidebarProps) {
  const t = useInlineTranslation();

  return (
    <nav className="space-y-6">
      {nav.map((item, index) => {
        if (isNavGroup(item)) {
          return (
            <div
              key={item.group?.en ?? `group-${index}`}
              className="space-y-1"
            >
              {item.group ? (
                <p className="text-sm font-semibold tracking-wide text-muted-foreground">
                  {t(item.group)}
                </p>
              ) : null}
              <NavSection items={item.pages} titles={titles} depth={0} />
            </div>
          );
        }

        return (
          <NavLink key={item.slug} slug={item.slug} titles={titles} depth={0} />
        );
      })}
    </nav>
  );
}
