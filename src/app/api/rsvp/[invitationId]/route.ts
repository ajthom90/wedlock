import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { parseRsvpChoices } from '@/lib/rsvpChoices';
import { validateRsvpSubmission } from '@/lib/rsvpValidation';

export async function GET(_request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { invitationId } = await params;
    const invitation = await prisma.invitation.findUnique({ where: { id: invitationId }, include: { guests: true, response: true } });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    const options = await prisma.rsvpOption.findMany({ orderBy: { order: 'asc' } });
    return NextResponse.json({ invitation, rsvpOptions: options.map((o) => ({ ...o, choices: parseRsvpChoices(o.choices) })) });
  } catch (error) {
    console.error('Error fetching RSVP:', error);
    return NextResponse.json({ error: 'Failed to fetch RSVP' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { invitationId } = await params;
    const { attending, guestCount, responses, guestMeals, attendingGuests, plusOnes, songRequests, dietaryNotes, message, contactEmail, mailingAddress1, mailingAddress2, mailingCity, mailingState, mailingPostalCode } = await request.json();
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { guests: { select: { id: true } } },
    });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    // plusOnesEnabled is always true on the admin path so the couple can record
    // a plus-one even when the public RSVP plus-ones toggle is off.
    const validation = validateRsvpSubmission(
      { attending, guestCount, attendingGuests, guestMeals, plusOnes },
      {
        maxGuests: invitation.maxGuests,
        plusOnesAllowed: invitation.plusOnesAllowed,
        guestIds: invitation.guests.map((g) => g.id),
        plusOnesEnabled: true,
      },
    );
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
    const submission = validation.data;
    // address and contactEmail + structured mailing address live on Invitation,
    // not RsvpResponse; apply them here so admin edits stay in one round-trip.
    const invitationPatch: {
      mailingAddress1?: string | null;
      mailingAddress2?: string | null;
      mailingCity?: string | null;
      mailingState?: string | null;
      mailingPostalCode?: string | null;
      contactEmail?: string | null;
    } = {};
    if (typeof mailingAddress1 === 'string') invitationPatch.mailingAddress1 = mailingAddress1.trim() || null;
    if (typeof mailingAddress2 === 'string') invitationPatch.mailingAddress2 = mailingAddress2.trim() || null;
    if (typeof mailingCity === 'string') invitationPatch.mailingCity = mailingCity.trim() || null;
    if (typeof mailingState === 'string') invitationPatch.mailingState = mailingState.trim() || null;
    if (typeof mailingPostalCode === 'string') invitationPatch.mailingPostalCode = mailingPostalCode.trim() || null;
    if (typeof contactEmail === 'string') invitationPatch.contactEmail = contactEmail.trim() || null;
    if (Object.keys(invitationPatch).length > 0) {
      await prisma.invitation.update({ where: { id: invitationId }, data: invitationPatch });
    }
    const data = {
      attending: submission.attending, guestCount: submission.guestCount, responses: JSON.stringify(responses || {}),
      guestMeals: Object.keys(submission.guestMeals).length ? JSON.stringify(submission.guestMeals) : null,
      attendingGuests: submission.attendingGuests.length ? JSON.stringify(submission.attendingGuests) : null,
      plusOnes: submission.plusOnes.length ? JSON.stringify(submission.plusOnes) : null,
      songRequests: songRequests || null, dietaryNotes: dietaryNotes || null, message: message || null,
    };
    const logDetails = JSON.stringify({
      attending: submission.attending, guestCount: submission.guestCount,
      attendingGuests: submission.attendingGuests.length ? submission.attendingGuests : null,
      guestMeals: Object.keys(submission.guestMeals).length ? submission.guestMeals : null,
      plusOnes: submission.plusOnes.length ? submission.plusOnes : null,
      songRequests: songRequests || null, dietaryNotes: dietaryNotes || null,
      message: message || null,
    });
    const existing = await prisma.rsvpResponse.findUnique({ where: { invitationId } });
    if (existing) {
      const response = await prisma.rsvpResponse.update({ where: { id: existing.id }, data: { ...data, submittedAt: new Date() } });
      await prisma.rsvpChangeLog.create({ data: { invitationId, source: 'admin', details: logDetails } });
      return NextResponse.json({ success: true, response });
    }
    const response = await prisma.rsvpResponse.create({ data: { invitationId, ...data } });
    await prisma.rsvpChangeLog.create({ data: { invitationId, source: 'admin', details: logDetails } });
    return NextResponse.json({ success: true, response });
  } catch (error) {
    console.error('Error updating RSVP:', error);
    return NextResponse.json({ error: 'Failed to update RSVP' }, { status: 500 });
  }
}
