import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { buildSeatingExportRows } from '@/lib/seatingExport';
import { getFeatures } from '@/lib/settings';

export async function GET() {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [tables, invitations, features] = await Promise.all([
      prisma.seatingTable.findMany({ include: { assignments: true } }),
      prisma.invitation.findMany({ include: { guests: { orderBy: { order: 'asc' } }, response: true } }),
      getFeatures(),
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

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="seating-meals.xlsx"',
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error exporting seating chart:', error);
    return NextResponse.json({ error: 'Failed to export seating chart' }, { status: 500 });
  }
}
