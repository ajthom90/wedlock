import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getFeatures } from '@/lib/settings';

export async function GET() {
  try {
    const features = await getFeatures();
    if (features.guestBook === 'off') return NextResponse.json({ entries: [], enabled: false });
    const entries = await prisma.guestBookEntry.findMany({
      where: features.guestBook === 'moderated' ? { approved: true } : {},
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ entries, enabled: true, mode: features.guestBook });
  } catch (error) {
    console.error('Error fetching guest book entries:', error);
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const features = await getFeatures();
    if (features.guestBook === 'off') return NextResponse.json({ error: 'Guest book is not available' }, { status: 403 });
    const { name, message } = await request.json();
    if (!name || !message) return NextResponse.json({ error: 'Name and message are required' }, { status: 400 });
    if (name.length > 100) return NextResponse.json({ error: 'Name is too long (max 100 characters)' }, { status: 400 });
    if (message.length > 2000) return NextResponse.json({ error: 'Message is too long (max 2000 characters)' }, { status: 400 });
    const autoApprove = features.guestBook === 'public';
    const entry = await prisma.guestBookEntry.create({ data: { name: name.trim(), message: message.trim(), approved: autoApprove } });
    await prisma.notification.create({ data: { type: 'guestbook', title: 'Guest Book Entry', message: `${name.trim()} signed the guest book` } });
    return NextResponse.json({ success: true, entry, pendingApproval: !autoApprove });
  } catch (error) {
    console.error('Error creating guest book entry:', error);
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 });
  }
}
