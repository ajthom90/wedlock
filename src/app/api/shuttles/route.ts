import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    const shuttles = await prisma.shuttle.findMany({
      include: { signups: { include: { invitation: { select: { householdName: true } } } } },
      orderBy: [{ departDate: 'asc' }, { departTime: 'asc' }, { order: 'asc' }],
    });
    return NextResponse.json(shuttles);
  } catch (error) {
    console.error('Error fetching shuttles:', error);
    return NextResponse.json({ error: 'Failed to fetch shuttles' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { name, departDate, departTime, origin, destination, capacity, notes } = await request.json();
    if (!name?.trim() || !departDate?.trim() || !departTime?.trim() || !origin?.trim() || !destination?.trim()) {
      return NextResponse.json({ error: 'Name, date, time, origin, and destination are required' }, { status: 400 });
    }
    const maxOrder = await prisma.shuttle.aggregate({ _max: { order: true } });
    const shuttle = await prisma.shuttle.create({
      data: {
        name: name.trim(),
        departDate: departDate.trim(),
        departTime: departTime.trim(),
        origin: origin.trim(),
        destination: destination.trim(),
        capacity: typeof capacity === 'number' ? Math.max(0, capacity) : 0,
        notes: notes?.trim() || null,
        order: (maxOrder._max.order || 0) + 1,
      },
    });
    return NextResponse.json(shuttle);
  } catch (error) {
    console.error('Error creating shuttle:', error);
    return NextResponse.json({ error: 'Failed to create shuttle' }, { status: 500 });
  }
}
