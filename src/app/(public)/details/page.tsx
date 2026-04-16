import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getSiteSettings } from '@/lib/settings';
import { formatDate, formatTime } from '@/lib/utils';
import { VenueMap } from '@/components/public/VenueMap';
import { EventsAccessForm } from '@/components/public/EventsAccessForm';
import { RichContent } from '@/components/public/RichContent';

export const dynamic = 'force-dynamic';

type EventRecord = Awaited<ReturnType<typeof prisma.event.findMany>>[number];

export default async function DetailsPage() {
  const cookieStore = await cookies();
  const rsvpCookie = cookieStore.get('rsvp_code');

  let hasValidCode = false;
  if (rsvpCookie?.value) {
    const invitation = await prisma.invitation.findUnique({ where: { code: rsvpCookie.value } });
    if (invitation) hasValidCode = true;
  }

  const [settings, page, events] = await Promise.all([
    getSiteSettings(),
    prisma.page.findUnique({ where: { slug: 'details' } }),
    prisma.event.findMany({
      where: hasValidCode ? undefined : { visibility: 'public' },
      orderBy: { order: 'asc' },
    }),
  ]);

  let dressCode = '';
  if (page?.content) {
    try {
      const parsed = JSON.parse(page.content);
      dressCode = parsed.dressCode || '';
    } catch {
      // Leave blank — legacy plain-text content has no dress code field.
    }
  }

  const isTimeline = settings.eventsDisplayStyle === 'timeline';
  const hasCeremonyHeader = Boolean(settings.weddingDate || settings.venueName);
  const hasAnything = hasCeremonyHeader || events.length > 0 || dressCode;

  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">
        Wedding Details
      </h1>
      <div className="max-w-4xl mx-auto space-y-12">
        {hasCeremonyHeader && (
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
        )}

        {settings.mapUrl && (
          <section className="text-center">
            <h2 className="text-2xl font-heading font-semibold mb-4">Venue Map</h2>
            <div className="max-w-2xl mx-auto">
              <VenueMap mapUrl={settings.mapUrl} title="Venue location map" />
            </div>
          </section>
        )}

        <section>
          <h2 className="text-2xl font-heading font-semibold mb-6 text-center">Schedule</h2>
          {!hasValidCode && <EventsAccessForm />}
          {events.length === 0 ? (
            <p className="text-center text-foreground/60 py-4">Schedule coming soon!</p>
          ) : isTimeline ? (
            <TimelineView events={events} />
          ) : (
            <ListView events={events} />
          )}
        </section>

        {dressCode && (
          <section className="text-center">
            <h2 className="text-2xl font-heading font-semibold mb-4">Dress Code</h2>
            <p className="text-foreground/80">{dressCode}</p>
          </section>
        )}

        {!hasAnything && (
          <div className="text-center text-foreground/60 py-8">
            <p>Wedding details coming soon!</p>
            <p className="text-sm mt-2">Check back later for ceremony information.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ListView({ events }: { events: EventRecord[] }) {
  return (
    <div className="space-y-8">
      {events.map((event) => (
        <article key={event.id} className="border border-foreground/10 rounded-lg overflow-hidden">
          <div className="p-6 md:p-8">
            <EventHeader event={event} />
            <EventMeta event={event} />
            {event.description && (
              <RichContent html={event.description} className="rich-content text-foreground/70 leading-relaxed" />
            )}
          </div>
          {event.mapUrl && (
            <div className="border-t border-foreground/10 p-0">
              <VenueMap mapUrl={event.mapUrl} title={`Map for ${event.name}`} />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function TimelineView({ events }: { events: EventRecord[] }) {
  return (
    <div className="relative">
      <div
        className="absolute left-4 md:left-6 top-3 bottom-3 w-0.5 bg-primary/20"
        aria-hidden="true"
      />
      <ol className="space-y-10">
        {events.map((event) => (
          <li key={event.id} className="relative pl-12 md:pl-16">
            <span
              className="absolute left-2 md:left-4 top-1 h-5 w-5 rounded-full bg-primary ring-4 ring-background"
              aria-hidden="true"
            />
            <div className="text-sm text-foreground/60 mb-1">
              {event.date && <span>{formatDate(event.date)}</span>}
              {event.time && (
                <span>
                  {event.date && ' · '}
                  {formatTime(event.time)}
                  {event.endTime && ` – ${formatTime(event.endTime)}`}
                </span>
              )}
            </div>
            <article className="border border-foreground/10 rounded-lg overflow-hidden bg-background">
              <div className="p-5 md:p-6">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-xl font-heading font-semibold text-primary">{event.name}</h3>
                  {event.visibility === 'wedding-party' && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                      Wedding Party Only
                    </span>
                  )}
                </div>
                {event.venueName && (
                  <p className="text-sm text-foreground/80 mb-3">
                    <span className="font-medium">{event.venueName}</span>
                    {event.venueAddress && (
                      <span className="text-foreground/60"> — {event.venueAddress}</span>
                    )}
                  </p>
                )}
                {event.description && (
                  <RichContent html={event.description} className="rich-content text-foreground/70 leading-relaxed" />
                )}
              </div>
              {event.mapUrl && (
                <div className="border-t border-foreground/10 p-0">
                  <VenueMap mapUrl={event.mapUrl} title={`Map for ${event.name}`} />
                </div>
              )}
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EventHeader({ event }: { event: EventRecord }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h3 className="text-2xl font-heading font-semibold text-primary">{event.name}</h3>
      {event.visibility === 'wedding-party' && (
        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
          Wedding Party Only
        </span>
      )}
    </div>
  );
}

function EventMeta({ event }: { event: EventRecord }) {
  return (
    <div className="space-y-2 text-foreground/80 mb-4">
      {event.date && (
        <p className="flex items-center gap-2">
          <svg className="w-5 h-5 text-foreground/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>{formatDate(event.date)}</span>
        </p>
      )}
      {event.time && (
        <p className="flex items-center gap-2">
          <svg className="w-5 h-5 text-foreground/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {formatTime(event.time)}
            {event.endTime && ` – ${formatTime(event.endTime)}`}
          </span>
        </p>
      )}
      {event.venueName && (
        <p className="flex items-center gap-2">
          <svg className="w-5 h-5 text-foreground/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>
            {event.venueName}
            {event.venueAddress && (
              <>
                <br />
                <span className="text-foreground/60 text-sm">{event.venueAddress}</span>
              </>
            )}
          </span>
        </p>
      )}
    </div>
  );
}
