import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { formatDate, formatTime } from '@/lib/utils';
import { getFeatures } from '@/lib/settings';
import { EventsAccessForm } from '@/components/public/EventsAccessForm';
import { ShuttleSignupForm } from '@/components/public/ShuttleSignupForm';

export const dynamic = 'force-dynamic';

export default async function TransportationPage() {
  const features = await getFeatures();
  if (!features.transportation) notFound();
  const cookieStore = await cookies();
  const rsvpCookie = cookieStore.get('rsvp_code');

  let invitation: { id: string; maxGuests: number; householdName: string } | null = null;
  if (rsvpCookie?.value) {
    const found = await prisma.invitation.findUnique({
      where: { code: rsvpCookie.value },
      select: { id: true, maxGuests: true, householdName: true },
    });
    invitation = found;
  }

  const shuttles = await prisma.shuttle.findMany({
    include: { signups: true },
    orderBy: [{ departDate: 'asc' }, { departTime: 'asc' }, { order: 'asc' }],
  });

  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-heading font-bold text-center text-primary mb-12">Transportation</h1>

      {!invitation && (
        <>
          <p className="text-center text-foreground/70 mb-6">Enter your invitation code to sign up for shuttles.</p>
          <EventsAccessForm />
        </>
      )}

      <div className="max-w-3xl mx-auto">
        {shuttles.length === 0 ? (
          <p className="text-center text-foreground/60 py-8">Shuttle details coming soon!</p>
        ) : (
          <div className="space-y-6">
            {shuttles.map((s) => {
              const totalTaken = s.signups.reduce((sum, x) => sum + x.guestCount, 0);
              const mySignup = invitation ? s.signups.find((x) => x.invitationId === invitation.id) : null;
              const takenByOthers = totalTaken - (mySignup?.guestCount || 0);
              const seatsLeft = s.capacity > 0 ? s.capacity - takenByOthers : null;
              return (
                <article key={s.id} className="border border-foreground/10 rounded-lg overflow-hidden p-6 md:p-8 bg-background">
                  <h2 className="text-2xl font-heading font-semibold text-primary mb-2">{s.name}</h2>
                  <p className="text-foreground/80 mb-1">
                    {s.departDate ? formatDate(s.departDate) : ''} at {formatTime(s.departTime)}
                  </p>
                  <p className="text-foreground/70 text-sm mb-4">
                    {s.origin} <span className="mx-2">→</span> {s.destination}
                  </p>
                  {s.notes && <p className="text-foreground/70 mb-4 whitespace-pre-line">{s.notes}</p>}
                  {s.capacity > 0 && (
                    <p className="text-sm text-foreground/60 mb-4">
                      {seatsLeft !== null && seatsLeft > 0
                        ? `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} remaining`
                        : seatsLeft === 0
                          ? 'Fully booked'
                          : ''}
                    </p>
                  )}
                  {invitation ? (
                    <ShuttleSignupForm
                      shuttleId={s.id}
                      maxGuests={invitation.maxGuests}
                      initialCount={mySignup?.guestCount || 0}
                      seatsLeft={seatsLeft}
                    />
                  ) : (
                    <p className="text-sm text-foreground/60 italic">
                      Enter your invitation code above to sign up.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
