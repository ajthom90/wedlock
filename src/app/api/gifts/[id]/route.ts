import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const { name, store, url, price, notes, purchased, purchasedBy, thankYouSent, order } = await request.json();
    const item = await prisma.giftItem.update({ where: { id }, data: { name, store: store || null, url: url || null, price: price || null, notes: notes || null, purchased, purchasedBy: purchasedBy || null, thankYouSent, order } });
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
