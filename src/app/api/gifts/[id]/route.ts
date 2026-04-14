import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    // Build a partial data object so toggle-only calls (e.g. just `purchased`)
    // don't blow away other fields via coerced-nulls.
    const data: Record<string, unknown> = {};
    if ('name' in body) data.name = body.name;
    if ('store' in body) data.store = body.store || null;
    if ('url' in body) data.url = body.url || null;
    if ('price' in body) data.price = body.price || null;
    if ('notes' in body) data.notes = body.notes || null;
    if ('purchased' in body) data.purchased = !!body.purchased;
    if ('purchasedBy' in body) data.purchasedBy = body.purchasedBy || null;
    if ('thankYouSent' in body) data.thankYouSent = !!body.thankYouSent;
    if ('order' in body) data.order = body.order;
    if ('invitationId' in body) data.invitationId = body.invitationId || null;

    const item = await prisma.giftItem.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating gift item:', error);
    return NextResponse.json({ error: 'Failed to update gift item' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await prisma.giftItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting gift item:', error);
    return NextResponse.json({ error: 'Failed to delete gift item' }, { status: 500 });
  }
}
