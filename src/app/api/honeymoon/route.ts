import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    // Public: list of items + each item's aggregated pledge totals. Individual
    // pledge details (names/messages) are only returned to authenticated admin.
    const authed = await isAuthenticated();
    const items = await prisma.honeymoonItem.findMany({
      include: { pledges: authed ? true : false },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    if (authed) {
      return NextResponse.json(items);
    }
    // Public response: scrub pledges but keep aggregated total so the progress
    // bar can render.
    const publicItems = items.map((i) => {
      // include: { pledges: false } means the key is absent in the response,
      // so we re-fetch aggregations here with a separate query.
      return { ...i, pledges: undefined };
    });
    // Fetch sums per item
    const sums = await prisma.honeymoonPledge.groupBy({
      by: ['itemId'],
      _sum: { amount: true },
    });
    const totals = Object.fromEntries(sums.map((s) => [s.itemId, s._sum.amount || 0]));
    const withTotals = publicItems.map((i) => ({ ...i, raised: totals[i.id] || 0 }));
    return NextResponse.json(withTotals);
  } catch (error) {
    console.error('Error fetching honeymoon items:', error);
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { name, description, goalAmount, imageUrl } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    const maxOrder = await prisma.honeymoonItem.aggregate({ _max: { order: true } });
    const item = await prisma.honeymoonItem.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        goalAmount: typeof goalAmount === 'number' ? Math.max(0, goalAmount) : 0,
        imageUrl: imageUrl || null,
        order: (maxOrder._max.order || 0) + 1,
      },
    });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error creating honeymoon item:', error);
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
  }
}
