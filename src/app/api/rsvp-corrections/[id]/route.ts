import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const { handled, handledNotes } = await request.json();
    const data: { handledAt: Date | null; handledNotes?: string | null } = {
      handledAt: handled ? new Date() : null,
    };
    if (typeof handledNotes === 'string') {
      data.handledNotes = handledNotes.trim() || null;
    }
    const correction = await prisma.rsvpCorrection.update({ where: { id }, data });
    return NextResponse.json(correction);
  } catch (error) {
    console.error('Error updating correction:', error);
    return NextResponse.json({ error: 'Failed to update correction' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    await prisma.rsvpCorrection.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting correction:', error);
    return NextResponse.json({ error: 'Failed to delete correction' }, { status: 500 });
  }
}
