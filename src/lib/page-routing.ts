import { permanentRedirect, notFound } from 'next/navigation';
import prisma from './prisma';

// Built-in pages registered with the routing system. Every entry here gets a
// Page row created on first lookup so the admin can edit its title and (where
// rename=true) its URL slug.
//
// rename=true means the page is wired into the public catch-all and supports
// having its URL changed by the admin. Adding a new built-in to the rename
// set means: (1) flip rename:true, (2) extract its body into a Content
// component, (3) add it to the dispatch map in (public)/[slug]/page.tsx.
export interface BuiltInDef {
  canonicalRoute: string;
  defaultTitle: string;
  rename: boolean;
}

export const BUILT_IN_PAGES: BuiltInDef[] = [
  { canonicalRoute: 'home', defaultTitle: 'Home', rename: false },
  { canonicalRoute: 'our-story', defaultTitle: 'Our Story', rename: true },
  { canonicalRoute: 'details', defaultTitle: 'Wedding Details', rename: true },
  { canonicalRoute: 'travel', defaultTitle: 'Travel & Lodging', rename: true },
  { canonicalRoute: 'faq', defaultTitle: 'FAQ', rename: true },
  { canonicalRoute: 'wedding-party', defaultTitle: 'Wedding Party', rename: false },
  { canonicalRoute: 'registry', defaultTitle: 'Registry', rename: false },
  { canonicalRoute: 'rsvp', defaultTitle: 'RSVP', rename: false },
  { canonicalRoute: 'guestbook', defaultTitle: 'Guest Book', rename: false },
  { canonicalRoute: 'seating', defaultTitle: 'Seating', rename: false },
  { canonicalRoute: 'transportation', defaultTitle: 'Transportation', rename: false },
  { canonicalRoute: 'trivia', defaultTitle: 'Trivia', rename: false },
];

const BUILT_IN_BY_ROUTE = new Map(BUILT_IN_PAGES.map((p) => [p.canonicalRoute, p]));

export type PageRecord = {
  id: string;
  slug: string;
  title: string;
  content: string;
  canonicalRoute: string | null;
  bodyHtml: string | null;
  visible: boolean;
};

// Idempotent: ensures a Page row exists for the given built-in route. Returns
// the (possibly newly-created) row. Used by both the public-page handlers and
// the admin Pages screen.
export async function ensureBuiltInPage(canonicalRoute: string): Promise<PageRecord> {
  const def = BUILT_IN_BY_ROUTE.get(canonicalRoute);
  if (!def) throw new Error(`Unknown built-in route: ${canonicalRoute}`);

  // Prefer an existing row keyed by canonicalRoute. Fall back to slug for
  // pre-existing rows from before canonicalRoute existed (Our Story / Details
  // pages that were already in the DB).
  let row = await prisma.page.findFirst({ where: { canonicalRoute } });
  if (!row) {
    row = await prisma.page.findUnique({ where: { slug: canonicalRoute } });
    if (row) {
      row = await prisma.page.update({
        where: { id: row.id },
        data: { canonicalRoute },
      });
    }
  }
  if (!row) {
    row = await prisma.page.create({
      data: {
        slug: canonicalRoute,
        title: def.defaultTitle,
        content: '',
        canonicalRoute,
      },
    });
  }
  return row as PageRecord;
}

// Called at the top of every built-in public page. Ensures the Page row
// exists, redirects to the new slug if the admin renamed the page, and
// 404s if the page has been hidden.
export async function resolveBuiltInPage(canonicalRoute: string): Promise<PageRecord> {
  const page = await ensureBuiltInPage(canonicalRoute);
  if (!page.visible) notFound();
  if (page.slug !== canonicalRoute) permanentRedirect(`/${page.slug}`);
  return page;
}

// Used by the catch-all [slug] route to find the page for a given URL.
// Returns null when the slug doesn't match any page.
export async function findPageBySlug(slug: string): Promise<PageRecord | null> {
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) return null;
  return page as PageRecord;
}

// Validate a candidate slug. Returns null if valid, otherwise an error message.
export function validateSlug(slug: string): string | null {
  if (!slug) return 'Slug is required';
  if (!/^[a-z0-9-]+$/.test(slug)) return 'Use lowercase letters, numbers, and dashes only';
  if (slug.startsWith('-') || slug.endsWith('-')) return 'Slug must not start or end with a dash';
  // Reserved top-level paths — these are handled by Next.js routes that aren't
  // pages, or by middleware. Keep them off-limits to avoid collisions.
  const reserved = ['api', 'admin', '_next', 'public', '_custom', 'assets', 'favicon.ico', 'uploads', 'wall'];
  if (reserved.includes(slug)) return `"${slug}" is a reserved path`;
  return null;
}
