// Choices on an RsvpOption used to be a plain string[]. We now store
// { name, description? } per choice so the public RSVP form can show
// meal descriptions, but legacy data still lives in the DB. This helper
// parses either shape and always emits the object form.
export type RsvpChoice = { name: string; description?: string };

export function parseRsvpChoices(raw: string | null | undefined): RsvpChoice[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((c: unknown): RsvpChoice | null => {
        if (typeof c === 'string') {
          const name = c.trim();
          return name ? { name } : null;
        }
        if (c && typeof c === 'object') {
          const record = c as { name?: unknown; description?: unknown };
          const name = typeof record.name === 'string' ? record.name.trim() : '';
          if (!name) return null;
          const description = typeof record.description === 'string' ? record.description.trim() : '';
          return description ? { name, description } : { name };
        }
        return null;
      })
      .filter((c): c is RsvpChoice => c !== null);
  } catch {
    return [];
  }
}
