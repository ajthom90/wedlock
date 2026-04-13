import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { type, label, choices, required, order } = await request.json();
    const option = await prisma.rsvpOption.update({ where: { id }, data: { type, label, choices: JSON.stringify(choices), required, order } });
    return NextResponse.json(option);
  } catch (error) {
    console.error('Error updating RSVP option:', error);
    return NextResponse.json({ error: 'Failed to update RSVP option' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await prisma.rsvpOption.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting RSVP option:', error);
    return NextResponse.json({ error: 'Failed to delete RSVP option' }, { status: 500 });
  }
}
