import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { parseRsvpChoices } from '@/lib/rsvpChoices';

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
    if (!(await prisma.invitation.findUnique({ where: { id: invitationId } }))) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    const cleanPlusOnes = Array.isArray(plusOnes)
      ? plusOnes.filter((p: any) => p && typeof p.name === 'string' && p.name.trim()).map((p: any) => ({ name: p.name.trim(), meal: p.meal || '' }))
      : [];
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
      attending, guestCount: guestCount || 0, responses: JSON.stringify(responses || {}),
      guestMeals: guestMeals ? JSON.stringify(guestMeals) : null,
      attendingGuests: attendingGuests ? JSON.stringify(attendingGuests) : null,
      plusOnes: cleanPlusOnes.length ? JSON.stringify(cleanPlusOnes) : null,
      songRequests: songRequests || null, dietaryNotes: dietaryNotes || null, message: message || null,
    };
    const logDetails = JSON.stringify({
      attending, guestCount: guestCount || 0,
      attendingGuests: attendingGuests || null, guestMeals: guestMeals || null,
      plusOnes: cleanPlusOnes.length ? cleanPlusOnes : null,
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
