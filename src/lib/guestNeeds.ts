// Per-person needs that matter at the table: a high chair / booster seat and
// allergies or dietary restrictions. Pure helpers shared by the RSVP routes,
// admin pages, seating export and name tents — no React/Prisma.
//
// Where each piece lives:
//   - Guest.childSeat             — named guests, set by the couple
//   - plusOnes[].childSeat        — plus-ones, set by the couple on the RSVP editor
//   - RsvpResponse.guestDietary   — JSON { [guestId]: text } for named guests
//   - plusOnes[].dietary          — plus-ones
//   - RsvpResponse.dietaryNotes   — the pre-2.19 household-wide note. Kept as
//     is; see householdDietaryFallback for how it's read now.

export type ChildSeat = 'high_chair' | 'booster';

export const CHILD_SEAT_OPTIONS: { value: ChildSeat; label: string }[] = [
  { value: 'high_chair', label: 'High chair' },
  { value: 'booster', label: 'Booster seat' },
];

/** Coerce anything stored or submitted into a known seat value, or null. */
export function parseChildSeat(raw: unknown): ChildSeat | null {
  return raw === 'high_chair' || raw === 'booster' ? raw : null;
}

export function childSeatLabel(seat: unknown): string {
  return CHILD_SEAT_OPTIONS.find((o) => o.value === seat)?.label ?? '';
}

// Long enough for a real allergy list, short enough that a tampered request
// can't stuff the DB.
export const MAX_DIETARY_LENGTH = 300;

export function cleanDietary(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_DIETARY_LENGTH) : '';
}

/** Keep only attending guests' non-empty notes, trimmed. */
export function pruneGuestDietary(raw: unknown, attendingGuestIds: string[]): Record<string, string> {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const attending = new Set(attendingGuestIds);
  const kept: Record<string, string> = {};
  for (const [id, note] of Object.entries(raw)) {
    const clean = cleanDietary(note);
    if (attending.has(id) && clean) kept[id] = clean;
  }
  return kept;
}

export function parseGuestDietary(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== ''),
    );
  } catch {
    return {};
  }
}

// RSVPs saved before per-guest allergies have one household-wide note. It
// isn't copied onto every person — "Bob: no shellfish" on Ann's name tent is
// wrong — so it's read like this instead:
//   - one attendee → the note is theirs (unless they've since entered their
//     own, which replaces it);
//   - more than one → it stays a household note until someone clears it.
//     The RSVPs page flags it for review, and lists that show allergies per
//     person show it as "Household: …" so it's never silently dropped.
// The public form clears it once the guest has re-entered allergies per
// person; the admin editor asks the couple to split it and clear it.
export function householdDietaryFallback(args: {
  householdNote: string | null | undefined;
  attendeeCount: number;
  soleAttendeeHasOwnNote: boolean;
}): { soleAttendeeNote: string; unassignedNote: string } {
  const note = args.householdNote?.trim() ?? '';
  if (!note) return { soleAttendeeNote: '', unassignedNote: '' };
  if (args.attendeeCount === 1) {
    return { soleAttendeeNote: args.soleAttendeeHasOwnNote ? '' : note, unassignedNote: '' };
  }
  return { soleAttendeeNote: '', unassignedNote: note };
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Plus-ones are re-sent whole on every guest RSVP update, but child seats on
 * them are set only by the couple. Carry each stored seat over to the
 * submitted plus-one with the same name so a guest's resubmit can't wipe it.
 */
export function carryOverPlusOneSeats<T extends { name: string }>(
  submitted: T[],
  storedRaw: string | null | undefined,
): (T & { childSeat?: ChildSeat })[] {
  let stored: unknown[] = [];
  try {
    const parsed = storedRaw ? JSON.parse(storedRaw) : [];
    stored = Array.isArray(parsed) ? parsed : [];
  } catch {
    stored = [];
  }
  const seatByName = new Map<string, ChildSeat>();
  for (const p of stored) {
    const { name, childSeat } = (p ?? {}) as { name?: unknown; childSeat?: unknown };
    const seat = parseChildSeat(childSeat);
    if (typeof name === 'string' && seat) seatByName.set(norm(name), seat);
  }
  return submitted.map((p) => {
    const { childSeat: _ignored, ...rest } = p as T & { childSeat?: unknown };
    const seat = seatByName.get(norm(p.name));
    return (seat ? { ...rest, childSeat: seat } : rest) as T & { childSeat?: ChildSeat };
  });
}
