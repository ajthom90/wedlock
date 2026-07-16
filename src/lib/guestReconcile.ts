// Reconcile an invitation's Guest rows against an edited guest list WITHOUT
// deleting rows that survived the edit. Guest IDs are referenced by
// RsvpResponse.attendingGuests / guestMeals (JSON), so a delete-and-recreate
// orphans any existing RSVP. Matching strategy:
//   1. exact-name match — a name that still appears keeps its row even if it
//      moved position (covers reorders);
//   2. explicit-id match — the admin UI sends each edit row's original guest
//      id, so a renamed row keeps its identity (covers typo fixes);
//   3. anything still unmatched is created/deleted. Deliberately NO positional
//      guessing: pairing leftover names with leftover rows would silently
//      transfer a removed guest's RSVP attendance/meal to an unrelated new
//      person added in the same edit.
// The first incoming name is the household's primary contact, and `order`
// records the entered position so lists round-trip.

export interface ExistingGuest {
  id: string;
  name: string;
}

export interface IncomingGuest {
  id?: string | null;
  name: string;
}

export interface GuestOps {
  update: { id: string; name: string; isPrimary: boolean; order: number }[];
  create: { name: string; isPrimary: boolean; order: number }[];
  deleteIds: string[];
}

export function reconcileGuests(existing: ExistingGuest[], incoming: IncomingGuest[]): GuestOps {
  const assigned = new Map<number, string>(); // incoming index -> existing id
  const usedIds = new Set<string>();
  const existingIds = new Set(existing.map((g) => g.id));

  // Pass 1: exact-name matches keep their rows.
  for (let i = 0; i < incoming.length; i++) {
    const match = existing.find((g) => !usedIds.has(g.id) && g.name === incoming[i].name);
    if (match) {
      assigned.set(i, match.id);
      usedIds.add(match.id);
    }
  }

  // Pass 2: explicit id matches (renames of a known row).
  for (let i = 0; i < incoming.length; i++) {
    if (assigned.has(i)) continue;
    const id = incoming[i].id;
    if (id && existingIds.has(id) && !usedIds.has(id)) {
      assigned.set(i, id);
      usedIds.add(id);
    }
  }

  const ops: GuestOps = { update: [], create: [], deleteIds: [] };
  for (let i = 0; i < incoming.length; i++) {
    const id = assigned.get(i);
    if (id) ops.update.push({ id, name: incoming[i].name, isPrimary: i === 0, order: i });
    else ops.create.push({ name: incoming[i].name, isPrimary: i === 0, order: i });
  }
  ops.deleteIds = existing.filter((g) => !usedIds.has(g.id)).map((g) => g.id);
  return ops;
}
