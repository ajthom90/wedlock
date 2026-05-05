import { resolveBuiltInPage } from '@/lib/page-routing';
import { FaqContent } from '@/components/public/page-content/FaqContent';

export const dynamic = 'force-dynamic';

export default async function FaqPage() {
  const page = await resolveBuiltInPage('faq');
  return <FaqContent pageRow={page} />;
}
