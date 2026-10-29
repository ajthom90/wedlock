// Builds the caterer-style seating sheet: one row per seated guest with their
// table, meal choice, allergies and child seat, ordered by table name. Pure —
// no Prisma/ExcelJS — so the ordering and lookups can be unit-tested.

import { listAttendees, type Attendee, type AttendeeInvitation } from './attendees';
import { childSeatLabel, type ChildSeat } from './guestNeeds';

export interface SeatingExportAssignment {
  guestName: string;
  invitationId: string | null;
  // Set for a named guest's seat: the guest's current name comes from here,
  // so a rename keeps their row. Plus-ones (and seats flagged as unlinked)
  // have none and are matched by name on their invitation.
  guestId?: string | null;
  guest?: { name: string } | null;
}

export interface SeatingExportTable {
  name: string;
  assignments: SeatingExportAssignment[];
}

export type SeatingExportInvitation = AttendeeInvitation;

export interface SeatingExportRow {
  guestName: string;
  table: string;
  meal: string;
  dietary: string;
  childSeat: string;
}

// Same rows with the raw pieces kept apart, for callers (name tents) that lay
// them out themselves instead of as spreadsheet cells.
export interface SeatedGuest {
  guestName: string;
  table: string;
  meal: string;
  dietary: string;            // this person's own allergies / dietary needs
  householdDietary: string;   // pre-per-guest household note nobody's been assigned yet
  childSeat: ChildSeat | null;
  invitationId: string | null;
  // A seat that isn't linked to a guest and isn't a plus-one's: it lost its
  // guest (see seatLinking.ts) and needs fixing on the Seating page.
  unlinked: boolean;
}

export const UNASSIGNED_TABLE = 'Unassigned';

const norm = (s: string) => s.trim().toLowerCase();

/** Plain alphabetical, so zero-padded prefixes ("00. Head Table", "01. …") set the order. */
export function compareTableNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export function resolveSeatedGuests(
  tables: SeatingExportTable[],
  invitations: SeatingExportInvitation[],
): SeatedGuest[] {
  const resolved = invitations.map(listAttendees);
  const attendees = resolved.flatMap((r) => r.attendees);
  const householdNote = new Map(invitations.map((inv, i) => [inv.id, resolved[i].unassignedDietary]));
  const byGuestId = new Map(attendees.filter((a) => a.guestId).map((a) => [a.guestId!, a]));

  // Who already has a seat: named guests by id, plus-ones by household + name.
  const seatedIds = new Set<string>();
  const seatedPlusOnes = new Set<string>();
  const plusOneKey = (invitationId: string | null, name: string) => `${invitationId ?? ''}|${norm(name)}`;
  const markSeated = (a: Attendee) => {
    if (a.guestId) seatedIds.add(a.guestId);
    else seatedPlusOnes.add(plusOneKey(a.invitationId, a.name));
  };
  const isSeated = (a: Attendee) => (a.guestId ? seatedIds.has(a.guestId) : seatedPlusOnes.has(plusOneKey(a.invitationId, a.name)));
  for (const t of tables) for (const a of t.assignments) if (a.guestId) seatedIds.add(a.guestId);

  // A seat with no guest link: a plus-one, or a seat that predates links. It
  // only claims someone not already seated by a link, on its own household
  // first, so it never borrows a linked guest's meal or allergies.
  const findByName = (guestName: string, invitationId: string | null) => {
    const key = norm(guestName);
    const free = attendees.filter((a) => norm(a.name) === key && !isSeated(a));
    return free.find((a) => a.invitationId === invitationId) ?? (invitationId ? undefined : free[0]);
  };
  const row = (guestName: string, table: string, match: Attendee | undefined, invitationId: string | null, unlinked = false): SeatedGuest => {
    const invId = match?.invitationId ?? invitationId;
    return {
      unlinked,
      guestName,
      table,
      meal: match?.meal ?? '',
      dietary: match?.dietary ?? '',
      householdDietary: (invId && householdNote.get(invId)) || '',
      childSeat: match?.childSeat ?? null,
      invitationId: invId,
    };
  };

  const rows: SeatedGuest[] = [];
  const sorted = [...tables].sort((a, b) => compareTableNames(a.name, b.name));
  for (const table of sorted) {
    for (const a of table.assignments) {
      // A linked guest who isn't coming (declined, or unticked on the RSVP)
      // still keeps their seat, with no meal.
      const match = a.guestId ? byGuestId.get(a.guestId) : findByName(a.guestName, a.invitationId);
      if (match) markSeated(match);
      const name = a.guest?.name ?? match?.name ?? a.guestName;
      rows.push(row(name, table.name, match, a.invitationId, !a.guestId && match?.kind !== 'plus-one'));
    }
  }

  // Attending guests who haven't been given a seat yet go at the bottom so the
  // list the caterer gets doesn't silently drop anyone.
  for (const a of attendees) {
    if (isSeated(a)) continue;
    markSeated(a);
    rows.push(row(a.name, UNASSIGNED_TABLE, a, a.invitationId));
  }
  return rows;
}

export function buildSeatingExportRows(
  tables: SeatingExportTable[],
  invitations: SeatingExportInvitation[],
): SeatingExportRow[] {
  return resolveSeatedGuests(tables, invitations).map((g) => ({
    guestName: g.guestName,
    table: g.table,
    meal: g.meal,
    // A household note that hasn't been split per person yet still reaches
    // the caterer, labelled so it isn't mistaken for this guest's own.
    dietary: [g.dietary, g.householdDietary && `Household: ${g.householdDietary}`].filter(Boolean).join('; '),
    childSeat: childSeatLabel(g.childSeat),
  }));
}
