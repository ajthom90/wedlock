import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Guest-facing: record a pledge. No auth — anyone with the item id can pledge.
// Not a real payment, just intent captured for the couple to reconcile later.
export async function POST(request: Request) {
  try {
    const { itemId, guestName, amount, message } = await request.json();
    if (!itemId || !guestName?.trim() || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'itemId, guestName, and positive amount are required' }, { status: 400 });
    }
    const item = await prisma.honeymoonItem.findUnique({ where: { id: itemId } });
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const pledge = await prisma.honeymoonPledge.create({
      data: {
        itemId,
        guestName: guestName.trim(),
        amount,
        message: message?.trim() || null,
      },
    });

    await prisma.notification.create({
      data: {
        type: 'honeymoon',
        title: 'New honeymoon pledge',
        message: `${guestName.trim()} pledged $${amount.toFixed(2)} toward ${item.name}`,
      },
    });

    return NextResponse.json({ success: true, pledge });
  } catch (error) {
    console.error('Error creating pledge:', error);
    return NextResponse.json({ error: 'Failed to record pledge' }, { status: 500 });
  }
}
