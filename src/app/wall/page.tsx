import { notFound } from 'next/navigation';
import { WallGallery } from '@/components/public/WallGallery';
import { getFeatures } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Full-screen live-updating photo wall, intended to run on a TV/projector at
// the reception. No layout chrome, no footer — the screen is a gallery.
export default async function WallPage() {
  const features = await getFeatures();
  if (!features.photoWall) notFound();
  return (
    <div className="fixed inset-0 bg-black">
      <WallGallery />
    </div>
  );
}
