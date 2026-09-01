// Pure meal-choice helpers for RSVP invitations. Defines what a countable
// meal is (read side) and how to drop meals for guests who are not attending
// (write side). No React/Prisma — structural types only.

export interface RsvpMealsInvitation {
  guests: { id: string }[];
  response: {
    attending: string; // 'yes' | 'no'
    attendingGuests: string | null; // JSON string[] of guest IDs
    guestMeals: string | null; // JSON { [guestId]: meal }
    plusOnes: string | null; // JSON [{ name, meal }]
    plusOneName?: string | null; // legacy single plus-one columns
    plusOneMeal?: string | null;
  } | null | undefined;
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

function parseGuestMealsMap(raw: string | null | undefined): Record<string, unknown> | null {
  if (raw == null || raw === '') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isCountableMeal(meal: unknown): meal is string {
  return typeof meal === 'string' && meal.trim() !== '';
}

/** Keep only entries whose key is in attendingGuestIds and whose value is a non-empty string. */
export function pruneGuestMeals(guestMeals: unknown, attendingGuestIds: string[]): Record<string, string> {
  if (guestMeals == null || typeof guestMeals !== 'object' || Array.isArray(guestMeals)) {
    return {};
  }
  const attending = new Set(attendingGuestIds);
  const kept: Record<string, string> = {};
  for (const [id, meal] of Object.entries(guestMeals)) {
    if (attending.has(id) && typeof meal === 'string' && meal !== '') {
      kept[id] = meal;
    }
  }
  return kept;
}

/** Meal label → count across attending households. */
export function countMealChoices(invitations: RsvpMealsInvitation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  const bump = (meal: string) => {
    const label = meal.trim();
    counts[label] = (counts[label] || 0) + 1;
  };

  for (const inv of invitations) {
    const response = inv.response;
    if (!response || response.attending !== 'yes') continue;

    const liveIds = new Set(inv.guests.map((g) => g.id));
    const roster = parseJsonArray(response.attendingGuests);
    const rosterIds =
      roster === null
        ? null
        : new Set(roster.filter((id): id is string => typeof id === 'string'));

    const meals = parseGuestMealsMap(response.guestMeals);
    if (meals) {
      for (const [guestId, meal] of Object.entries(meals)) {
        if (!liveIds.has(guestId)) continue;
        if (rosterIds !== null && !rosterIds.has(guestId)) continue;
        if (isCountableMeal(meal)) bump(meal);
      }
    }

    const pluses = parseJsonArray(response.plusOnes);
    if (pluses !== null) {
      for (const p of pluses) {
        if (!p || typeof p !== 'object') continue;
        const { name, meal } = p as { name?: unknown; meal?: unknown };
        if (typeof name === 'string' && name.trim() !== '' && isCountableMeal(meal)) {
          bump(meal);
        }
      }
    } else {
      const legacyName = response.plusOneName;
      const legacyMeal = response.plusOneMeal;
      if (typeof legacyName === 'string' && legacyName.trim() !== '' && isCountableMeal(legacyMeal)) {
        bump(legacyMeal);
      }
    }
  }

  return counts;
}
