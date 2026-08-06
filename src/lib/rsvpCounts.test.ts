import { describe, it, expect } from 'vitest';
import { countRsvpPeople, type RsvpCountsInvitation } from './rsvpCounts';

function inv(
  guests: string[],
  plusOnesAllowed: number,
  response: RsvpCountsInvitation['response'],
): RsvpCountsInvitation {
  return {
    guests: guests.map((id) => ({ id })),
    plusOnesAllowed,
    response,
  };
}

function yes(partial: {
  guestCount?: number;
  attendingGuests?: string | null;
  plusOnes?: string | null;
  plusOneName?: string | null;
}): NonNullable<RsvpCountsInvitation['response']> {
  return {
    attending: 'yes',
    guestCount: partial.guestCount ?? 0,
    attendingGuests: partial.attendingGuests ?? null,
    plusOnes: partial.plusOnes ?? null,
    plusOneName: partial.plusOneName,
  };
}

function no(partial: {
  guestCount?: number;
  attendingGuests?: string | null;
  plusOnes?: string | null;
  plusOneName?: string | null;
} = {}): NonNullable<RsvpCountsInvitation['response']> {
  return {
    attending: 'no',
    guestCount: partial.guestCount ?? 0,
    attendingGuests: partial.attendingGuests ?? null,
    plusOnes: partial.plusOnes ?? null,
    plusOneName: partial.plusOneName,
  };
}

