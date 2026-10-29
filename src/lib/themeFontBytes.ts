import type { LabelFontBytes } from './mailingLabelsPdf';

// Browser-side: fetch the site theme's heading/body fonts as bytes for PDF
// embedding (via /api/fonts/pdf). Any failure leaves a slot undefined and the
// renderer falls back to Helvetica — printing must work even offline from
// Google Fonts. Used by the mailing-labels and name-tents pages.
export async function fetchThemeFontBytes(): Promise<LabelFontBytes> {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return {};
    const { theme } = await res.json();
    const fetchFont = async (family: string, weight: 400 | 700) => {
      try {
        const r = await fetch(`/api/fonts/pdf?family=${encodeURIComponent(family)}&weight=${weight}`);
        return r.ok ? await r.arrayBuffer() : undefined;
      } catch {
        return undefined;
      }
    };
    const [heading, body, bodyBold] = await Promise.all([
      fetchFont(theme.headingFont, 400),
      fetchFont(theme.bodyFont, 400),
      fetchFont(theme.bodyFont, 700),
    ]);
    return { heading, body, bodyBold };
  } catch {
    return {};
  }
}
