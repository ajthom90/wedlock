import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const cookieStore = await cookies();
    const rsvpCookie = cookieStore.get('rsvp_code');

    let hasValidCode = false;

    // Check if a code was provided via query param or cookie
    const codeToValidate = code || rsvpCookie?.value;
    if (codeToValidate) {
      const invitation = await prisma.invitation.findUnique({ where: { code: codeToValidate } });
      if (invitation) {
        hasValidCode = true;
        // If code came via query param, set the cookie for future visits
        if (code) {
          cookieStore.set('rsvp_code', code, {
            httpOnly: true,
            secure: process.env.COOKIE_SECURE === 'true',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 365,
            path: '/',
          });
        }
      }
    }

    const events = await prisma.event.findMany({
      where: hasValidCode ? undefined : { visibility: 'public' },
      orderBy: { order: 'asc' },
    });
    return NextResponse.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { name, date, time, endTime, venueName, venueAddress, mapUrl, description, visibility } = await request.json();
    const maxOrder = await prisma.event.aggregate({ _max: { order: true } });
    const event = await prisma.event.create({ data: { name, date: date || null, time: time || null, endTime: endTime || null, venueName: venueName || null, venueAddress: venueAddress || null, mapUrl: mapUrl || null, description: description || null, visibility: visibility || 'public', order: (maxOrder._max.order || 0) + 1 } });
    return NextResponse.json(event);
  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
