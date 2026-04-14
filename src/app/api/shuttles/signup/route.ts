import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';

/**
 * Guest-facing endpoint to sign up for a shuttle. Gated by the rsvp_code
 * cookie — the same cookie used for the invitation-code flow on /events.
 * Passing guestCount=0 removes the signup.
 */
export async function POST(request: Request) {
  try {
    const { shuttleId, guestCount } = await request.json();
    if (!shuttleId) return NextResponse.json({ error: 'shuttleId is required' }, { status: 400 });

    const cookieStore = await cookies();
    const rsvpCookie = cookieStore.get('rsvp_code');
    if (!rsvpCookie?.value) return NextResponse.json({ error: 'Invitation code required' }, { status: 401 });
    const invitation = await prisma.invitation.findUnique({ where: { code: rsvpCookie.value } });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });

    const shuttle = await prisma.shuttle.findUnique({
      where: { id: shuttleId },
      include: { signups: true },
    });
    if (!shuttle) return NextResponse.json({ error: 'Shuttle not found' }, { status: 404 });

    const count = typeof guestCount === 'number' ? Math.max(0, Math.min(invitation.maxGuests, Math.floor(guestCount))) : 1;

    if (count === 0) {
      await prisma.shuttleSignup.deleteMany({ where: { shuttleId, invitationId: invitation.id } });
      return NextResponse.json({ success: true, removed: true });
    }

    // Enforce capacity if set (0 = unlimited). Exclude this invitation's existing signup from the total.
    if (shuttle.capacity > 0) {
      const takenByOthers = shuttle.signups
        .filter((s) => s.invitationId !== invitation.id)
        .reduce((sum, s) => sum + s.guestCount, 0);
      if (takenByOthers + count > shuttle.capacity) {
        return NextResponse.json({ error: 'Not enough seats remaining' }, { status: 409 });
      }
    }

    const signup = await prisma.shuttleSignup.upsert({
      where: { shuttleId_invitationId: { shuttleId, invitationId: invitation.id } },
      update: { guestCount: count },
      create: { shuttleId, invitationId: invitation.id, guestCount: count },
    });
    return NextResponse.json({ success: true, signup });
  } catch (error) {
    console.error('Error signing up for shuttle:', error);
    return NextResponse.json({ error: 'Failed to sign up' }, { status: 500 });
  }
}
