import { describe, it, expect } from 'vitest';
import {
  carryOverPlusOneSeats,
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
    expect(householdDietaryFallback({ householdNote: 'no nuts', attendeeCount: 1, hasPerPersonNotes: false }))
      .toEqual({ soleAttendeeNote: 'no nuts', unassignedNote: '' });
  });

  it('flags a legacy note shared by several attendees', () => {
    expect(householdDietaryFallback({ householdNote: 'Bob: no shellfish', attendeeCount: 3, hasPerPersonNotes: false }))
      .toEqual({ soleAttendeeNote: '', unassignedNote: 'Bob: no shellfish' });
  });

  it('treats the note as reviewed once per-person notes exist', () => {
    expect(householdDietaryFallback({ householdNote: 'Bob: no shellfish', attendeeCount: 3, hasPerPersonNotes: true }))
      .toEqual({ soleAttendeeNote: '', unassignedNote: '' });
  });
});

describe('carryOverPlusOneSeats', () => {
  it('keeps the couple-set seat by name and ignores what the guest sent', () => {
    const stored = JSON.stringify([{ name: 'Baby Lee', meal: '', childSeat: 'high_chair' }, { name: 'Pat', meal: 'Fish' }]);
    expect(carryOverPlusOneSeats([
      { name: 'baby lee', meal: 'Kids' },
      { name: 'Pat', meal: 'Fish', childSeat: 'booster' as const },
    ], stored)).toEqual([
      { name: 'baby lee', meal: 'Kids', childSeat: 'high_chair' },
      { name: 'Pat', meal: 'Fish' },
    ]);
  });

  it('handles nothing stored', () => {
    expect(carryOverPlusOneSeats([{ name: 'Pat', meal: '' }], null)).toEqual([{ name: 'Pat', meal: '' }]);
  });
});
