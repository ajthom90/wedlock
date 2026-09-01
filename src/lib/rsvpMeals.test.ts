import { describe, it, expect } from 'vitest';
import {
  pruneGuestMeals,
  countMealChoices,
  type RsvpMealsInvitation,
} from './rsvpMeals';

function inv(
  guests: string[],
  response: RsvpMealsInvitation['response'],
): RsvpMealsInvitation {
  return {
    guests: guests.map((id) => ({ id })),
    response,
  };
}

function yes(partial: {
  attendingGuests?: string | null;
  guestMeals?: string | null;
  plusOnes?: string | null;
  plusOneName?: string | null;
  plusOneMeal?: string | null;
}): NonNullable<RsvpMealsInvitation['response']> {
  return {
    attending: 'yes',
    attendingGuests: partial.attendingGuests ?? null,
    guestMeals: partial.guestMeals ?? null,
    plusOnes: partial.plusOnes ?? null,
    plusOneName: partial.plusOneName,
    plusOneMeal: partial.plusOneMeal,
  };
}

function no(partial: {
  attendingGuests?: string | null;
  guestMeals?: string | null;
  plusOnes?: string | null;
} = {}): NonNullable<RsvpMealsInvitation['response']> {
  return {
    attending: 'no',
    attendingGuests: partial.attendingGuests ?? null,
    guestMeals: partial.guestMeals ?? null,
    plusOnes: partial.plusOnes ?? null,
  };
}

describe('pruneGuestMeals', () => {
  it('keeps attending IDs only; drops non-attending, unknown, non-string values, and empty strings', () => {
    expect(
      pruneGuestMeals(
        { g1: 'Beef', g2: 'Kids', unknown: 'Fish', g3: 12, g4: '', g5: null },
        ['g1', 'g4', 'g5', 'g3'],
      ),
    ).toEqual({ g1: 'Beef' });
  });

  it('returns {} when the attending list is empty', () => {
    expect(pruneGuestMeals({ g1: 'Beef' }, [])).toEqual({});
  });

  it("returns {} for non-object input ('nope', null, [])", () => {
    expect(pruneGuestMeals('nope', ['g1'])).toEqual({});
    expect(pruneGuestMeals(null, ['g1'])).toEqual({});
    expect(pruneGuestMeals([], ['g1'])).toEqual({});
  });
});

