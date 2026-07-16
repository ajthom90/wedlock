import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { loadPdfFont, type FontWeight } from '@/lib/pdfFonts';

// Raw font bytes for client-side PDF generation (the labels page embeds the
// site's theme fonts with @pdf-lib/fontkit in the browser). Admin-only — it
// can read arbitrary uploaded font files and triggers outbound Google Fonts
// fetches.
export async function GET(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(request.url);
    const family = url.searchParams.get('family');
    if (!family) return NextResponse.json({ error: 'family is required' }, { status: 400 });
    const weight: FontWeight = url.searchParams.get('weight') === '700' ? 700 : 400;
    const customFonts = await prisma.customFont.findMany({ select: { family: true, filename: true } });
    const bytes = await loadPdfFont(family, weight, customFonts);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/octet-stream',
        // Font files are immutable per family+weight for a session; spare
        // the Google round-trip on repeated label generations.
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error loading PDF font:', error);
    return NextResponse.json({ error: 'Failed to load font' }, { status: 404 });
  }
}
