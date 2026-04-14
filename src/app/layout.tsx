import './globals.css';
import type { Metadata } from 'next';
import { getSiteSettings } from '@/lib/settings';
import { formatDate } from '@/lib/utils';

// Root layouts in App Router can return metadata dynamically. We read the site
// settings on every request so the browser-tab title (and description) reflect
// whatever the couple has saved in /admin/settings without a rebuild.
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();

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
    description: customDescription || 'Join us for our special day',
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
