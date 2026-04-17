import { describe, it, expect } from 'vitest';
import { validateRow, type ParsedRow } from './invitationImport';

function row(overrides: Partial<ParsedRow['normalized']> = {}): ParsedRow {
  return {
    rowNumber: 2,
    raw: {},
    normalized: {
      householdName: 'The Smiths',
      email: null,
      contactEmail: null,
      mailingAddress1: null,
      mailingAddress2: null,
      mailingCity: null,
      mailingState: null,
      mailingPostalCode: null,
      plusOnesAllowed: 0,
      notes: null,
      guestNames: [],
      ...overrides,
    },
  };
}

describe('validateRow', () => {
  it('passes a minimal valid row (only household name)', () => {
    const v = validateRow(row({ householdName: 'The Smiths' }));
    expect(v.errors).toEqual([]);
  });

  it('errors when householdName is empty', () => {
    const v = validateRow(row({ householdName: '' }));
    expect(v.errors).toContain('Household name is required');
  });

  it('errors when householdName is only whitespace', () => {
    const v = validateRow(row({ householdName: '   ' }));
    expect(v.errors).toContain('Household name is required');
  });

  it('errors when email is set to an invalid address', () => {
    const v = validateRow(row({ email: 'not-an-email' }));
    expect(v.errors.some((e) => e.toLowerCase().includes('email'))).toBe(true);
  });

  it('accepts a valid email', () => {
    const v = validateRow(row({ email: 'guest@example.com' }));
    expect(v.errors).toEqual([]);
  });

  it('errors when contactEmail is invalid, separately from email', () => {
    const v = validateRow(row({ contactEmail: 'bad' }));
    expect(v.errors.some((e) => e.toLowerCase().includes('contact email'))).toBe(true);
  });

  it('errors when plusOnesAllowed is negative', () => {
    const v = validateRow(row({ plusOnesAllowed: -1 }));
    expect(v.errors.some((e) => e.toLowerCase().includes('plus-ones'))).toBe(true);
  });

  it('accepts plusOnesAllowed = 0', () => {
    const v = validateRow(row({ plusOnesAllowed: 0 }));
    expect(v.errors).toEqual([]);
  });
});
