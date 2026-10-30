import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { ensureSeatsLinked } from '@/lib/seatLinkingDb';
import { ensureTableNumbers } from '@/lib/tableNumbersDb';
import { buildAlphabeticalSeatingRows } from '@/lib/seatingExport';
import { getFeatures } from '@/lib/settings';

// "Download Alphabetical List" on the Seating page: Last Name, First Name,
// Table, sorted by last name — for escort cards or a check-in table.
export async function GET() {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const features = await getFeatures();
    if (!features.alphabeticalSeating) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await ensureSeatsLinked();
    await ensureTableNumbers();

    const [tables, invitations] = await Promise.all([
      prisma.seatingTable.findMany({ include: { assignments: { include: { guest: { select: { id: true, name: true, invitationId: true } } } } } }),
      prisma.invitation.findMany({ include: { guests: { orderBy: { order: 'asc' } }, response: true } }),
    ]);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Alphabetical');
    ws.columns = [
      { header: 'Last Name', key: 'lastName', width: 24 },
      { header: 'First Name', key: 'firstName', width: 24 },
      { header: 'Table', key: 'table', width: 30 },
    ];
    ws.addRows(buildAlphabeticalSeatingRows(tables, invitations));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="seating-alphabetical.xlsx"',
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error exporting alphabetical seating list:', error);
    return NextResponse.json({ error: 'Failed to export alphabetical seating list' }, { status: 500 });
  }
}
