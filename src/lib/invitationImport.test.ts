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

import ExcelJS from 'exceljs';
import { parseWorkbook, WORKBOOK_COLUMNS } from './invitationImport';

async function makeBuffer(build: (sheet: ExcelJS.Worksheet) => void, sheetName = 'Invitations'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sheetName);
  build(sheet);
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}

describe('parseWorkbook', () => {
  it('parses two data rows with correct rowNumber and normalized values', async () => {
    const buf = await makeBuffer((s) => {
      s.addRow(WORKBOOK_COLUMNS);
      s.addRow(['The Smiths', 'a@b.com', '', '123 Main', '', 'Springfield', 'IL', '62704', 1, '', 'Alice', 'Bob', '', '', '', '', '', '', '', '']);
      s.addRow(['The Joneses', '', '', '', '', '', '', '', 0, '', 'Carol', '', '', '', '', '', '', '', '', '']);
    });
    const rows = await parseWorkbook(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0].rowNumber).toBe(2);
    expect(rows[0].normalized.householdName).toBe('The Smiths');
    expect(rows[0].normalized.email).toBe('a@b.com');
    expect(rows[0].normalized.mailingAddress1).toBe('123 Main');
    expect(rows[0].normalized.plusOnesAllowed).toBe(1);
    expect(rows[0].normalized.guestNames).toEqual(['Alice', 'Bob']);
    expect(rows[1].rowNumber).toBe(3);
    expect(rows[1].normalized.guestNames).toEqual(['Carol']);
  });

  it('returns empty array for a header-only sheet', async () => {
    const buf = await makeBuffer((s) => s.addRow(WORKBOOK_COLUMNS));
    const rows = await parseWorkbook(buf);
    expect(rows).toEqual([]);
  });

  it('drops trailing blank rows', async () => {
    const buf = await makeBuffer((s) => {
      s.addRow(WORKBOOK_COLUMNS);
      s.addRow(['The Smiths', '', '', '', '', '', '', '', 0, '', '', '', '', '', '', '', '', '', '', '']);
      s.addRow(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      s.addRow(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    });
    const rows = await parseWorkbook(buf);
    expect(rows).toHaveLength(1);
  });

  it('trims whitespace from text fields', async () => {
    const buf = await makeBuffer((s) => {
      s.addRow(WORKBOOK_COLUMNS);
      s.addRow(['  The Smiths  ', '  a@b.com  ', '', '', '', '', '', '', 0, '', '  Alice  ', '', '', '', '', '', '', '', '', '']);
    });
    const rows = await parseWorkbook(buf);
    expect(rows[0].normalized.householdName).toBe('The Smiths');
    expect(rows[0].normalized.email).toBe('a@b.com');
    expect(rows[0].normalized.guestNames).toEqual(['Alice']);
  });

  it('treats Guest columns with gaps (empty slot before a filled one) correctly', async () => {
    const buf = await makeBuffer((s) => {
      s.addRow(WORKBOOK_COLUMNS);
      // Guest 1 blank, Guest 2 filled.
      s.addRow(['The Smiths', '', '', '', '', '', '', '', 0, '', '', 'Alice', '', '', '', '', '', '', '', '']);
    });
    const rows = await parseWorkbook(buf);
    // Gap-filling: only non-empty guest columns, in order.
    expect(rows[0].normalized.guestNames).toEqual(['Alice']);
  });

  it('throws a recognizable error when the header row is missing or wrong', async () => {
    const buf = await makeBuffer((s) => {
      s.addRow(['Not', 'The', 'Right', 'Headers']);
      s.addRow(['ignored']);
    });
    await expect(parseWorkbook(buf)).rejects.toThrow(/header/i);
  });

  it('reads "Invitations" sheet by name even when there are other sheets', async () => {
    const wb = new ExcelJS.Workbook();
    const inst = wb.addWorksheet('Instructions');
    inst.addRow(['this sheet should be ignored']);
    const data = wb.addWorksheet('Invitations');
    data.addRow(WORKBOOK_COLUMNS);
    data.addRow(['The Smiths', '', '', '', '', '', '', '', 0, '', '', '', '', '', '', '', '', '', '', '']);
    const ab = await wb.xlsx.writeBuffer();
    const buf = Buffer.from(ab as ArrayBuffer);
    const rows = await parseWorkbook(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].normalized.householdName).toBe('The Smiths');
  });
});

