// A NormalizedRow is the value shape each row reduces to — what the API
// accepts on commit and what the parser produces from a sheet. Every
// optional field is explicit null so the caller doesn't have to disambiguate
// "missing" from "empty string".
export type NormalizedRow = {
  householdName: string;
  email: string | null;
  contactEmail: string | null;
  mailingAddress1: string | null;
  mailingAddress2: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingPostalCode: string | null;
  plusOnesAllowed: number;
  notes: string | null;
  guestNames: string[];
};

// A ParsedRow pairs a NormalizedRow with its original Excel row number and
// the raw cell strings, so validator error messages can reference the file.
export type ParsedRow = {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: NormalizedRow;
};

export type RowValidation = {
  row: ParsedRow;
  errors: string[];
};

// Loose email check — matches "something@something.something" with no spaces.
// Matches the existing permissive pattern the rest of the app uses for
// admin-entered fields; we're not gate-keeping, just catching typos.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRow(row: ParsedRow): RowValidation {
  const errors: string[] = [];
  const n = row.normalized;

  if (!n.householdName.trim()) {
    errors.push('Household name is required');
  }
  if (n.email && !EMAIL_RE.test(n.email)) {
    errors.push('Email is not a valid email address');
  }
  if (n.contactEmail && !EMAIL_RE.test(n.contactEmail)) {
    errors.push('Contact email is not a valid email address');
  }
  if (!Number.isFinite(n.plusOnesAllowed) || n.plusOnesAllowed < 0 || !Number.isInteger(n.plusOnesAllowed)) {
    errors.push('Plus-Ones Allowed must be 0 or a positive whole number');
  }

  return { row, errors };
}

import ExcelJS from 'exceljs';

export const WORKBOOK_COLUMNS = [
  'Household Name',
  'Email',
  'Contact Email',
  'Address Line 1',
  'Address Line 2',
  'City',
  'State',
  'Postal Code',
  'Plus-Ones Allowed',
  'Notes',
  'Guest 1', 'Guest 2', 'Guest 3', 'Guest 4', 'Guest 5',
  'Guest 6', 'Guest 7', 'Guest 8', 'Guest 9', 'Guest 10',
] as const;

function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return '';
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  // Handle rich text / formula objects by falling back to the rendered text.
  const obj = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
  if (typeof obj.text === 'string') return obj.text;
  if (obj.richText) return obj.richText.map((r) => r.text).join('');
  if (obj.result !== undefined && obj.result !== null) return String(obj.result);
  return '';
}

function parseInt10(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : NaN;
}

export async function parseWorkbook(buffer: Buffer): Promise<ParsedRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  // Prefer the sheet literally named "Invitations" (matches the template);
  // fall back to the first sheet for sheets an admin may have renamed.
  const sheet =
    wb.getWorksheet('Invitations') ??
    wb.worksheets.find((ws) => ws.name.toLowerCase() !== 'instructions') ??
    wb.worksheets[0];
  if (!sheet) throw new Error('Workbook has no sheets');

  // Validate the header row matches exactly (trimmed, case-insensitive).
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  for (let c = 1; c <= WORKBOOK_COLUMNS.length; c++) {
    headers.push(cellText(headerRow.getCell(c)).trim().toLowerCase());
  }
  const expected = WORKBOOK_COLUMNS.map((h) => h.toLowerCase());
  for (let i = 0; i < expected.length; i++) {
    if (headers[i] !== expected[i]) {
      throw new Error(`Unexpected header in column ${i + 1}: expected "${WORKBOOK_COLUMNS[i]}", got "${headerRow.getCell(i + 1).value ?? ''}". Check your header row.`);
    }
  }

  const parsed: ParsedRow[] = [];
  const lastRow = sheet.actualRowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= WORKBOOK_COLUMNS.length; c++) {
      cells.push(cellText(row.getCell(c)).trim());
    }
    if (cells.every((c) => c === '')) continue;  // drop fully-blank rows

    const raw: Record<string, string> = {};
    WORKBOOK_COLUMNS.forEach((name, i) => { raw[name] = cells[i]; });

    const guestNames = cells.slice(10, 20).filter((n) => n !== '');
    const plusOnesRaw = cells[8];
    const plusOnesAllowed = plusOnesRaw === '' ? 0 : parseInt10(plusOnesRaw);

    parsed.push({
      rowNumber: r,
      raw,
      normalized: {
        householdName: cells[0],
        email: cells[1] || null,
        contactEmail: cells[2] || null,
        mailingAddress1: cells[3] || null,
        mailingAddress2: cells[4] || null,
        mailingCity: cells[5] || null,
        mailingState: cells[6] || null,
        mailingPostalCode: cells[7] || null,
        plusOnesAllowed,
        notes: cells[9] || null,
        guestNames,
      },
    });
  }
  return parsed;
}
