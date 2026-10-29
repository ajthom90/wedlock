// Builds the caterer-style seating sheet: one row per seated guest with their
// table, meal choice, allergies and child seat, ordered by table name. Pure —
// no Prisma/ExcelJS — so the ordering and lookups can be unit-tested.

import { listAttendees, type Attendee, type AttendeeInvitation } from './attendees';
import { childSeatLabel, type ChildSeat } from './guestNeeds';

export interface SeatingExportTable {
  name: string;
  assignments: { guestName: string; invitationId: string | null }[];
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

  const find = (guestName: string, invitationId: string | null) => {
    const key = norm(guestName);
    return (
      attendees.find((a) => a.invitationId === invitationId && norm(a.name) === key) ??
      attendees.find((a) => norm(a.name) === key)
    );
  };
  const row = (guestName: string, table: string, match: Attendee | undefined, invitationId: string | null): SeatedGuest => {
    const invId = match?.invitationId ?? invitationId;
    return {
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
  const seated = new Set<string>();
  const sorted = [...tables].sort((a, b) => compareTableNames(a.name, b.name));
  for (const table of sorted) {
    for (const a of table.assignments) {
      seated.add(norm(a.guestName));
      rows.push(row(a.guestName, table.name, find(a.guestName, a.invitationId), a.invitationId));
    }
  }

  // Attending guests who haven't been given a seat yet go at the bottom so the
  // list the caterer gets doesn't silently drop anyone.
  for (const a of attendees) {
    if (seated.has(norm(a.name))) continue;
    seated.add(norm(a.name));
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
