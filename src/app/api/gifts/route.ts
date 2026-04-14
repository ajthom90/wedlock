import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const items = await prisma.giftItem.findMany({ orderBy: { order: 'asc' } });
    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching gift items:', error);
    return NextResponse.json({ error: 'Failed to fetch gift items' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { name, store, url, price, notes, invitationId } = await request.json();
    const maxOrder = await prisma.giftItem.aggregate({ _max: { order: true } });
    const item = await prisma.giftItem.create({
      data: {
        name,
        store: store || null,
        url: url || null,
        price: price || null,
        notes: notes || null,
        invitationId: invitationId || null,
        order: (maxOrder._max.order || 0) + 1,
      },
    });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error creating gift item:', error);
    return NextResponse.json({ error: 'Failed to create gift item' }, { status: 500 });
  }
}
