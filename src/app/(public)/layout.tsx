import { cookies } from 'next/headers';
import { getTheme, getSiteSettings, getFeatures } from '@/lib/settings';
import { ThemeStyle } from '@/components/public/ThemeStyle';
import { MobileNav } from '@/components/public/MobileNav';
import { SitePasswordGate } from '@/components/public/SitePasswordGate';
import { formatDate } from '@/lib/utils';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const fallbackNavItems = [
  { href: '/', label: 'Home' },
  { href: '/our-story', label: 'Our Story' },
  { href: '/wedding-party', label: 'Wedding Party' },
  { href: '/details', label: 'Details' },
  { href: '/travel', label: 'Travel' },
  { href: '/transportation', label: 'Transportation' },
  { href: '/registry', label: 'Registry' },
  { href: '/events', label: 'Events' },
  { href: '/faq', label: 'FAQ' },
  { href: '/seating', label: 'Seating' },
  { href: '/guestbook', label: 'Guest Book' },
  { href: '/trivia', label: 'Trivia' },
  { href: '/rsvp', label: 'RSVP' },
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [theme, settings, features, customFonts, dbNavItems] = await Promise.all([
    getTheme(),
    getSiteSettings(),
    getFeatures(),
    prisma.customFont.findMany(),
    prisma.navItem.findMany({ where: { visible: true }, orderBy: { order: 'asc' } }),
  ]);

  // Nav items gated by the corresponding feature flag — when the flag is off,
  // both the page and the link disappear. Applied to both the custom DB nav
  // (admin can still delete the item themselves) and the fallback list so
  // newly-disabled features vanish without requiring nav edits.
  const disallowedPaths = new Set<string>();
  if (!features.transportation) disallowedPaths.add('/transportation');
  if (!features.trivia) disallowedPaths.add('/trivia');
  if (features.guestBook === 'off') disallowedPaths.add('/guestbook');

  const navItems = (
    dbNavItems.length > 0
      ? dbNavItems.map((item) => ({ href: item.href, label: item.label }))
      : fallbackNavItems
  ).filter((item) => !disallowedPaths.has(item.href));

  const coupleTitle = settings.coupleName1 && settings.coupleName2
    ? `${settings.coupleName1} & ${settings.coupleName2}`
    : 'Our Wedding';

  // Site password protection
  const cookieStore = await cookies();
  const siteAccess = cookieStore.get('site_access');
  const needsPassword = features.sitePasswordEnabled && settings.sitePassword && !siteAccess?.value;

  if (needsPassword) {
    return (
      <>
        <ThemeStyle theme={theme} customFonts={customFonts} />
        <SitePasswordGate />
      </>
    );
  }

  return (
    <>
      <ThemeStyle theme={theme} customFonts={customFonts} />
      <div className="min-h-screen bg-background text-foreground">
        <MobileNav items={navItems} coupleTitle={coupleTitle} />
        <main>{children}</main>
        <footer className="border-t border-foreground/10 py-8 mt-12">
          <div className="container mx-auto px-4 text-center text-sm text-foreground/60">
            <p className="font-heading text-lg mb-2">{coupleTitle}</p>
            {settings.weddingDate && <p>{formatDate(settings.weddingDate)}</p>}
          </div>
        </footer>
      </div>
    </>
  );
}
