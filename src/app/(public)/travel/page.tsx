import { resolveBuiltInPage } from '@/lib/page-routing';
import { TravelContent } from '@/components/public/page-content/TravelContent';

export const dynamic = 'force-dynamic';

export default async function TravelPage() {
  const page = await resolveBuiltInPage('travel');
  return <TravelContent pageRow={page} />;
}
