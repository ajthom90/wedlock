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
