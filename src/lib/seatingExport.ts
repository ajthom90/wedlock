// Builds the caterer-style seating sheet: one row per seated guest with their
// table, meal choice and dietary notes, ordered head table first. Pure — no
// Prisma/ExcelJS — so the ordering and meal lookup can be unit-tested.

export interface SeatingExportTable {
  name: string;
  assignments: { guestName: string; invitationId: string | null }[];
}

export interface SeatingExportInvitation {
  id: string;
  guests: { id: string; name: string }[];
  response: {
    attending: string;
    attendingGuests: string | null;
    guestMeals: string | null;
    plusOnes: string | null;
    plusOneName?: string | null;
    plusOneMeal?: string | null;
    dietaryNotes: string | null;
  } | null;
}

export interface SeatingExportRow {
  guestName: string;
  table: string;
  meal: string;
  dietary: string;
}

export const UNASSIGNED_TABLE = 'Unassigned';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

const norm = (s: string) => s.trim().toLowerCase();

/** Head table(s) first, then natural order so "Table 2" sorts before "Table 10". */
export function compareTableNames(a: string, b: string): number {
  const headA = /\bhead\b/i.test(a);
  const headB = /\bhead\b/i.test(b);
  if (headA !== headB) return headA ? -1 : 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

interface Attendee {
  name: string;
  meal: string;
  invitationId: string;
}

/** Every attending person on an invitation (named guests + plus-ones) with their meal. */
function attendeesOf(inv: SeatingExportInvitation): Attendee[] {
  const r = inv.response;
  if (!r || r.attending !== 'yes') return [];
  const meals = parseJson<Record<string, unknown>>(r.guestMeals, {});
  const mealFor = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const out: Attendee[] = [];
  const ids = parseJson<unknown[]>(r.attendingGuests, inv.guests.map((g) => g.id));
  const byId = new Map(inv.guests.map((g) => [g.id, g.name]));
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== 'string') continue;
    const name = byId.get(id);
    if (name) out.push({ name, meal: mealFor(meals[id]), invitationId: inv.id });
  }

  const pluses = parseJson<unknown[] | null>(r.plusOnes, null);
  if (Array.isArray(pluses)) {
    for (const p of pluses) {
      const { name, meal } = (p ?? {}) as { name?: unknown; meal?: unknown };
      if (typeof name === 'string' && name.trim()) out.push({ name, meal: mealFor(meal), invitationId: inv.id });
    }
  } else if (r.plusOneName?.trim()) {
    out.push({ name: r.plusOneName, meal: mealFor(r.plusOneMeal), invitationId: inv.id });
  }
  return out;
}

export function buildSeatingExportRows(
  tables: SeatingExportTable[],
  invitations: SeatingExportInvitation[],
): SeatingExportRow[] {
  const invById = new Map(invitations.map((inv) => [inv.id, inv]));
  const attendees = invitations.flatMap(attendeesOf);
  const dietaryFor = (invitationId: string | null) =>
    (invitationId && invById.get(invitationId)?.response?.dietaryNotes?.trim()) || '';

  const find = (guestName: string, invitationId: string | null) => {
    const key = norm(guestName);
    return (
      attendees.find((a) => a.invitationId === invitationId && norm(a.name) === key) ??
      attendees.find((a) => norm(a.name) === key)
    );
  };

  const rows: SeatingExportRow[] = [];
  const seated = new Set<string>();
  const sorted = [...tables].sort((a, b) => compareTableNames(a.name, b.name));
  for (const table of sorted) {
    for (const a of table.assignments) {
      const match = find(a.guestName, a.invitationId);
      seated.add(norm(a.guestName));
      rows.push({
        guestName: a.guestName,
        table: table.name,
        meal: match?.meal ?? '',
        dietary: dietaryFor(match?.invitationId ?? a.invitationId),
      });
    }
  }

  // Attending guests who haven't been given a seat yet go at the bottom so the
  // list the caterer gets doesn't silently drop anyone.
  for (const a of attendees) {
    if (seated.has(norm(a.name))) continue;
    seated.add(norm(a.name));
    rows.push({ guestName: a.name, table: UNASSIGNED_TABLE, meal: a.meal, dietary: dietaryFor(a.invitationId) });
  }
  return rows;
}
