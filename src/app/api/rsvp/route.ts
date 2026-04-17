import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSiteSettings, getFeatures } from '@/lib/settings';
import { parseRsvpChoices } from '@/lib/rsvpChoices';
import { cookies } from 'next/headers';
import { getEmailConfig, sendRsvpConfirmation } from '@/lib/email';

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
      rsvpOptions: options.map((o) => ({ ...o, choices: parseRsvpChoices(o.choices) })),
      settings: { rsvpDeadline: settings.rsvpDeadline, rsvpCloseAfterDeadline: settings.rsvpCloseAfterDeadline },
      features: {
        perGuestSelection: features.perGuestSelection,
        songRequests: features.songRequests,
        dietaryNotes: features.dietaryNotes,
        rsvpAddress: features.rsvpAddress,
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
    const { code, attending, guestCount, responses, guestMeals, message, attendingGuests, plusOnes, songRequests, dietaryNotes, contactEmail, mailingAddress1, mailingAddress2, mailingCity, mailingState, mailingPostalCode } = await request.json();
    if (!code) return NextResponse.json({ error: 'Invitation code is required' }, { status: 400 });
    const settings = await getSiteSettings();
    if (settings.rsvpDeadline && settings.rsvpCloseAfterDeadline) {
      const deadline = new Date(settings.rsvpDeadline);
      deadline.setHours(23, 59, 59, 999);
      if (new Date() > deadline) return NextResponse.json({ error: 'RSVP submissions are now closed' }, { status: 403 });
    }
    const invitation = await prisma.invitation.findUnique({ where: { code } });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    const features = await getFeatures();
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
    // Drop plus-ones with empty names; each remaining entry carries {name, meal?}.
    const cleanPlusOnes = Array.isArray(plusOnes)
      ? plusOnes.filter((p: any) => p && typeof p.name === 'string' && p.name.trim()).map((p: any) => ({ name: p.name.trim(), meal: p.meal || '' }))
      : [];
    const data = {
      attending, guestCount: guestCount || 0, responses: JSON.stringify(responses || {}),
      guestMeals: guestMeals ? JSON.stringify(guestMeals) : null,
      attendingGuests: attendingGuests ? JSON.stringify(attendingGuests) : null,
      plusOnes: cleanPlusOnes.length ? JSON.stringify(cleanPlusOnes) : null,
      songRequests: songRequests || null, dietaryNotes: dietaryNotes || null, message: message || null,
    };
    // Snapshot of the submitted state for the change log. Stored as JSON so the
    // admin RSVPs page can reconstruct "what was RSVPed on this date" without
    // needing new columns when RsvpResponse gains fields.
    const logDetails = JSON.stringify({
      attending, guestCount: guestCount || 0,
      attendingGuests: attendingGuests || null, guestMeals: guestMeals || null,
      plusOnes: cleanPlusOnes.length ? cleanPlusOnes : null,
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
    // Fire-and-forget RSVP confirmation. Errors are logged, not surfaced —
    // the guest's RSVP succeeded regardless.
    if (features.rsvpConfirmationEmails && getEmailConfig().configured) {
      // Reload the invitation to pick up the just-saved contactEmail, and
      // include guests so the confirmation recap can resolve IDs to names.
      const fresh = await prisma.invitation.findUnique({
        where: { id: invitation.id },
        include: { guests: true },
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
