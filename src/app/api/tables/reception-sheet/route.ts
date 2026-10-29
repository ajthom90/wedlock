import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { ensureSeatsLinked } from '@/lib/seatLinkingDb';
import { ensureTableNumbers } from '@/lib/tableNumbersDb';
import { getFeatures } from '@/lib/settings';
import { loadReceptionSheet } from '@/lib/receptionSheetDb';
import { receptionWorkbookBuffer } from '@/lib/receptionWorkbook';

// The couple's vendor sheet ("Reception Seating"): meal counts with colors,
// vendor meals and A / B / H counts above one row per guest. Layout lives in
// src/lib/receptionSheet.ts, cell styling in src/lib/receptionWorkbook.ts.
export async function GET() {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureSeatsLinked();
    await ensureTableNumbers();

    const features = await getFeatures();
    if (!features.receptionSheet) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const buffer = await receptionWorkbookBuffer(await loadReceptionSheet());
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="reception-seating.xlsx"',
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error exporting reception seating sheet:', error);
    return NextResponse.json({ error: 'Failed to export reception seating sheet' }, { status: 500 });
  }
}
