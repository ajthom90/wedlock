import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

// Admin marks a pledge as received (or un-received, or edits amount/message).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if ('guestName' in body) data.guestName = body.guestName?.trim();
    if ('amount' in body && typeof body.amount === 'number') data.amount = Math.max(0, body.amount);
    if ('message' in body) data.message = body.message?.trim() || null;
    if ('received' in body) {
      data.receivedAt = body.received ? new Date() : null;
    }

    const pledge = await prisma.honeymoonPledge.update({ where: { id }, data });
    return NextResponse.json(pledge);
  } catch (error) {
    console.error('Error updating pledge:', error);
    return NextResponse.json({ error: 'Failed to update pledge' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await prisma.honeymoonPledge.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting pledge:', error);
    return NextResponse.json({ error: 'Failed to delete pledge' }, { status: 500 });
  }
}
