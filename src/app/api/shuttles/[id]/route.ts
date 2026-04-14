import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if ('name' in body) data.name = body.name?.trim();
    if ('departDate' in body) data.departDate = body.departDate?.trim();
    if ('departTime' in body) data.departTime = body.departTime?.trim();
    if ('origin' in body) data.origin = body.origin?.trim();
    if ('destination' in body) data.destination = body.destination?.trim();
    if ('capacity' in body && typeof body.capacity === 'number') data.capacity = Math.max(0, body.capacity);
    if ('notes' in body) data.notes = body.notes?.trim() || null;
    if ('order' in body && typeof body.order === 'number') data.order = body.order;

    const shuttle = await prisma.shuttle.update({ where: { id }, data });
    return NextResponse.json(shuttle);
  } catch (error) {
    console.error('Error updating shuttle:', error);
    return NextResponse.json({ error: 'Failed to update shuttle' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await prisma.shuttle.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting shuttle:', error);
    return NextResponse.json({ error: 'Failed to delete shuttle' }, { status: 500 });
  }
}
