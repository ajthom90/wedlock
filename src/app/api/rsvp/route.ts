import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSiteSettings, getFeatures } from '@/lib/settings';
import { parseRsvpChoices } from '@/lib/rsvpChoices';
import { validateRsvpSubmission } from '@/lib/rsvpValidation';
import { cookies } from 'next/headers';
import { getEmailConfig, sendRsvpConfirmation } from '@/lib/email';

export async function GET(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get('code');
    if (!code) return NextResponse.json({ error: 'Invitation code is required' }, { status: 400 });
    const invitation = await prisma.invitation.findUnique({ where: { code }, include: { guests: { orderBy: { order: 'asc' } }, response: true } });
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
      // Explicit shape — the invitation row also carries internal admin fields
      // (notes, admin-entered email, isWeddingParty) that guests must not see.
      invitation: {
        id: invitation.id,
        code: invitation.code,
        householdName: invitation.householdName,
        maxGuests: invitation.maxGuests,
        plusOnesAllowed: invitation.plusOnesAllowed,
        contactEmail: invitation.contactEmail,
        mailingAddress1: invitation.mailingAddress1,
        mailingAddress2: invitation.mailingAddress2,
        mailingCity: invitation.mailingCity,
        mailingState: invitation.mailingState,
        mailingPostalCode: invitation.mailingPostalCode,
        guests: invitation.guests.map((g) => ({ id: g.id, name: g.name, isPrimary: g.isPrimary })),
        response: invitation.response,
      },
      rsvpOptions: options.map((o) => ({ ...o, choices: parseRsvpChoices(o.choices) })),
      settings: { rsvpDeadline: settings.rsvpDeadline, rsvpCloseAfterDeadline: settings.rsvpCloseAfterDeadline },
      features: {
        perGuestSelection: features.perGuestSelection,
        songRequests: features.songRequests,
        dietaryNotes: features.dietaryNotes,
        rsvpPlusOnes: features.rsvpPlusOnes,
        rsvpAddress: features.rsvpAddress,
        rsvpCorrections: features.rsvpCorrections,
        rsvpConfirmationEmails: features.rsvpConfirmationEmails,
        dayOfBroadcasts: features.dayOfBroadcasts,
      },
    });
  } catch (error) {
    console.error('Error fetching invitation:', error);
    return NextResponse.json({ error: 'Failed to fetch invitation' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { code, attending, guestCount, responses, guestMeals, message, attendingGuests, plusOnes, songRequests, dietaryNotes, contactEmail, mailingAddress1, mailingAddress2, mailingCity, mailingState, mailingPostalCode, correction } = await request.json();
    if (!code) return NextResponse.json({ error: 'Invitation code is required' }, { status: 400 });
    const settings = await getSiteSettings();
    if (settings.rsvpDeadline && settings.rsvpCloseAfterDeadline) {
      const deadline = new Date(settings.rsvpDeadline);
      deadline.setHours(23, 59, 59, 999);
      if (new Date() > deadline) return NextResponse.json({ error: 'RSVP submissions are now closed' }, { status: 403 });
    }
    const invitation = await prisma.invitation.findUnique({ where: { code }, include: { guests: { select: { id: true } } } });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    const features = await getFeatures();
    // Validate the attendance fields against this invitation's limits BEFORE
    // writing anything, so a rejected submission leaves no partial state.
    const validation = validateRsvpSubmission(
      { attending, guestCount, attendingGuests, guestMeals, plusOnes },
      {
        maxGuests: invitation.maxGuests,
        plusOnesAllowed: invitation.plusOnesAllowed,
        guestIds: invitation.guests.map((g) => g.id),
        plusOnesEnabled: features.rsvpPlusOnes,
      },
    );
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
    const submission = validation.data;
    // Persist structured mailing address on the invitation. Each field is
    // independently updated so clearing one field doesn't clobber the others.
    const addressPatch: {
      mailingAddress1?: string | null;
      mailingAddress2?: string | null;
      mailingCity?: string | null;
      mailingState?: string | null;
      mailingPostalCode?: string | null;
    } = {};
    if (typeof mailingAddress1 === 'string') addressPatch.mailingAddress1 = mailingAddress1.trim() || null;
    if (typeof mailingAddress2 === 'string') addressPatch.mailingAddress2 = mailingAddress2.trim() || null;
    if (typeof mailingCity === 'string') addressPatch.mailingCity = mailingCity.trim() || null;
    if (typeof mailingState === 'string') addressPatch.mailingState = mailingState.trim() || null;
    if (typeof mailingPostalCode === 'string') addressPatch.mailingPostalCode = mailingPostalCode.trim() || null;
    if (Object.keys(addressPatch).length > 0) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: addressPatch,
      });
    }
    // Persist contactEmail on the invitation. Empty string clears the opt-in.
    if (typeof contactEmail === 'string') {
      const trimmed = contactEmail.trim();
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { contactEmail: trimmed || null },
      });
    }
    const existing = await prisma.rsvpResponse.findUnique({ where: { invitationId: invitation.id } });
    const cleanResponses = responses && typeof responses === 'object' && !Array.isArray(responses) ? responses : {};
    const data = {
      attending: submission.attending, guestCount: submission.guestCount, responses: JSON.stringify(cleanResponses),
      guestMeals: Object.keys(submission.guestMeals).length ? JSON.stringify(submission.guestMeals) : null,
      attendingGuests: submission.attendingGuests.length ? JSON.stringify(submission.attendingGuests) : null,
      plusOnes: submission.plusOnes.length ? JSON.stringify(submission.plusOnes) : null,
      songRequests: songRequests || null, dietaryNotes: dietaryNotes || null, message: message || null,
    };
    // Snapshot of the submitted state for the change log. Stored as JSON so the
    // admin RSVPs page can reconstruct "what was RSVPed on this date" without
    // needing new columns when RsvpResponse gains fields.
    const logDetails = JSON.stringify({
      attending: submission.attending, guestCount: submission.guestCount,
      attendingGuests: submission.attendingGuests.length ? submission.attendingGuests : null,
      guestMeals: Object.keys(submission.guestMeals).length ? submission.guestMeals : null,
      plusOnes: submission.plusOnes.length ? submission.plusOnes : null,
      songRequests: songRequests || null, dietaryNotes: dietaryNotes || null,
      message: message || null,
    });
    let response;
    if (existing) {
      response = await prisma.rsvpResponse.update({ where: { id: existing.id }, data: { ...data, submittedAt: new Date() } });
    } else {
      response = await prisma.rsvpResponse.create({ data: { invitationId: invitation.id, ...data } });
    }
    await prisma.rsvpChangeLog.create({ data: { invitationId: invitation.id, source: 'guest', details: logDetails } });
    await prisma.notification.create({ data: { type: 'rsvp', title: 'New RSVP', message: `${invitation.householdName} has ${attending === 'yes' ? 'accepted' : 'declined'} the invitation` } });
    // Persist a corrections note when the guest filled in the corrections
    // textarea. Each submit adds a row — the couple marks them handled from
    // the admin Corrections page.
    if (features.rsvpCorrections && typeof correction === 'string' && correction.trim()) {
      await prisma.rsvpCorrection.create({ data: { invitationId: invitation.id, message: correction.trim() } });
      await prisma.notification.create({ data: { type: 'rsvp', title: 'RSVP correction submitted', message: `${invitation.householdName} flagged a correction on their RSVP` } });
    }
    // Fire-and-forget RSVP confirmation. Errors are logged, not surfaced —
    // the guest's RSVP succeeded regardless.
    if (features.rsvpConfirmationEmails && getEmailConfig().configured) {
      // Reload the invitation to pick up the just-saved contactEmail, and
      // include guests so the confirmation recap can resolve IDs to names.
      const fresh = await prisma.invitation.findUnique({
        where: { id: invitation.id },
        include: { guests: { orderBy: { order: 'asc' } } },
      });
      if (fresh?.contactEmail) {
        sendRsvpConfirmation(fresh, response, { isUpdate: !!existing })
          .catch((err) => console.error('RSVP confirmation send failed:', err));
      }
    }
    return NextResponse.json({ success: true, response });
  } catch (error) {
    console.error('Error submitting RSVP:', error);
    return NextResponse.json({ error: 'Failed to submit RSVP' }, { status: 500 });
  }
}
