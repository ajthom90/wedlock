import { resolveBuiltInPage } from '@/lib/page-routing';
import { OurStoryContent } from '@/components/public/page-content/OurStoryContent';

export const dynamic = 'force-dynamic';

export default async function OurStoryPage() {
  const page = await resolveBuiltInPage('our-story');
  return <OurStoryContent pageRow={page} />;
}
