import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { ensureSeatsLinked } from '@/lib/seatLinkingDb';
import { ensureTableNumbers } from '@/lib/tableNumbersDb';
import { compareTables, parseTableNumber } from '@/lib/tableNumbers';

export async function GET() {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await ensureSeatsLinked();
    await ensureTableNumbers();
    const tables = await prisma.seatingTable.findMany({ include: { assignments: { include: { guest: { select: { id: true, name: true, invitationId: true } } } } } });
    return NextResponse.json(tables.sort(compareTables));
  } catch (error) {
    console.error('Error fetching tables:', error);
    return NextResponse.json({ error: 'Failed to fetch tables' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { name, capacity, number } = await request.json();
    const table = await prisma.seatingTable.create({ data: { name, capacity, number: parseTableNumber(number) } });
    return NextResponse.json(table);
  } catch (error) {
    console.error('Error creating table:', error);
    return NextResponse.json({ error: 'Failed to create table' }, { status: 500 });
  }
}
