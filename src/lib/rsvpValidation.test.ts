import { describe, it, expect } from 'vitest';
import { validateRsvpSubmission } from './rsvpValidation';

const ctx = {
  maxGuests: 2,
  plusOnesAllowed: 1,
  guestIds: ['g1', 'g2'],
  plusOnesEnabled: true,
};

describe('validateRsvpSubmission', () => {
  it('rejects unknown attending values', () => {
    for (const attending of [undefined, null, 'maybe', 1, true, '']) {
      const result = validateRsvpSubmission({ attending }, ctx);
      expect(result.ok).toBe(false);
    }
  });

  it('zeroes attendance fields on decline even if the client sent them', () => {
    const result = validateRsvpSubmission(
      {
        attending: 'no',
        guestCount: 2,
        attendingGuests: ['g1'],
        guestMeals: { g1: 'Beef' },
        plusOnes: [{ name: 'Extra', meal: 'Fish' }],
      },
      ctx,
    );
    expect(result).toEqual({
      ok: true,
      data: { attending: 'no', guestCount: 0, attendingGuests: [], guestMeals: {}, plusOnes: [] },
    });
  });

  it('accepts a normal per-guest submission and derives the count', () => {
    const result = validateRsvpSubmission(
      {
        attending: 'yes',
        guestCount: 99, // client value ignored when selections are present
        attendingGuests: ['g1', 'g2'],
        guestMeals: { g1: 'Beef', g2: 'Fish' },
        plusOnes: [{ name: '  Extra Guest ', meal: 'Veg' }],
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.guestCount).toBe(3);
    expect(result.data.attendingGuests).toEqual(['g1', 'g2']);
    expect(result.data.guestMeals).toEqual({ g1: 'Beef', g2: 'Fish' });
    expect(result.data.plusOnes).toEqual([{ name: 'Extra Guest', meal: 'Veg' }]);
  });

  it('filters attendingGuests to ids that belong to the invitation, and dedupes', () => {
    const result = validateRsvpSubmission(
      { attending: 'yes', attendingGuests: ['g1', 'g1', 'intruder', 42] },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.attendingGuests).toEqual(['g1']);
    expect(result.data.guestCount).toBe(1);
  });

  it('drops meal entries for guests that are not attending or not on the invitation', () => {
    const result = validateRsvpSubmission(
      { attending: 'yes', attendingGuests: ['g1'], guestMeals: { g1: 'Beef', g2: 'Fish', intruder: 'x' } },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.guestMeals).toEqual({ g1: 'Beef' });
  });

  it('accepts a fallback head-count within the limit', () => {
    const result = validateRsvpSubmission({ attending: 'yes', guestCount: 2 }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.guestCount).toBe(2);
    expect(result.data.attendingGuests).toEqual([]);
  });

  it('rejects a head-count above maxGuests + plusOnesAllowed', () => {
    const result = validateRsvpSubmission({ attending: 'yes', guestCount: 4 }, ctx);
    expect(result.ok).toBe(false);
  });

  it('rejects accepting with zero attendees', () => {
    expect(validateRsvpSubmission({ attending: 'yes', guestCount: 0 }, ctx).ok).toBe(false);
    expect(validateRsvpSubmission({ attending: 'yes', attendingGuests: [] }, ctx).ok).toBe(false);
    expect(validateRsvpSubmission({ attending: 'yes', guestCount: 'garbage' }, ctx).ok).toBe(false);
  });

  it('derives the count from plus-ones alone for guest-less households', () => {
    // Households with no named Guest rows RSVP entirely through plus-ones.
    const result = validateRsvpSubmission(
      { attending: 'yes', guestCount: 0, plusOnes: [{ name: 'Solo Friend', meal: 'Beef' }] },
      { ...ctx, guestIds: [] },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.guestCount).toBe(1);
    expect(result.data.plusOnes).toEqual([{ name: 'Solo Friend', meal: 'Beef' }]);
  });

  it('rejects more named plus-ones than the invitation allows', () => {
    const result = validateRsvpSubmission(
      { attending: 'yes', attendingGuests: ['g1'], plusOnes: [{ name: 'A' }, { name: 'B' }] },
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it('ignores unnamed plus-one slots', () => {
    const result = validateRsvpSubmission(
      { attending: 'yes', attendingGuests: ['g1'], plusOnes: [{ name: '   ', meal: 'Beef' }] },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plusOnes).toEqual([]);
    expect(result.data.guestCount).toBe(1);
  });

  it('rejects named plus-ones when the feature is disabled', () => {
    const result = validateRsvpSubmission(
      { attending: 'yes', attendingGuests: ['g1'], plusOnes: [{ name: 'Extra' }] },
      { ...ctx, plusOnesEnabled: false },
    );
    expect(result.ok).toBe(false);
  });

  it('tolerates malformed shapes for optional fields', () => {
    const result = validateRsvpSubmission(
      { attending: 'yes', guestCount: 1, attendingGuests: 'nope', guestMeals: 'nope', plusOnes: 'nope' },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      attending: 'yes',
      guestCount: 1,
      attendingGuests: [],
      guestMeals: {},
      plusOnes: [],
    });
  });
});
