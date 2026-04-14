import './globals.css';
import type { Metadata } from 'next';
import { getSiteSettings } from '@/lib/settings';
import { formatDate } from '@/lib/utils';

// Root layouts in App Router can return metadata dynamically. We read the site
// settings on every request so the browser-tab title (and description) reflect
// whatever the couple has saved in /admin/settings without a rebuild.
//
// Statically-pre-rendered pages (_not-found, admin/login) call this at build
// time, when the SQLite DB doesn't exist yet inside the Docker builder stage.
// We swallow any Prisma error and fall back to defaults so the build can
// finish; at runtime the dynamic public pages re-invoke this function and
// pick up the real values from the live DB.
export async function generateMetadata(): Promise<Metadata> {
  const fallback: Metadata = {
    title: 'Our Wedding',
    description: 'Join us for our special day',
  };

  let settings: Awaited<ReturnType<typeof getSiteSettings>>;
  try {
    settings = await getSiteSettings();
  } catch {
    return fallback;
  }

  const customTitle = settings.siteTitle?.trim();
  const customDescription = settings.siteDescription?.trim();

  let autoTitle = 'Our Wedding';
  if (settings.coupleName1 && settings.coupleName2) {
    autoTitle = `${settings.coupleName1} & ${settings.coupleName2}`;
    if (settings.weddingDate) {
      try {
        autoTitle += ` - ${formatDate(settings.weddingDate)}`;
      } catch {
        // formatDate failed (malformed date) — fall back to names only.
      }
    }
  }

  return {
    title: customTitle || autoTitle,
    description: customDescription || fallback.description,
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