import { dupeKey, bucketRows } from './invitationImport';
import type { NormalizedRow } from './invitationImport';

describe('dupeKey', () => {
  it('normalizes name + address components case-insensitively', () => {
    const k1 = dupeKey({
      householdName: 'The Smiths',
      email: null, contactEmail: null,
      mailingAddress1: '123 Main St', mailingAddress2: null,
      mailingCity: 'Springfield', mailingState: 'IL', mailingPostalCode: '62704',
      plusOnesAllowed: 0, notes: null, guestNames: [],
    });
    const k2 = dupeKey({
      householdName: '  the smiths  ',
      email: null, contactEmail: null,
      mailingAddress1: '123 MAIN ST', mailingAddress2: null,
      mailingCity: 'springfield', mailingState: 'il', mailingPostalCode: '62704',
      plusOnesAllowed: 0, notes: null, guestNames: [],
    });
    expect(k1).toBe(k2);
  });

  it('produces different keys when addresses differ', () => {
    const k1 = dupeKey({
      householdName: 'The Smiths', email: null, contactEmail: null,
      mailingAddress1: '123 Main St', mailingAddress2: null,
      mailingCity: null, mailingState: null, mailingPostalCode: null,
      plusOnesAllowed: 0, notes: null, guestNames: [],
    });
    const k2 = dupeKey({
      householdName: 'The Smiths', email: null, contactEmail: null,
      mailingAddress1: '456 Oak Ave', mailingAddress2: null,
      mailingCity: null, mailingState: null, mailingPostalCode: null,
      plusOnesAllowed: 0, notes: null, guestNames: [],
    });
    expect(k1).not.toBe(k2);
  });

  it('matches on name alone when both sides have empty address', () => {
    const empty = {
      householdName: 'The Smiths',
      email: null, contactEmail: null,
      mailingAddress1: null, mailingAddress2: null,
      mailingCity: null, mailingState: null, mailingPostalCode: null,
      plusOnesAllowed: 0, notes: null, guestNames: [],
    };
    expect(dupeKey(empty)).toBe(dupeKey(empty));
  });
});

describe('bucketRows', () => {
  const mk = (rowNumber: number, overrides: Partial<NormalizedRow> = {}): ParsedRow => ({
    rowNumber,
    raw: {},
    normalized: {
      householdName: `Row ${rowNumber}`,
      email: null, contactEmail: null,
      mailingAddress1: null, mailingAddress2: null,
      mailingCity: null, mailingState: null, mailingPostalCode: null,
      plusOnesAllowed: 0, notes: null, guestNames: [],
      ...overrides,
    },
  });

  it('puts clean rows in ready', () => {
    const result = bucketRows([mk(2), mk(3)], new Set<string>());
    expect(result.ready).toHaveLength(2);
    expect(result.duplicate).toHaveLength(0);
    expect(result.error).toHaveLength(0);
  });

  it('puts error rows in error with their reasons', () => {
    const bad = mk(2, { householdName: '' });
    const result = bucketRows([bad], new Set<string>());
    expect(result.error).toHaveLength(1);
    expect(result.error[0].errors[0]).toMatch(/household/i);
  });

  it('flags rows whose key matches an existing DB key as duplicates', () => {
    const r = mk(2, { householdName: 'The Thom Family' });
    const existingKey = dupeKey(r.normalized);
    const result = bucketRows([r], new Set([existingKey]));
    expect(result.duplicate).toHaveLength(1);
    expect(result.ready).toHaveLength(0);
  });

  it('flags duplicates within the same uploaded sheet', () => {
    const r1 = mk(2, { householdName: 'The Thom Family' });
    const r2 = mk(3, { householdName: 'The Thom Family' });
    const result = bucketRows([r1, r2], new Set<string>());
    // Both rows end up in the duplicate bucket (marked as in-sheet match).
    expect(result.duplicate).toHaveLength(2);
    expect(result.ready).toHaveLength(0);
  });

  it('does not double-bucket: error rows never appear in duplicate', () => {
    const bad = mk(2, { householdName: '' });
    const existingKey = dupeKey(bad.normalized);
    const result = bucketRows([bad], new Set([existingKey]));
    expect(result.error).toHaveLength(1);
    expect(result.duplicate).toHaveLength(0);
  });
});
