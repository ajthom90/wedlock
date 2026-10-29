// One list of the people actually coming on an invitation — named guests the
// household ticked plus any plus-ones — with each person's meal, allergies
// and child seat resolved. Shared by the seating export, name tents and the
// admin RSVPs page so they all agree on who has which need. Pure.

import { householdDietaryFallback, parseChildSeat, parseGuestDietary, type ChildSeat } from './guestNeeds';

export interface AttendeeInvitation {
  id: string;
  guests: { id: string; name: string; childSeat?: string | null }[];
  response: {
    attending: string;
    attendingGuests: string | null;
    guestMeals: string | null;
    guestDietary?: string | null;
    plusOnes: string | null;
    plusOneName?: string | null;
    plusOneMeal?: string | null;
    dietaryNotes: string | null;
  } | null;
}

export interface Attendee {
  invitationId: string;
  name: string;
  kind: 'guest' | 'plus-one';
  guestId: string | null; // null for plus-ones
  meal: string;
  dietary: string;
  childSeat: ChildSeat | null;
}

export interface InvitationAttendees {
  attendees: Attendee[];
  // A pre-per-guest household note that can't be pinned on one person. Lists
  // that show allergies per person should still surface it somewhere.
  unassignedDietary: string;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function listAttendees(inv: AttendeeInvitation): InvitationAttendees {
  const r = inv.response;
  if (!r || r.attending !== 'yes') return { attendees: [], unassignedDietary: '' };
  const meals = parseJson<Record<string, unknown>>(r.guestMeals, {});
  const dietary = parseGuestDietary(r.guestDietary);

  const out: Attendee[] = [];
  // No stored roster means an RSVP from before per-guest selection: everyone
  // on the invitation is coming.
  const ids = parseJson<unknown[]>(r.attendingGuests, inv.guests.map((g) => g.id));
  const byId = new Map(inv.guests.map((g) => [g.id, g]));
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== 'string') continue;
    const g = byId.get(id);
    if (!g) continue;
    out.push({
      invitationId: inv.id, name: g.name, kind: 'guest', guestId: g.id,
      meal: text(meals[id]), dietary: dietary[id] ?? '', childSeat: parseChildSeat(g.childSeat),
    });
  }

  const pluses = parseJson<unknown[] | null>(r.plusOnes, null);
  if (Array.isArray(pluses)) {
    for (const p of pluses) {
      const { name, meal, dietary: d, childSeat } = (p ?? {}) as Record<string, unknown>;
      if (typeof name !== 'string' || !name.trim()) continue;
      out.push({
        invitationId: inv.id, name, kind: 'plus-one', guestId: null,
        meal: text(meal), dietary: text(d), childSeat: parseChildSeat(childSeat),
      });
    }
  } else if (r.plusOneName?.trim()) {
    out.push({
      invitationId: inv.id, name: r.plusOneName, kind: 'plus-one', guestId: null,
      meal: text(r.plusOneMeal), dietary: '', childSeat: null,
    });
  }

  const { soleAttendeeNote, unassignedNote } = householdDietaryFallback({
    householdNote: r.dietaryNotes,
    attendeeCount: out.length,
    soleAttendeeHasOwnNote: out.length === 1 && Boolean(out[0].dietary),
  });
  if (soleAttendeeNote) out[0] = { ...out[0], dietary: soleAttendeeNote };
  return { attendees: out, unassignedDietary: unassignedNote };
}
