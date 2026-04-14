import { WallUploadForm } from '@/components/public/WallUploadForm';
import { getSiteSettings, getFeatures } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Minimal-chrome upload page reached via QR code. Deliberately simple —
// guests are at a wedding, not trying to parse a UI.
export default async function WallUploadPage() {
  const [settings, features] = await Promise.all([getSiteSettings(), getFeatures()]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <h1 className="text-3xl font-heading text-center text-primary mb-2">
            Add to the Photo Wall
          </h1>
          <p className="text-center text-foreground/70 mb-6 text-sm">
            {settings.coupleName1 && settings.coupleName2
              ? `Share a moment from ${settings.coupleName1} & ${settings.coupleName2}'s wedding — it'll appear on the big screen.`
              : "Share a moment from the wedding — it'll appear on the big screen."}
          </p>
          {features.guestPhotoUpload ? (
            <WallUploadForm />
          ) : (
            <p className="text-center text-foreground/60 py-8">
              Photo uploads are not currently enabled.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
