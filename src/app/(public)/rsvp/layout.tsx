import { getSiteSettings, getFeatures } from '@/lib/settings';
import { isRsvpClosed } from '@/lib/rsvpStatus';

export const dynamic = 'force-dynamic';

// The RSVP page itself is a client component, so the closed check lives here
// on the server: when RSVPs are closed, guests see the notice straight away
// instead of being asked for an invitation code first. The API refuses
// submissions too, so this is the friendly face, not the enforcement.
export default async function RsvpLayout({ children }: { children: React.ReactNode }) {
  const [settings, features] = await Promise.all([getSiteSettings(), getFeatures()]);
  if (isRsvpClosed(settings, features)) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-4xl font-heading font-bold text-primary mb-4">RSVP Closed</h1>
        <p className="text-foreground/70">RSVPs are now closed. Please contact us directly if you need to make changes.</p>
      </div>
    );
  }
  return <>{children}</>;
}
