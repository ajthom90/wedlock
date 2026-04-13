import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { approved } = await request.json();
    if (!(await prisma.guestBookEntry.findUnique({ where: { id } }))) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    const entry = await prisma.guestBookEntry.update({ where: { id }, data: { approved } });
    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error('Error updating guest book entry:', error);
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    if (!(await prisma.guestBookEntry.findUnique({ where: { id } }))) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    await prisma.guestBookEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting guest book entry:', error);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }
}
