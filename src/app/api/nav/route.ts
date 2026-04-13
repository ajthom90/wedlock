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
  { href: '/events', label: 'Events', order: 6 },
  { href: '/faq', label: 'FAQ', order: 7 },
  { href: '/seating', label: 'Seating', order: 8 },
  { href: '/guestbook', label: 'Guest Book', order: 9 },
  { href: '/rsvp', label: 'RSVP', order: 10 },
];

export async function GET() {
  try {
    let items = await prisma.navItem.findMany({ orderBy: { order: 'asc' } });

    if (items.length === 0) {
      // Create default nav items
      await prisma.$transaction(
        defaultNavItems.map((item) =>
          prisma.navItem.create({ data: item })
        )
      );
      items = await prisma.navItem.findMany({ orderBy: { order: 'asc' } });
    }

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching nav items:', error);
    return NextResponse.json({ error: 'Failed to fetch nav items' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const items: { id: string; href: string; label: string; visible: boolean; order: number }[] = await request.json();

    await prisma.$transaction(
      items.map((item) =>
        prisma.navItem.update({
          where: { id: item.id },
          data: { label: item.label, visible: item.visible, order: item.order },
        })
      )
    );

    const updated = await prisma.navItem.findMany({ orderBy: { order: 'asc' } });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating nav items:', error);
    return NextResponse.json({ error: 'Failed to update nav items' }, { status: 500 });
  }
}
