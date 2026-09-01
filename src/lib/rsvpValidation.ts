// Server-side validation for guest RSVP submissions. The public form enforces
// all of this client-side; this is the backstop against tampered requests and
// stale forms (e.g. the admin lowered maxGuests while a guest had the page
// open). Unknown guest IDs are filtered rather than rejected so an RSVP
// survives the admin editing the household mid-flight; hard limits reject.

import { pruneGuestMeals } from './rsvpMeals';

export interface RsvpValidationContext {
  maxGuests: number;
  plusOnesAllowed: number;
  guestIds: string[];
  plusOnesEnabled: boolean;
}

export interface RsvpValidatedData {
  attending: 'yes' | 'no';
  guestCount: number;
  attendingGuests: string[];
  guestMeals: Record<string, string>;
  plusOnes: { name: string; meal: string }[];
}

export type RsvpValidationResult =
  | { ok: true; data: RsvpValidatedData }
  | { ok: false; error: string };

export function validateRsvpSubmission(body: any, ctx: RsvpValidationContext): RsvpValidationResult {
  const attending = body?.attending;
  if (attending !== 'yes' && attending !== 'no') {
    return { ok: false, error: 'Please choose whether you are attending.' };
  }

  if (attending === 'no') {
    return {
      ok: true,
      data: { attending: 'no', guestCount: 0, attendingGuests: [], guestMeals: {}, plusOnes: [] },
    };
  }

  const knownIds = new Set(ctx.guestIds);
  const rawAttending: unknown[] = Array.isArray(body?.attendingGuests) ? body.attendingGuests : [];
  const attendingGuests = [
    ...new Set(rawAttending.filter((id): id is string => typeof id === 'string' && knownIds.has(id))),
  ];

  const guestMeals = pruneGuestMeals(body?.guestMeals, attendingGuests);

  const rawPlusOnes = Array.isArray(body?.plusOnes) ? body.plusOnes : [];
  const plusOnes = rawPlusOnes
    .filter((p: any) => p && typeof p.name === 'string' && p.name.trim())
    .map((p: any) => ({ name: p.name.trim(), meal: typeof p.meal === 'string' ? p.meal : '' }));
  if (plusOnes.length > 0 && !ctx.plusOnesEnabled) {
    return { ok: false, error: 'Additional guests are not enabled for this event.' };
  }
  if (plusOnes.length > ctx.plusOnesAllowed) {
    return { ok: false, error: `This invitation allows up to ${ctx.plusOnesAllowed} additional guest${ctx.plusOnesAllowed === 1 ? '' : 's'}.` };
  }

  let guestCount: number;
  if (attendingGuests.length > 0 || plusOnes.length > 0) {
    // Per-guest mode: the count is what was actually selected, not whatever
    // number the client happened to send.
    guestCount = attendingGuests.length + plusOnes.length;
  } else {
    const raw = Number(body?.guestCount);
    guestCount = Number.isFinite(raw) ? Math.floor(raw) : 0;
    const limit = ctx.maxGuests + ctx.plusOnesAllowed;
    if (guestCount > limit) {
      return { ok: false, error: `This invitation allows up to ${limit} guest${limit === 1 ? '' : 's'}.` };
    }
  }
  if (guestCount < 1) {
    return { ok: false, error: 'Please select at least one attendee, or decline.' };
  }

  return { ok: true, data: { attending: 'yes', guestCount, attendingGuests, guestMeals, plusOnes } };
}
