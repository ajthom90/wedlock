// Pure people-count helpers for RSVP invitations. Used by the admin RSVPs
// page so household cards, the attending/declined stat totals, and list-row
// badges all agree. No React/Prisma — structural types only.

export interface RsvpCountsInvitation {
  guests: { id: string }[];
  plusOnesAllowed: number;
  response: {
    attending: string; // 'yes' | 'no'
    guestCount: number;
    attendingGuests: string | null; // JSON string[] of guest IDs
    plusOnes: string | null; // JSON [{ name, meal? }]
    plusOneName?: string | null; // legacy single plus-one column
  } | null | undefined;
}

export interface RsvpPeopleCounts {
  attending: number; // people coming
  declined: number; // people not coming
}

function parseJsonArray(raw: string | null | undefined): unknown[] | null {
  if (raw == null || raw === '') return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Named plus-ones coming. JSON wins over legacy plusOneName — never both. */
function countNamedPlusOnes(response: NonNullable<RsvpCountsInvitation['response']>): number {
  // Malformed JSON is treated as null so legacy can still apply.
  const parsed = parseJsonArray(response.plusOnes);
  if (parsed !== null) {
    return parsed.filter(
      (p): p is { name: string } =>
        !!p &&
        typeof p === 'object' &&
        typeof (p as { name?: unknown }).name === 'string' &&
        (p as { name: string }).name.trim() !== '',
    ).length;
  }
  // plusOnes null/absent/malformed → fall back to legacy single column
  const legacy = response.plusOneName;
  if (typeof legacy === 'string' && legacy.trim() !== '') return 1;
  return 0;
}

export function countRsvpPeople(inv: RsvpCountsInvitation): RsvpPeopleCounts {
  const potential = inv.guests.length + inv.plusOnesAllowed;
  const response = inv.response;

  if (!response) {
    return { attending: 0, declined: 0 };
  }

  // Full decline: every named guest + every plus-one allowance counts as declined
  if (response.attending !== 'yes') {
    return { attending: 0, declined: potential };
  }

  const namedPlus = countNamedPlusOnes(response);
  const roster = parseJsonArray(response.attendingGuests);

  // Roster mode: attendingGuests parses to an array (even empty)
  if (roster !== null) {
    const ids = [
      ...new Set(roster.filter((id): id is string => typeof id === 'string')),
    ];
    const idSet = new Set(ids);
    const attending = ids.length + namedPlus;
    const declinedGuests = inv.guests.filter((g) => !idSet.has(g.id)).length;
    const declinedPlus = Math.max(0, inv.plusOnesAllowed - Math.min(namedPlus, inv.plusOnesAllowed));
    return { attending, declined: declinedGuests + declinedPlus };
  }

  // Numeric fallback: no usable roster (null or unparseable)
  const rawCount = Number.isFinite(response.guestCount) ? response.guestCount : 0;
  const attending = Math.max(0, Math.floor(rawCount), namedPlus);
  const declined = Math.max(0, potential - attending);
  return { attending, declined };
}
