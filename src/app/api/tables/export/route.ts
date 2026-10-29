import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { ensureSeatsLinked } from '@/lib/seatLinkingDb';
import { ensureTableNumbers } from '@/lib/tableNumbersDb';
import { buildSeatingExportRows } from '@/lib/seatingExport';
import { getFeatures } from '@/lib/settings';
import { loadReceptionSheet } from '@/lib/receptionSheetDb';
import { receptionWorkbookBuffer } from '@/lib/receptionWorkbook';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const xlsxResponse = (buffer: Buffer<ArrayBuffer>, filename: string) =>
  new NextResponse(buffer, {
    headers: {
      'Content-Type': XLSX,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    },
  });

// "Download Spreadsheet" on the Seating page. With the Reception seating
// sheet flag on (the default) it's the full Reception Seating sheet — the
// summary, counts and A / B / H marks the couple's own sheet has. With it
// off, a plain one-row-per-guest list.
export async function GET() {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureSeatsLinked();
    await ensureTableNumbers();

    const features = await getFeatures();
    if (features.receptionSheet) return xlsxResponse(await receptionWorkbookBuffer(await loadReceptionSheet()), 'reception-seating.xlsx');

    const [tables, invitations] = await Promise.all([
      prisma.seatingTable.findMany({ include: { assignments: { include: { guest: { select: { id: true, name: true, invitationId: true } } } } } }),
      prisma.invitation.findMany({ include: { guests: { orderBy: { order: 'asc' } }, response: true } }),
    ]);
    const rows = buildSeatingExportRows(tables, invitations);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Seating');
    ws.columns = [
      { header: 'Guest Name', key: 'guestName', width: 30 },
      { header: 'Assigned Table Number', key: 'table', width: 24 },
      { header: 'Meal Choice', key: 'meal', width: 24 },
      { header: 'Dietary Restrictions', key: 'dietary', width: 50 },
      ...(features.childSeats ? [{ header: 'Child Seat', key: 'childSeat', width: 16 }] : []),
    ];
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    return xlsxResponse(Buffer.from(await wb.xlsx.writeBuffer()), 'seating-meals.xlsx');
  } catch (error) {
    console.error('Error exporting seating chart:', error);
    return NextResponse.json({ error: 'Failed to export seating chart' }, { status: 500 });
  }
}
