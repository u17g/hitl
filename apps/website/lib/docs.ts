import { getPathname } from "@/i18n/navigation";
import { type Locale } from "@/i18n/routing";

export type DocSlug = string;

export function docHref(locale: Locale, slug: string) {
  return getPathname({ locale, href: `/docs/${slug}` });
}

export {
  flattenNavPagesWithKeys,
  getAdjacentDocs,
  getDocsNav,
  getDocTitle,
  getFlatDocPages,
  navPageKey,
  resolveNavPageTitle,
  type DocNavGroup,
  type DocNavItem,
  type DocNavPage,
} from "@/lib/docs-nav";
