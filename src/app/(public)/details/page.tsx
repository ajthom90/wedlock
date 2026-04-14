import { getSiteSettings } from '@/lib/settings';
import prisma from '@/lib/prisma';
import { formatDate, formatTime } from '@/lib/utils';
import { VenueMap } from '@/components/public/VenueMap';

export const dynamic = 'force-dynamic';

export default async function DetailsPage() {
  const settings = await getSiteSettings();
  const page = await prisma.page.findUnique({ where: { slug: 'details' } });
  let content: any = null;
  if (page?.content) {
    try {
      content = JSON.parse(page.content);
    } catch {
      content = null;
    }
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">
        Wedding Details
      </h1>
      <div className="max-w-3xl mx-auto space-y-12">
        <section className="text-center">
          <h2 className="text-2xl font-heading font-semibold mb-4">The Ceremony</h2>
          {settings.weddingDate && (
            <p className="text-lg mb-2">
              {formatDate(settings.weddingDate)}
              {settings.weddingTime && ` at ${formatTime(settings.weddingTime)}`}
            </p>
          )}
          {settings.venueName && (
            <p className="text-foreground/70">
              {settings.venueName}
              {settings.venueAddress && (
                <>
                  <br />
                  {settings.venueAddress}
                </>
              )}
            </p>
          )}
        </section>
        {settings.mapUrl && (
          <section className="text-center">
            <h2 className="text-2xl font-heading font-semibold mb-4">Venue Map</h2>
            <div className="max-w-2xl mx-auto">
              <VenueMap mapUrl={settings.mapUrl} title="Venue location map" />
            </div>
          </section>
        )}
        {content?.schedule && (
          <section className="text-center">
            <h2 className="text-2xl font-heading font-semibold mb-4">Schedule</h2>
            <div className="text-foreground/80 whitespace-pre-line">{content.schedule}</div>
          </section>
        )}
        {content?.dressCode && (
          <section className="text-center">
            <h2 className="text-2xl font-heading font-semibold mb-4">Dress Code</h2>
            <p className="text-foreground/80">{content.dressCode}</p>
          </section>
        )}
        {!settings.weddingDate && !content && (
          <div className="text-center text-foreground/60 py-8">
            <p>Wedding details coming soon!</p>
            <p className="text-sm mt-2">Check back later for ceremony information.</p>
          </div>
        )}
      </div>
    </div>
  );
}
