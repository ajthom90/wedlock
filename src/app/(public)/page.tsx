import Link from 'next/link';
import { getSiteSettings } from '@/lib/settings';
import { formatDate, formatTime } from '@/lib/utils';
import { LiveCountdown } from '@/components/public/LiveCountdown';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const settings = await getSiteSettings();
  const coupleTitle = settings.coupleName1 && settings.coupleName2 ? `${settings.coupleName1} & ${settings.coupleName2}` : "We're Getting Married!";

  return (
    <div>
      <section className="py-20 md:py-32 text-center">
        <div className="container mx-auto px-4">
          <p className="text-accent uppercase tracking-widest mb-4 font-medium">We&apos;re Getting Married!</p>
          <h1 className="text-5xl md:text-7xl font-heading font-bold text-primary mb-6">{coupleTitle}</h1>
          {settings.weddingDate && (
            <p className="text-xl md:text-2xl text-foreground/80 mb-8">
              {formatDate(settings.weddingDate)}{settings.weddingTime && ` at ${formatTime(settings.weddingTime)}`}
            </p>
          )}
          {settings.venueName && (
            <p className="text-lg text-foreground/70 mb-12">{settings.venueName}{settings.venueAddress && (<><br />{settings.venueAddress}</>)}</p>
          )}
          <Link
            href="/rsvp"
            className="inline-block bg-primary text-white px-8 py-4 rounded-md text-lg font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            RSVP Now
          </Link>
        </div>
      </section>
      {settings.weddingDate && (
        <section className="py-16 bg-secondary/20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-heading mb-8">Counting Down</h2>
            <LiveCountdown weddingDate={settings.weddingDate} weddingTime={settings.weddingTime || undefined} />
          </div>
        </section>
      )}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[{ href: '/details', title: 'Event Details', description: 'Schedule, ceremony, and reception information' }, { href: '/travel', title: 'Travel & Stay', description: 'Accommodations and travel tips' }, { href: '/registry', title: 'Registry', description: 'Gift registries and well-wishes' }].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block p-6 border border-foreground/10 rounded-lg hover:border-primary/30 hover:shadow-md transition-all text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <h3 className="text-xl font-heading font-semibold mb-2">{link.title}</h3>
                <p className="text-foreground/70 text-sm">{link.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
