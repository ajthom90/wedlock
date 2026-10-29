import { describe, it, expect } from 'vitest';
import {
  carryOverPlusOneNeeds,
  childSeatLabel,
  householdDietaryFallback,
  parseChildSeat,
  parseGuestDietary,
  pruneGuestDietary,
} from './guestNeeds';

describe('parseChildSeat / childSeatLabel', () => {
  it('accepts only the two known seats', () => {
    expect(parseChildSeat('high_chair')).toBe('high_chair');
    expect(parseChildSeat('booster')).toBe('booster');
    expect(parseChildSeat('')).toBeNull();
    expect(parseChildSeat('car_seat')).toBeNull();
    expect(parseChildSeat(null)).toBeNull();
    expect(childSeatLabel('high_chair')).toBe('High chair');
    expect(childSeatLabel(null)).toBe('');
  });
});

describe('pruneGuestDietary', () => {
  it('drops non-attending, blank and non-string notes', () => {
    expect(pruneGuestDietary({ a: ' nuts ', b: 'fish', c: '  ', d: 5 }, ['a', 'c', 'd'])).toEqual({ a: 'nuts' });
    expect(pruneGuestDietary('nope', ['a'])).toEqual({});
  });

  it('caps very long notes', () => {
    expect(pruneGuestDietary({ a: 'x'.repeat(1000) }, ['a']).a).toHaveLength(300);
  });
});

describe('parseGuestDietary', () => {
  it('tolerates bad JSON and non-string values', () => {
    expect(parseGuestDietary(null)).toEqual({});
    expect(parseGuestDietary('{oops')).toEqual({});
    expect(parseGuestDietary(JSON.stringify({ a: 'nuts', b: 3, c: ' ' }))).toEqual({ a: 'nuts' });
  });
});

describe('householdDietaryFallback', () => {
  it('gives a legacy note to the only attendee', () => {
    expect(householdDietaryFallback({ householdNote: 'no nuts', attendeeCount: 1, soleAttendeeHasOwnNote: false }))
      .toEqual({ soleAttendeeNote: 'no nuts', unassignedNote: '' });
  });

  it("lets the only attendee's own note replace the legacy one", () => {
    expect(householdDietaryFallback({ householdNote: 'no nuts', attendeeCount: 1, soleAttendeeHasOwnNote: true }))
      .toEqual({ soleAttendeeNote: '', unassignedNote: '' });
  });

  it('keeps a legacy note shared by several attendees until it is cleared', () => {
    expect(householdDietaryFallback({ householdNote: 'Bob: no shellfish', attendeeCount: 3, soleAttendeeHasOwnNote: false }))
      .toEqual({ soleAttendeeNote: '', unassignedNote: 'Bob: no shellfish' });
    expect(householdDietaryFallback({ householdNote: '  ', attendeeCount: 3, soleAttendeeHasOwnNote: false }))
      .toEqual({ soleAttendeeNote: '', unassignedNote: '' });
  });
});

describe('carryOverPlusOneNeeds', () => {
  it('keeps the couple-set seat by name and ignores what the guest sent', () => {
    const stored = JSON.stringify([{ name: 'Baby Lee', meal: '', childSeat: 'high_chair' }, { name: 'Pat', meal: 'Fish' }]);
    expect(carryOverPlusOneNeeds([
      { name: 'baby lee', meal: 'Kids' },
      { name: 'Pat', meal: 'Fish', childSeat: 'booster' as const },
    ], stored)).toEqual([
      { name: 'baby lee', meal: 'Kids', childSeat: 'high_chair' },
      { name: 'Pat', meal: 'Fish' },
    ]);
  });

  it('handles nothing stored', () => {
    expect(carryOverPlusOneNeeds([{ name: 'Pat', meal: '' }], null)).toEqual([{ name: 'Pat', meal: '' }]);
  });

  it('follows a renamed plus-one by position', () => {
    const stored = JSON.stringify([{ name: 'Ava', childSeat: 'high_chair' }, { name: 'Pat' }]);
    expect(carryOverPlusOneNeeds([{ name: 'Eva', meal: '' }, { name: 'Pat', meal: '' }], stored)).toEqual([
      { name: 'Eva', meal: '', childSeat: 'high_chair' },
      { name: 'Pat', meal: '' },
    ]);
  });

  it("doesn't follow by position when the old name is still in the list", () => {
    const stored = JSON.stringify([{ name: 'Ava', childSeat: 'high_chair' }]);
    expect(carryOverPlusOneNeeds([{ name: 'Sam', meal: '' }, { name: 'Ava', meal: '' }], stored)).toEqual([
      { name: 'Sam', meal: '' },
      { name: 'Ava', meal: '', childSeat: 'high_chair' },
    ]);
  });

  it('keeps stored allergies only when asked to', () => {
    const stored = JSON.stringify([{ name: 'Pat', dietary: 'Peanuts' }]);
    expect(carryOverPlusOneNeeds([{ name: 'Pat', meal: '', dietary: 'new' }], stored)).toEqual([{ name: 'Pat', meal: '', dietary: 'new' }]);
    expect(carryOverPlusOneNeeds([{ name: 'Pat', meal: '' }], stored, { keepDietary: true })).toEqual([{ name: 'Pat', meal: '', dietary: 'Peanuts' }]);
    expect(carryOverPlusOneNeeds([{ name: 'Sam', meal: '', dietary: 'x' }, { name: 'Pat', meal: '' }], stored, { keepDietary: true }))
      .toEqual([{ name: 'Sam', meal: '' }, { name: 'Pat', meal: '', dietary: 'Peanuts' }]);
  });
});
