import { WallGallery } from '@/components/public/WallGallery';

export const dynamic = 'force-dynamic';

// Full-screen live-updating photo wall, intended to run on a TV/projector at
// the reception. No layout chrome, no footer — the screen is a gallery.
export default function WallPage() {
  return (
    <div className="fixed inset-0 bg-black">
      <WallGallery />
    </div>
  );
}
