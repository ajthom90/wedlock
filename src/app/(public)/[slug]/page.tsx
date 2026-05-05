import { notFound } from 'next/navigation';
import { findPageBySlug } from '@/lib/page-routing';
import { OurStoryContent } from '@/components/public/page-content/OurStoryContent';
import { DetailsContent } from '@/components/public/page-content/DetailsContent';
import { TravelContent } from '@/components/public/page-content/TravelContent';
import { FaqContent } from '@/components/public/page-content/FaqContent';
import { CustomPageContent } from '@/components/public/page-content/CustomPageContent';

export const dynamic = 'force-dynamic';

// Catch-all for custom pages and built-ins that have been renamed via the
// admin Pages screen. Built-in static routes (/our-story, /details, etc.)
// take priority over this; only paths that don't match a static route reach
// here. Each rename-supporting built-in needs an entry in BUILTIN_DISPATCH.
const BUILTIN_DISPATCH = {
  'our-story': OurStoryContent,
  details: DetailsContent,
  travel: TravelContent,
  faq: FaqContent,
} as const;

export default async function PublicSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await findPageBySlug(slug);
  if (!page || !page.visible) notFound();

  if (page.canonicalRoute) {
    const Content = BUILTIN_DISPATCH[page.canonicalRoute as keyof typeof BUILTIN_DISPATCH];
    if (!Content) notFound();
    return <Content pageRow={page} />;
  }

  return <CustomPageContent pageRow={page} />;
}
