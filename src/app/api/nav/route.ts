import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

const defaultNavItems = [
  { href: '/', label: 'Home', order: 0 },
  { href: '/our-story', label: 'Our Story', order: 1 },
  { href: '/wedding-party', label: 'Wedding Party', order: 2 },
  { href: '/details', label: 'Details', order: 3 },
  { href: '/travel', label: 'Travel', order: 4 },
  { href: '/registry', label: 'Registry', order: 5 },
  { href: '/faq', label: 'FAQ', order: 6 },
  { href: '/seating', label: 'Seating', order: 7 },
  { href: '/guestbook', label: 'Guest Book', order: 8 },
  { href: '/rsvp', label: 'RSVP', order: 9 },
];

export async function GET() {
  try {
    let items = await prisma.navItem.findMany({ orderBy: { order: 'asc' } });

    if (items.length === 0) {
      await prisma.$transaction(
        defaultNavItems.map((item) => prisma.navItem.create({ data: item })),
      );
      items = await prisma.navItem.findMany({ orderBy: { order: 'asc' } });
    }

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching nav items:', error);
    return NextResponse.json({ error: 'Failed to fetch nav items' }, { status: 500 });
  }
}

// PUT accepts the full list. Any items not in the payload are left alone
// (they weren't touched); items in the payload are upserted by id. New items
// without an id get created. Items marked for deletion are deleted
// separately via DELETE /api/nav/:id.
export async function PUT(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const items: Array<{
      id?: string;
      href?: string | null;
      label: string;
      visible?: boolean;
      order?: number;
      parentId?: string | null;
    }> = await request.json();

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const data = {
          href: item.href?.trim() || null,
          label: item.label.trim(),
          visible: item.visible ?? true,
          order: item.order ?? 0,
          parentId: item.parentId || null,
        };
        if (item.id) {
          await tx.navItem.update({ where: { id: item.id }, data });
        } else {
          await tx.navItem.create({ data });
        }
      }
    });

    const updated = await prisma.navItem.findMany({ orderBy: { order: 'asc' } });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating nav items:', error);
    return NextResponse.json({ error: 'Failed to update nav items' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { href, label, parentId } = await request.json();
    if (!label?.trim()) return NextResponse.json({ error: 'Label is required' }, { status: 400 });
    const maxOrder = await prisma.navItem.aggregate({ _max: { order: true } });
    const item = await prisma.navItem.create({
      data: {
        href: href?.trim() || null,
        label: label.trim(),
        order: (maxOrder._max.order || 0) + 1,
        parentId: parentId || null,
      },
    });
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error creating nav item:', error);
    return NextResponse.json({ error: 'Failed to create nav item' }, { status: 500 });
  }
}
