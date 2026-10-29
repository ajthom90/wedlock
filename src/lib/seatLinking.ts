// Seats used to store only a guest's name, so renaming a guest left their
// seat pointing at nobody. Seats now link to the Guest row (guestId); this
// works out the links for seats saved before that, by name. Pure — the
// one-time run against the database lives in seatLinkingDb.ts.
//
// Matching, in order (each pass only claims guests no earlier link took):
//   1. exact name on the seat's own invitation;
//   2. a plus-one of the seat's invitation with that name stays a plus-one
//      seat (plus-ones have no Guest row to link to);
//   3. renamed on the seat's own invitation: one name is the other plus more
//      words ("Daryl" → "Daryl Steffen"), when exactly one guest fits;
//   4. for a seat with no invitation (or one since deleted), an exact name on
//      any invitation, when exactly one guest has it.
// Anything left is flagged, never dropped: it keeps its table and name and
// shows on the admin Seating page for the couple to link or remove.

export interface SeatToLink {
  id: string;
  guestName: string;
  invitationId: string | null;
  guestId: string | null;
}

export interface GuestForLinking {
  id: string;
  name: string;
  invitationId: string;
}

export type LinkHow = 'exact' | 'renamed' | 'exact-other-invitation';
export type FlagReason = 'no-match' | 'already-seated' | 'ambiguous';

export interface SeatLinkPlan {
  links: { seatId: string; guestId: string; how: LinkHow }[];
  plusOnes: string[]; // seat ids kept as plus-one seats
  flagged: { seatId: string; guestName: string; reason: FlagReason }[];
}

export const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

const plusOneKey = (invitationId: string | null, name: string) => `${invitationId ?? ''}|${normName(name)}`;

/** One name is the other with more words after it ("daryl" / "daryl steffen"). */
function isWordPrefix(a: string, b: string): boolean {
  if (a === b || !a || !b) return false;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return long.startsWith(`${short} `);
}

export function planSeatLinks(
  seats: SeatToLink[],
  guests: GuestForLinking[],
  // Plus-ones by invitation, from RsvpResponse.plusOnes / plusOneName.
  plusOnes: { invitationId: string; name: string }[],
): SeatLinkPlan {
  const taken = new Set(seats.map((s) => s.guestId).filter((id): id is string => Boolean(id)));
  const plusOneKeys = new Set(plusOnes.map((p) => plusOneKey(p.invitationId, p.name)));
  const plan: SeatLinkPlan = { links: [], plusOnes: [], flagged: [] };
  const done = new Set<string>();
  // Set when a seat only failed because its guest was already claimed, or
  // because more than one guest fit; anything else is simply unmatched.
  const why = new Map<string, FlagReason>();

  const pending = () => seats.filter((s) => !s.guestId && !done.has(s.id));
  const link = (seat: SeatToLink, guestId: string, how: LinkHow) => {
    plan.links.push({ seatId: seat.id, guestId, how });
    taken.add(guestId);
    done.add(seat.id);
  };
  // Returns the one free guest that fits, noting why when there isn't one.
  const pick = (seat: SeatToLink, fits: GuestForLinking[]): GuestForLinking | null => {
    const free = fits.filter((g) => !taken.has(g.id));
    if (free.length === 1) return free[0];
    if (free.length > 1) why.set(seat.id, 'ambiguous');
    else if (fits.length > 0 && !why.has(seat.id)) why.set(seat.id, 'already-seated');
    return null;
  };

  // 1. Exact name, same invitation.
  for (const seat of pending()) {
    if (!seat.invitationId) continue;
    const key = normName(seat.guestName);
    const g = pick(seat, guests.filter((x) => x.invitationId === seat.invitationId && normName(x.name) === key));
    if (g) link(seat, g.id, 'exact');
  }

  // 2. Plus-ones stay as they are.
  for (const seat of pending()) {
    if (plusOneKeys.has(plusOneKey(seat.invitationId, seat.guestName))) {
      plan.plusOnes.push(seat.id);
      done.add(seat.id);
      why.delete(seat.id);
    }
  }

  // 3. Renamed within the seat's own invitation. Skipped when the seat's
  // exact name is on its invitation but already taken (a duplicate seat).
  for (const seat of pending()) {
    if (!seat.invitationId || why.has(seat.id)) continue;
    const key = normName(seat.guestName);
    const g = pick(seat, guests.filter((x) => x.invitationId === seat.invitationId && isWordPrefix(key, normName(x.name))));
    if (g) link(seat, g.id, 'renamed');
  }

  // 4. Seats saved without an invitation (or whose invitation is gone): an
  // exact name anywhere, only when exactly one free guest has it. A seat on a
  // known invitation never jumps to another household.
  const knownInvitations = new Set([...guests.map((g) => g.invitationId), ...plusOnes.map((p) => p.invitationId)]);
  for (const seat of pending()) {
    if (seat.invitationId && knownInvitations.has(seat.invitationId)) continue;
    if (why.has(seat.id)) continue;
    const key = normName(seat.guestName);
    const g = pick(seat, guests.filter((x) => normName(x.name) === key));
    if (g) link(seat, g.id, 'exact-other-invitation');
  }

  for (const seat of pending()) {
    plan.flagged.push({ seatId: seat.id, guestName: seat.guestName, reason: why.get(seat.id) ?? 'no-match' });
  }
  return plan;
}

/**
 * Whether a seat with no guest link is a plus-one's (fine) rather than one
 * that lost its guest (flagged). Used by the admin Seating page.
 */
export function isPlusOneSeat(
  seat: { guestName: string; invitationId: string | null; guestId?: string | null },
  plusOnes: { invitationId: string; name: string }[],
): boolean {
  if (seat.guestId) return false;
  const key = plusOneKey(seat.invitationId, seat.guestName);
  return plusOnes.some((p) => plusOneKey(p.invitationId, p.name) === key);
}

/** Plus-ones on an RSVP, whether stored as the plusOnes list or the older single plusOneName. */
export function plusOnesOf(inv: {
  id: string;
  response: { plusOnes: string | null; plusOneName?: string | null } | null;
}): { invitationId: string; name: string }[] {
  const r = inv.response;
  if (!r) return [];
  let list: unknown = null;
  try { list = r.plusOnes ? JSON.parse(r.plusOnes) : null; } catch { list = null; }
  if (Array.isArray(list)) {
    return list
      .map((p) => (p && typeof p === 'object' ? (p as { name?: unknown }).name : null))
      .filter((n): n is string => typeof n === 'string' && Boolean(n.trim()))
      .map((name) => ({ invitationId: inv.id, name }));
  }
  return r.plusOneName?.trim() ? [{ invitationId: inv.id, name: r.plusOneName }] : [];
}