describe('countMealChoices', () => {
  it('Rose case: leftover meal for a non-attending household guest is not counted', () => {
    // guests g1,g2; attendingGuests: ["g1"]; guestMeals: {g1:"Beef", g2:"Kids"} → { Beef: 1 }
    expect(
      countMealChoices([
        inv(
          ['g1', 'g2'],
          yes({
            attendingGuests: JSON.stringify(['g1']),
            guestMeals: JSON.stringify({ g1: 'Beef', g2: 'Kids' }),
          }),
        ),
      ]),
    ).toEqual({ Beef: 1 });
  });

  it('ignores a removed-guest ID even when it appears in guestMeals and attendingGuests', () => {
    expect(
      countMealChoices([
        inv(
          ['g1'],
          yes({
            attendingGuests: JSON.stringify(['g1', 'removed']),
            guestMeals: JSON.stringify({ g1: 'Beef', removed: 'Kids' }),
          }),
        ),
      ]),
    ).toEqual({ Beef: 1 });
  });

  it('counts a named plus-one meal and ignores an unnamed plus-one with a meal', () => {
    expect(
      countMealChoices([
        inv(
          ['g1'],
          yes({
            attendingGuests: JSON.stringify(['g1']),
            guestMeals: JSON.stringify({ g1: 'Beef' }),
            plusOnes: JSON.stringify([
              { name: 'Pat', meal: 'Fish' },
              { name: '  ', meal: 'Kids' },
              { name: '', meal: 'Veg' },
            ]),
          }),
        ),
      ]),
    ).toEqual({ Beef: 1, Fish: 1 });
  });

  it('ignores empty-string and whitespace-only meals', () => {
    expect(
      countMealChoices([
        inv(
          ['g1', 'g2', 'g3'],
          yes({
            attendingGuests: JSON.stringify(['g1', 'g2', 'g3']),
            guestMeals: JSON.stringify({ g1: 'Beef', g2: '', g3: '   ' }),
            plusOnes: JSON.stringify([{ name: 'Pat', meal: '  ' }]),
          }),
        ),
      ]),
    ).toEqual({ Beef: 1 });
  });

  it('declined household contributes 0 even with leftover guestMeals', () => {
    expect(
      countMealChoices([
        inv(
          ['g1', 'g2'],
          no({
            attendingGuests: JSON.stringify(['g1']),
            guestMeals: JSON.stringify({ g1: 'Beef', g2: 'Kids' }),
            plusOnes: JSON.stringify([{ name: 'Pat', meal: 'Fish' }]),
          }),
        ),
      ]),
    ).toEqual({});
  });

  it('pending household contributes 0', () => {
    expect(countMealChoices([inv(['g1'], null)])).toEqual({});
    expect(countMealChoices([inv(['g1'], undefined)])).toEqual({});
  });

  it('sums the same meal label across two households', () => {
    expect(
      countMealChoices([
        inv(['g1'], yes({ attendingGuests: JSON.stringify(['g1']), guestMeals: JSON.stringify({ g1: 'Beef' }) })),
        inv(['g2'], yes({ attendingGuests: JSON.stringify(['g2']), guestMeals: JSON.stringify({ g2: 'Beef' }) })),
      ]),
    ).toEqual({ Beef: 2 });
  });

  it('roster [] (plus-ones only): guestMeals leftovers ignored, named plus-one meals counted', () => {
    expect(
      countMealChoices([
        inv(
          ['g1'],
          yes({
            attendingGuests: JSON.stringify([]),
            guestMeals: JSON.stringify({ g1: 'Beef' }),
            plusOnes: JSON.stringify([{ name: 'Pat', meal: 'Fish' }]),
          }),
        ),
      ]),
    ).toEqual({ Fish: 1 });
  });

  it('numeric fallback (attendingGuests null) counts live-ID guestMeals', () => {
    expect(
      countMealChoices([
        inv(
          ['g1', 'g2'],
          yes({
            attendingGuests: null,
            guestMeals: JSON.stringify({ g1: 'Beef', g2: 'Kids', gone: 'Veg' }),
          }),
        ),
      ]),
    ).toEqual({ Beef: 1, Kids: 1 });
  });

  it('malformed JSON in attendingGuests, guestMeals, or plusOnes does not throw; that source is skipped', () => {
    expect(() =>
      countMealChoices([
        inv(['g1'], yes({ attendingGuests: '{not-json', guestMeals: JSON.stringify({ g1: 'Beef' }) })),
      ]),
    ).not.toThrow();
    // malformed attendingGuests → numeric fallback, live-ID meals still count
    expect(
      countMealChoices([
        inv(['g1'], yes({ attendingGuests: '{not-json', guestMeals: JSON.stringify({ g1: 'Beef' }) })),
      ]),
    ).toEqual({ Beef: 1 });

    expect(() =>
      countMealChoices([
        inv(['g1'], yes({ attendingGuests: JSON.stringify(['g1']), guestMeals: '{not-json' })),
      ]),
    ).not.toThrow();
    expect(
      countMealChoices([
        inv(['g1'], yes({ attendingGuests: JSON.stringify(['g1']), guestMeals: '{not-json' })),
      ]),
    ).toEqual({});

    expect(() =>
      countMealChoices([
        inv(
          ['g1'],
          yes({
            attendingGuests: JSON.stringify(['g1']),
            guestMeals: JSON.stringify({ g1: 'Beef' }),
            plusOnes: 'not-json-either',
          }),
        ),
      ]),
    ).not.toThrow();
    expect(
      countMealChoices([
        inv(
          ['g1'],
          yes({
            attendingGuests: JSON.stringify(['g1']),
            guestMeals: JSON.stringify({ g1: 'Beef' }),
            plusOnes: 'not-json-either',
          }),
        ),
      ]),
    ).toEqual({ Beef: 1 });
  });

  it('legacy plusOneName/plusOneMeal counted when plusOnes is null; ignored when plusOnes is []', () => {
    expect(
      countMealChoices([
        inv(
          ['g1'],
          yes({
            attendingGuests: JSON.stringify(['g1']),
            guestMeals: JSON.stringify({ g1: 'Beef' }),
            plusOnes: null,
            plusOneName: 'Pat',
            plusOneMeal: 'Fish',
          }),
        ),
      ]),
    ).toEqual({ Beef: 1, Fish: 1 });

    expect(
      countMealChoices([
        inv(
          ['g1'],
          yes({
            attendingGuests: JSON.stringify(['g1']),
            guestMeals: JSON.stringify({ g1: 'Beef' }),
            plusOnes: JSON.stringify([]),
            plusOneName: 'Pat',
            plusOneMeal: 'Fish',
          }),
        ),
      ]),
    ).toEqual({ Beef: 1 });
  });
});