describe('countRsvpPeople', () => {
  it('returns 0/0 for pending (no response)', () => {
    expect(countRsvpPeople(inv(['g1', 'g2'], 1, null))).toEqual({ attending: 0, declined: 0 });
    expect(countRsvpPeople(inv(['g1'], 0, undefined))).toEqual({ attending: 0, declined: 0 });
  });

  it('full decline: 3 guests + plusOnesAllowed 2 → 0 attending / 5 declined', () => {
    expect(countRsvpPeople(inv(['g1', 'g2', 'g3'], 2, no()))).toEqual({
      attending: 0,
      declined: 5,
    });
  });

  it('full decline: 0 guests, 0 allowance → 0 / 0', () => {
    expect(countRsvpPeople(inv([], 0, no()))).toEqual({ attending: 0, declined: 0 });
  });

  it('full decline ignores leftover guestCount/roster fields', () => {
    expect(
      countRsvpPeople(
        inv(
          ['g1', 'g2'],
          1,
          no({
            guestCount: 99,
            attendingGuests: JSON.stringify(['g1', 'g2']),
            plusOnes: JSON.stringify([{ name: 'Extra' }]),
            plusOneName: 'Sam',
          }),
        ),
      ),
    ).toEqual({ attending: 0, declined: 3 });
  });

  it('roster: 4 guests, 2 attending IDs, 0 allowance → 2 / 2', () => {
    expect(
      countRsvpPeople(
        inv(
          ['g1', 'g2', 'g3', 'g4'],
          0,
          yes({ attendingGuests: JSON.stringify(['g1', 'g2']), guestCount: 2 }),
        ),
      ),
    ).toEqual({ attending: 2, declined: 2 });
  });

  it('roster: all guests attending, 0 allowance → declined 0', () => {
    expect(
      countRsvpPeople(
        inv(
          ['g1', 'g2'],
          0,
          yes({ attendingGuests: JSON.stringify(['g1', 'g2']), guestCount: 2 }),
        ),
      ),
    ).toEqual({ attending: 2, declined: 0 });
  });

  it('roster: all attending, allowance 2, 0 named plus-ones → declined 2 (unused slots)', () => {
    expect(
      countRsvpPeople(
        inv(
          ['g1', 'g2'],
          2,
          yes({ attendingGuests: JSON.stringify(['g1', 'g2']), guestCount: 2, plusOnes: JSON.stringify([]) }),
        ),
      ),
    ).toEqual({ attending: 2, declined: 2 });
  });

  it('roster: all attending, allowance 2, 1 named plus-one → declined 1; attending includes plus-one', () => {
    expect(
      countRsvpPeople(
        inv(
          ['g1', 'g2'],
          2,
          yes({
            attendingGuests: JSON.stringify(['g1', 'g2']),
            guestCount: 3,
            plusOnes: JSON.stringify([{ name: 'Alex' }]),
          }),
        ),
      ),
    ).toEqual({ attending: 3, declined: 1 });
  });

  it('roster: 2 of 4 guests + 1 of 2 plus-ones → attending 3, declined 3', () => {
    expect(
      countRsvpPeople(
        inv(
          ['g1', 'g2', 'g3', 'g4'],
          2,
          yes({
            attendingGuests: JSON.stringify(['g1', 'g2']),
            guestCount: 3,
            plusOnes: JSON.stringify([{ name: 'Pat' }]),
          }),
        ),
      ),
    ).toEqual({ attending: 3, declined: 3 });
  });

  it('stale IDs: 2 current guests, attendingGuests has 1 valid + 2 stale → attending 3, declined 1', () => {
    expect(
      countRsvpPeople(
        inv(
          ['g1', 'g2'],
          0,
          yes({ attendingGuests: JSON.stringify(['g1', 'stale-a', 'stale-b']), guestCount: 3 }),
        ),
      ),
    ).toEqual({ attending: 3, declined: 1 });
  });

  it('legacy: plusOnes null, plusOneName "Sam" → counts 1 attending plus-one; unused slots reduced by 1', () => {
    expect(
      countRsvpPeople(
        inv(
          ['g1', 'g2'],
          2,
          yes({
            attendingGuests: JSON.stringify(['g1', 'g2']),
            guestCount: 3,
            plusOnes: null,
            plusOneName: 'Sam',
          }),
        ),
      ),
    ).toEqual({ attending: 3, declined: 1 });
  });

  it('legacy + JSON both set → JSON wins, no double count', () => {
    expect(
      countRsvpPeople(
        inv(
          ['g1'],
          2,
          yes({
            attendingGuests: JSON.stringify(['g1']),
            guestCount: 2,
            plusOnes: JSON.stringify([{ name: 'JSON Guest' }]),
            plusOneName: 'Legacy Guest',
          }),
        ),
      ),
    ).toEqual({ attending: 2, declined: 1 });
  });

  it('numeric: no roster, guestCount 3, 4 guests, allowance 1 → attending 3, declined 2', () => {
    expect(
      countRsvpPeople(inv(['g1', 'g2', 'g3', 'g4'], 1, yes({ guestCount: 3, attendingGuests: null }))),
    ).toEqual({ attending: 3, declined: 2 });
  });

  it('numeric: guestCount ≥ potential → declined clamps to 0, attending not clamped', () => {
    expect(
      countRsvpPeople(inv(['g1', 'g2'], 1, yes({ guestCount: 10, attendingGuests: null }))),
    ).toEqual({ attending: 10, declined: 0 });
  });

  it('numeric legacy guard: guestCount 2, plusOneName set, plusOnes null → attending 2 (max, not 3)', () => {
    expect(
      countRsvpPeople(
        inv(
          ['g1', 'g2'],
          1,
          yes({ guestCount: 2, attendingGuests: null, plusOnes: null, plusOneName: 'Sam' }),
        ),
      ),
    ).toEqual({ attending: 2, declined: 1 });
  });

  it('plus-ones only: guests [], 1 named plus-one, allowance 2 → attending 1, declined 1', () => {
    expect(
      countRsvpPeople(
        inv(
          [],
          2,
          yes({
            attendingGuests: JSON.stringify([]),
            guestCount: 1,
            plusOnes: JSON.stringify([{ name: 'Only Plus' }]),
          }),
        ),
      ),
    ).toEqual({ attending: 1, declined: 1 });
  });

  it('malformed JSON in attendingGuests/plusOnes → no throw, falls back sensibly', () => {
    // Bad attendingGuests → numeric fallback
    expect(
      countRsvpPeople(
        inv(['g1', 'g2'], 0, yes({ guestCount: 1, attendingGuests: '{not-json', plusOnes: null })),
      ),
    ).toEqual({ attending: 1, declined: 1 });

    // Bad plusOnes with null-like treatment: treat as null field → may use legacy
    expect(
      countRsvpPeople(
        inv(
          ['g1'],
          1,
          yes({
            attendingGuests: JSON.stringify(['g1']),
            guestCount: 1,
            plusOnes: 'not-json-either',
            plusOneName: null,
          }),
        ),
      ),
    ).toEqual({ attending: 1, declined: 1 });

    // Empty attendingGuests array is valid roster mode, not fallback
    expect(
      countRsvpPeople(
        inv(['g1', 'g2'], 0, yes({ guestCount: 99, attendingGuests: JSON.stringify([]) })),
      ),
    ).toEqual({ attending: 0, declined: 2 });
  });

  it('duplicate IDs in attendingGuests count once', () => {
    expect(
      countRsvpPeople(
        inv(
          ['g1', 'g2', 'g3'],
          0,
          yes({ attendingGuests: JSON.stringify(['g1', 'g1', 'g2', 'g2']), guestCount: 4 }),
        ),
      ),
    ).toEqual({ attending: 2, declined: 1 });
  });
});
