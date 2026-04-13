import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSiteSettings, getFeatures } from '@/lib/settings';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get('code');
    if (!code) return NextResponse.json({ error: 'Invitation code is required' }, { status: 400 });
    const invitation = await prisma.invitation.findUnique({ where: { code }, include: { guests: true, response: true } });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    const options = await prisma.rsvpOption.findMany({ orderBy: { order: 'asc' } });
    const settings = await getSiteSettings();
    const features = await getFeatures();

    // Set rsvp_code cookie so subsequent visits remember the guest
    const cookieStore = await cookies();
    cookieStore.set('rsvp_code', code, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });

    return NextResponse.json({
      invitation,
      rsvpOptions: options.map((o) => ({ ...o, choices: JSON.parse(o.choices) })),
      settings: { rsvpDeadline: settings.rsvpDeadline, rsvpCloseAfterDeadline: settings.rsvpCloseAfterDeadline },
      features: { perGuestSelection: features.perGuestSelection, songRequests: features.songRequests, dietaryNotes: features.dietaryNotes },
    });
  } catch (error) {
    console.error('Error fetching invitation:', error);
    return NextResponse.json({ error: 'Failed to fetch invitation' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { code, attending, guestCount, responses, guestMeals, message, attendingGuests, songRequests, dietaryNotes } = await request.json();
    if (!code) return NextResponse.json({ error: 'Invitation code is required' }, { status: 400 });
    const settings = await getSiteSettings();
    if (settings.rsvpDeadline && settings.rsvpCloseAfterDeadline) {
      const deadline = new Date(settings.rsvpDeadline);
      deadline.setHours(23, 59, 59, 999);
      if (new Date() > deadline) return NextResponse.json({ error: 'RSVP submissions are now closed' }, { status: 403 });
    }
    const invitation = await prisma.invitation.findUnique({ where: { code } });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    const existing = await prisma.rsvpResponse.findUnique({ where: { invitationId: invitation.id } });
    const data = {
      attending, guestCount: guestCount || 0, responses: JSON.stringify(responses || {}),
      guestMeals: guestMeals ? JSON.stringify(guestMeals) : null,
      attendingGuests: attendingGuests ? JSON.stringify(attendingGuests) : null,
      songRequests: songRequests || null, dietaryNotes: dietaryNotes || null, message: message || null,
    };
    if (existing) {
      const response = await prisma.rsvpResponse.update({ where: { id: existing.id }, data: { ...data, submittedAt: new Date() } });
      await prisma.notification.create({ data: { type: 'rsvp', title: 'New RSVP', message: `${invitation.householdName} has ${attending === 'yes' ? 'accepted' : 'declined'} the invitation` } });
      return NextResponse.json({ success: true, response });
    }
    const response = await prisma.rsvpResponse.create({ data: { invitationId: invitation.id, ...data } });
    await prisma.notification.create({ data: { type: 'rsvp', title: 'New RSVP', message: `${invitation.householdName} has ${attending === 'yes' ? 'accepted' : 'declined'} the invitation` } });
    return NextResponse.json({ success: true, response });
  } catch (error) {
    console.error('Error submitting RSVP:', error);
    return NextResponse.json({ error: 'Failed to submit RSVP' }, { status: 500 });
  }
}
