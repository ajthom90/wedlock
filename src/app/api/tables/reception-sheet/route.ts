import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { ensureSeatsLinked } from '@/lib/seatLinkingDb';
import { getFeatures, getSiteSettings } from '@/lib/settings';
import { parseRsvpChoices } from '@/lib/rsvpChoices';
import { buildReceptionSheet, RECEPTION_SHEET_NAME } from '@/lib/receptionSheet';

// The couple's vendor sheet ("Reception Seating"): meal counts with colors,
// vendor meals and A / B / H counts above one row per guest. Layout lives in
// src/lib/receptionSheet.ts; this only writes the grid out.
export async function GET() {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureSeatsLinked();

    const features = await getFeatures();
    if (!features.receptionSheet) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [tables, invitations, mealOptions, site] = await Promise.all([
      prisma.seatingTable.findMany({ include: { assignments: { include: { guest: { select: { id: true, name: true, invitationId: true } } } } } }),
      prisma.invitation.findMany({ include: { guests: { orderBy: { order: 'asc' } }, response: true } }),
      prisma.rsvpOption.findMany({ where: { type: 'meal' }, orderBy: { order: 'asc' } }),
      getSiteSettings(),
    ]);
    const { rows, headerRow } = buildReceptionSheet({
      tables,
      invitations,
      mealChoices: mealOptions.flatMap((o) => parseRsvpChoices(o.choices)),
      vendorMeals: site.vendorMeals,
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(RECEPTION_SHEET_NAME);
    ws.addRows(rows);
    ws.columns = [{ width: 30 }, { width: 12 }, { width: 28 }, { width: 40 }, { width: 8 }, { width: 6 }, { width: 12 }];
    ws.getRow(1).font = { bold: true };
    ws.getRow(headerRow).font = { bold: true };

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
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
