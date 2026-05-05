import { resolveBuiltInPage } from '@/lib/page-routing';
import { DetailsContent } from '@/components/public/page-content/DetailsContent';

export const dynamic = 'force-dynamic';

export default async function DetailsPage() {
  const page = await resolveBuiltInPage('details');
  return <DetailsContent pageRow={page} />;
}
