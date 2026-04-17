# Bulk Invitation Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin create dozens/hundreds of invitations by uploading an Excel file; ship a downloadable 20-column template alongside.

**Architecture:** New pure `src/lib/invitationImport.ts` owns parsing, row validation, and duplicate bucketing. Two thin admin API routes wrap it — `/preview` (stateless, returns buckets) and `/commit` (creates invitations, returns per-row failures). The admin page has three states on one route: upload → inline-editable preview table → chunked commit with progress bar + final failures report. A one-off Node script generates a committed .xlsx template.

**Tech Stack:** Next.js 15 App Router, Prisma + SQLite, `exceljs` (new dep), vitest.

**Spec:** [`docs/superpowers/specs/2026-04-17-invitation-import-design.md`](../specs/2026-04-17-invitation-import-design.md)

---

## Background notes for an engineer new to the codebase

- **Tests** live as siblings to source: `src/lib/foo.ts` → `src/lib/foo.test.ts`. Vitest, node environment, `@` aliases to `./src`.
- **Auth on API routes:** `import { isAuthenticated } from '@/lib/auth'` and gate writes with `if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });`.
- **Prisma** is a singleton: `import prisma from '@/lib/prisma'`.
- **Commit trailer** per CLAUDE.md: every commit must end with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. Use heredoc in `git commit -m`.
- **Schema changes** apply via `npx prisma db push` + `npx prisma generate`. This plan's changes are additive — safe on existing DBs.
- **Next.js 15** dynamic route params are `Promise<{ id: string }>`. Existing admin `[id]` routes in this project already await them.
- **UI conventions:** client components use `'use client'`. Existing admin pages import `Card, CardContent, CardHeader, CardTitle, Button, Input, Textarea` from `@/components/ui/...`.
- **Version bumps** go through `./scripts/docker.sh bump-minor`. Release notes must be added to `release-notes.json` BEFORE the bump (per memory: `feedback_release_notes_before_bump.md`).

---

## Task 1: Install exceljs

**Files:**
- Modify: `package.json` (+ lockfile)

- [ ] **Step 1: Install the dep**

Run:
```bash
npm install exceljs
```

Expected: `exceljs` appears in `dependencies`. No `@types/exceljs` needed — the package bundles its own types.

- [ ] **Step 2: Type-check still passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
Add exceljs for reading invitation import sheets

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Schema additions — structured mailing address

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the 5 fields to `Invitation`**

In `prisma/schema.prisma`, locate the `Invitation` model. After the existing `address String?` line, add:

```prisma
  mailingAddress1   String?
  mailingAddress2   String?
  mailingCity       String?
  mailingState      String?
  mailingPostalCode String?
```

Update the comment on the existing `address` line to note it's deprecated:

```prisma
  address         String?  // deprecated — use mailingAddress1..mailingPostalCode for new writes; kept for backward compat with pre-2.9 invitations
```

- [ ] **Step 2: Apply schema + regenerate client**

Run:
```bash
npx prisma db push
npx prisma generate
```

Expected: "Your database is now in sync with your Prisma schema." and "Generated Prisma Client" output, no errors.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "$(cat <<'EOF'
Add structured mailing-address fields to Invitation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Template generator + committed .xlsx

**Files:**
- Create: `scripts/build-import-template.ts`
- Create: `public/invitation-import-template.xlsx` (output of above)

- [ ] **Step 1: Write the generator**

Create `scripts/build-import-template.ts`:

```ts
import ExcelJS from 'exceljs';
import path from 'path';

const COLUMNS = [
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
];

async function build() {
  const wb = new ExcelJS.Workbook();

  // Sheet 1: Invitations — the actual data sheet.
  const sheet = wb.addWorksheet('Invitations');
  sheet.addRow(COLUMNS);
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E7D9' } };
  });
  // Two sample rows so the format is obvious at a glance.
  sheet.addRow([
    'The Sample Family', 'sample@example.com', '', '123 Main St', '', 'Springfield', 'IL', '62704',
    0, '', 'Jane Sample', 'John Sample', '', '', '', '', '', '', '', '',
  ]);
  sheet.addRow([
    'The Plus-One Family', 'plus@example.com', '', '456 Oak Ave', 'Apt 2', 'Chicago', 'IL', '60601',
    2, 'Knows the bride from college', 'Alex Plus', '', '', '', '', '', '', '', '', '',
  ]);
  // Widen the household and address columns so the sheet is legible in Excel.
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 24;
  sheet.getColumn(3).width = 24;
  sheet.getColumn(4).width = 24;
  sheet.getColumn(5).width = 16;
  sheet.getColumn(6).width = 18;
  sheet.getColumn(7).width = 10;
  sheet.getColumn(8).width = 12;
  sheet.getColumn(9).width = 18;
  sheet.getColumn(10).width = 30;
  for (let i = 11; i <= 20; i++) sheet.getColumn(i).width = 18;

  // Sheet 2: Instructions — plain-language per-column guidance.
  const inst = wb.addWorksheet('Instructions');
  inst.addRow(['Edit Sheet 1 ("Invitations"). Delete the two sample rows before uploading.']);
  inst.addRow([]);
  inst.addRow(['Column', 'Meaning']);
  inst.getRow(3).font = { bold: true };
  const rows: Array<[string, string]> = [
    ['Household Name', 'Required. e.g. "The Smith Family", "John and Jane", "Grandma Rose".'],
    ['Email', 'Optional. Your contact email for this household (for chasing late RSVPs).'],
    ['Contact Email', 'Optional. Pre-fills the "Stay in the loop" field on their RSVP form. Guests can override.'],
    ['Address Line 1', 'Optional. Street address for mailing labels.'],
    ['Address Line 2', 'Optional. Apt / suite / unit.'],
    ['City', 'Optional.'],
    ['State', 'Optional. Free text — US state abbreviation or international region.'],
    ['Postal Code', 'Optional. Free text — ZIP or international postal code.'],
    ['Plus-Ones Allowed', 'Optional. Whole number 0+. How many un-named extras this household may bring. Defaults to 0.'],
    ['Notes', 'Optional. Admin-only notes (never shown to guests).'],
    ['Guest 1 – Guest 10', 'Optional. Named guests in this household. First non-empty column becomes the primary guest. Leave extra columns blank.'],
  ];
  for (const [col, meaning] of rows) inst.addRow([col, meaning]);
  inst.getColumn(1).width = 22;
  inst.getColumn(2).width = 80;

  const outPath = path.resolve(__dirname, '..', 'public', 'invitation-import-template.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath}`);
}

build().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Generate the template**

Run:
```bash
npx tsx scripts/build-import-template.ts
```

Expected: prints `Wrote .../public/invitation-import-template.xlsx`. If `tsx` isn't installed, fall back to `npx ts-node scripts/build-import-template.ts`.

- [ ] **Step 3: Sanity-check the output**

Run:
```bash
ls -la public/invitation-import-template.xlsx
```

Expected: file exists, size >10KB (exceljs adds metadata; empty-ish file would be suspicious).

Optionally open in Excel/Numbers to verify the two sheets render correctly.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-import-template.ts public/invitation-import-template.xlsx
git commit -m "$(cat <<'EOF'
Add invitation-import-template.xlsx + its generator script

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `invitationImport.ts` — types + `validateRow`

**Files:**
- Create: `src/lib/invitationImport.ts`
- Create: `src/lib/invitationImport.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/invitationImport.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/invitationImport.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement types + `validateRow`**

Create `src/lib/invitationImport.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/invitationImport.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitationImport.ts src/lib/invitationImport.test.ts
git commit -m "$(cat <<'EOF'
Add invitationImport types and validateRow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `invitationImport.ts` — `parseWorkbook`

**Files:**
- Modify: `src/lib/invitationImport.ts` (append)
- Modify: `src/lib/invitationImport.test.ts` (append)

- [ ] **Step 1: Write failing tests**

Append to `src/lib/invitationImport.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/invitationImport.test.ts`
Expected: the `parseWorkbook` block FAILs (function + `WORKBOOK_COLUMNS` not exported).

- [ ] **Step 3: Implement `parseWorkbook`**

Append to `src/lib/invitationImport.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/invitationImport.test.ts`
Expected: all tests pass (15 total: 8 from Task 4 + 7 here).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitationImport.ts src/lib/invitationImport.test.ts
git commit -m "$(cat <<'EOF'
Add parseWorkbook for .xlsx invitation imports

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `invitationImport.ts` — dedup helpers

**Files:**
- Modify: `src/lib/invitationImport.ts` (append)
- Modify: `src/lib/invitationImport.test.ts` (append)

- [ ] **Step 1: Write failing tests**

Append to `src/lib/invitationImport.test.ts`:

```ts
import { dupeKey, bucketRows } from './invitationImport';

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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/invitationImport.test.ts`
Expected: the `dupeKey` and `bucketRows` blocks FAIL.

- [ ] **Step 3: Implement `dupeKey` + `bucketRows`**

Append to `src/lib/invitationImport.ts`:

```ts
// Canonical key used for duplicate detection. Matching keys = same household
// at the same mailing address (or same name when neither side has address
// data). Intentionally case-insensitive and trim-tolerant.
export function dupeKey(n: NormalizedRow): string {
  const name = n.householdName.trim().toLowerCase();
  const addressParts = [
    n.mailingAddress1, n.mailingAddress2,
    n.mailingCity, n.mailingState, n.mailingPostalCode,
  ].map((p) => (p ?? '').trim().toLowerCase()).filter((p) => p !== '');
  return `${name}|${addressParts.join('|')}`;
}

export type DuplicateMeta = {
  matchedExisting: boolean;
  matchedInSheet: boolean;
};

export type BucketedRows = {
  ready: ParsedRow[];
  duplicate: Array<ParsedRow & DuplicateMeta>;
  error: Array<ParsedRow & { errors: string[] }>;
};

// Single pass over the parsed rows: validate, then assign to a bucket.
// error > duplicate > ready in precedence — an error row is never also
// reported as a duplicate (the admin has to fix the error first).
export function bucketRows(
  rows: ParsedRow[],
  existingKeys: Set<string>,
): BucketedRows {
  const ready: ParsedRow[] = [];
  const duplicate: Array<ParsedRow & DuplicateMeta> = [];
  const error: Array<ParsedRow & { errors: string[] }> = [];

  // First pass: compute keys and track in-sheet collisions.
  const keyCounts = new Map<string, number>();
  const rowKeys: string[] = [];
  for (const r of rows) {
    const k = dupeKey(r.normalized);
    rowKeys.push(k);
    keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
  }

  // Second pass: validate, bucket.
  rows.forEach((r, i) => {
    const validation = validateRow(r);
    if (validation.errors.length > 0) {
      error.push({ ...r, errors: validation.errors });
      return;
    }
    const k = rowKeys[i];
    const matchedExisting = existingKeys.has(k);
    const matchedInSheet = (keyCounts.get(k) ?? 0) > 1;
    if (matchedExisting || matchedInSheet) {
      duplicate.push({ ...r, matchedExisting, matchedInSheet });
    } else {
      ready.push(r);
    }
  });

  return { ready, duplicate, error };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/invitationImport.test.ts`
Expected: all tests pass (21 total).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invitationImport.ts src/lib/invitationImport.test.ts
git commit -m "$(cat <<'EOF'
Add dupeKey and bucketRows for invitation import bucketing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Preview API route

**Files:**
- Create: `src/app/api/invitations/import/preview/route.ts`

- [ ] **Step 1: Implement the route**

Create `src/app/api/invitations/import/preview/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { parseWorkbook, bucketRows, dupeKey } from '@/lib/invitationImport';

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());

    let parsed;
    try {
      parsed = await parseWorkbook(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read Excel file';
      return NextResponse.json({ error: `Could not read Excel file — ${message}` }, { status: 400 });
    }

    // Build the existing-keys set from DB. Only need the fields dupeKey reads.
    const existing = await prisma.invitation.findMany({
      select: {
        householdName: true,
        mailingAddress1: true,
        mailingAddress2: true,
        mailingCity: true,
        mailingState: true,
        mailingPostalCode: true,
      },
    });
    const existingKeys = new Set(existing.map((inv) => dupeKey({
      householdName: inv.householdName,
      email: null, contactEmail: null,
      mailingAddress1: inv.mailingAddress1,
      mailingAddress2: inv.mailingAddress2,
      mailingCity: inv.mailingCity,
      mailingState: inv.mailingState,
      mailingPostalCode: inv.mailingPostalCode,
      plusOnesAllowed: 0, notes: null, guestNames: [],
    })));

    const buckets = bucketRows(parsed, existingKeys);

    return NextResponse.json({
      totalRows: parsed.length,
      existingInvitationCount: existing.length,
      ready: buckets.ready,
      duplicate: buckets.duplicate,
      error: buckets.error,
    });
  } catch (error) {
    console.error('Error previewing invitation import:', error);
    return NextResponse.json({ error: 'Failed to preview import' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/invitations/import/preview/route.ts
git commit -m "$(cat <<'EOF'
Add /api/invitations/import/preview route

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Commit API route

**Files:**
- Create: `src/app/api/invitations/import/commit/route.ts`

- [ ] **Step 1: Implement the route**

Create `src/app/api/invitations/import/commit/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateCode } from '@/lib/utils';
import { validateRow, type NormalizedRow, type ParsedRow } from '@/lib/invitationImport';

async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    if (!(await prisma.invitation.findUnique({ where: { code } }))) return code;
  }
  throw new Error('Could not generate unique invitation code');
}

type Failure = { rowNumber: number; householdName: string; error: string };

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as { rows?: Array<NormalizedRow & { rowNumber?: number }> };
    if (!Array.isArray(body.rows)) {
      return NextResponse.json({ error: 'Expected { rows: NormalizedRow[] }' }, { status: 400 });
    }

    // Re-validate every row server-side — defense-in-depth against a client
    // that skipped validation. If any row is invalid, reject the whole chunk.
    const validationErrors: Array<{ rowNumber: number; errors: string[] }> = [];
    for (const r of body.rows) {
      const pseudo: ParsedRow = { rowNumber: r.rowNumber ?? 0, raw: {}, normalized: r };
      const v = validateRow(pseudo);
      if (v.errors.length > 0) {
        validationErrors.push({ rowNumber: pseudo.rowNumber, errors: v.errors });
      }
    }
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: 'Validation failed', validationErrors }, { status: 400 });
    }

    // Sequential row-by-row. Per-row failures are caught and reported — they
    // don't abort the rest of the chunk. (No outer transaction: per the spec,
    // we want partial success with a failure report, not all-or-nothing.)
    let createdCount = 0;
    const failures: Failure[] = [];
    for (const r of body.rows) {
      try {
        const code = await generateUniqueCode();
        const maxGuests = r.guestNames.length + r.plusOnesAllowed;
        await prisma.invitation.create({
          data: {
            code,
            householdName: r.householdName.trim(),
            email: r.email?.trim() || null,
            contactEmail: r.contactEmail?.trim() || null,
            mailingAddress1: r.mailingAddress1?.trim() || null,
            mailingAddress2: r.mailingAddress2?.trim() || null,
            mailingCity: r.mailingCity?.trim() || null,
            mailingState: r.mailingState?.trim() || null,
            mailingPostalCode: r.mailingPostalCode?.trim() || null,
            maxGuests: maxGuests > 0 ? maxGuests : 2,
            plusOnesAllowed: r.plusOnesAllowed,
            notes: r.notes?.trim() || null,
            guests: {
              create: r.guestNames.map((name, i) => ({
                name: name.trim(),
                isPrimary: i === 0,
              })),
            },
          },
        });
        createdCount++;
      } catch (err) {
        failures.push({
          rowNumber: r.rowNumber ?? 0,
          householdName: r.householdName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ createdCount, failedCount: failures.length, failures });
  } catch (error) {
    console.error('Error committing invitation import:', error);
    return NextResponse.json({ error: 'Failed to commit import' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/invitations/import/commit/route.ts
git commit -m "$(cat <<'EOF'
Add /api/invitations/import/commit route

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Import admin page — upload + preview (states 1 + 2)

**Files:**
- Create: `src/app/admin/(authenticated)/invitations/import/page.tsx`

- [ ] **Step 1: Implement states 1 and 2 (commit/state 3 added in Task 10)**

Create `src/app/admin/(authenticated)/invitations/import/page.tsx`:

```tsx
'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { NormalizedRow, ParsedRow } from '@/lib/invitationImport';

type DuplicateRow = ParsedRow & { matchedExisting: boolean; matchedInSheet: boolean };
type ErrorRow = ParsedRow & { errors: string[] };

type PreviewResponse = {
  totalRows: number;
  existingInvitationCount: number;
  ready: ParsedRow[];
  duplicate: DuplicateRow[];
  error: ErrorRow[];
};

// An EditableRow is a ParsedRow that carries a client-local id so inline
// edits and per-row deletions don't mutate rowNumber (which we still need
// for the final failures report).
type EditableRow = ParsedRow & { clientId: string; bucket: 'ready' | 'duplicate' | 'error'; duplicateMeta?: { matchedExisting: boolean; matchedInSheet: boolean } };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Client-side mirror of validateRow so the table can re-bucket as the admin
// edits. MUST stay in sync with src/lib/invitationImport.ts validateRow.
function clientValidate(n: NormalizedRow): string[] {
  const errors: string[] = [];
  if (!n.householdName.trim()) errors.push('Household name is required');
  if (n.email && !EMAIL_RE.test(n.email)) errors.push('Email is not a valid email address');
  if (n.contactEmail && !EMAIL_RE.test(n.contactEmail)) errors.push('Contact email is not a valid email address');
  if (!Number.isInteger(n.plusOnesAllowed) || n.plusOnesAllowed < 0) errors.push('Plus-Ones Allowed must be 0 or a positive whole number');
  return errors;
}

export default function InvitationImportPage() {
  const [existingCount, setExistingCount] = useState(0);
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const readyCount = useMemo(() => rows?.filter((r) => r.bucket === 'ready').length ?? 0, [rows]);
  const duplicateCount = useMemo(() => rows?.filter((r) => r.bucket === 'duplicate').length ?? 0, [rows]);
  const errorCount = useMemo(() => rows?.filter((r) => r.bucket === 'error').length ?? 0, [rows]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/invitations/import/preview', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Upload failed');
        return;
      }
      const preview = data as PreviewResponse;
      setExistingCount(preview.existingInvitationCount);
      const toEditable = (r: ParsedRow, bucket: EditableRow['bucket'], meta?: EditableRow['duplicateMeta']): EditableRow => ({
        ...r,
        clientId: `${r.rowNumber}-${Math.random().toString(36).slice(2, 8)}`,
        bucket,
        duplicateMeta: meta,
      });
      setRows([
        ...preview.error.map((r) => toEditable(r, 'error')),
        ...preview.duplicate.map((r) => toEditable(r, 'duplicate', { matchedExisting: r.matchedExisting, matchedInSheet: r.matchedInSheet })),
        ...preview.ready.map((r) => toEditable(r, 'ready')),
      ]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const updateRow = (clientId: string, patch: Partial<NormalizedRow>) => {
    setRows((prev) => {
      if (!prev) return prev;
      return prev.map((r) => {
        if (r.clientId !== clientId) return r;
        const normalized = { ...r.normalized, ...patch };
        const errors = clientValidate(normalized);
        // After edit, re-bucket: error if any validation errors; otherwise
        // keep prior duplicate flag (can't re-check duplicates without re-hitting
        // the server — a small UX honesty loss we accept for V1).
        const bucket: EditableRow['bucket'] = errors.length > 0 ? 'error' : (r.duplicateMeta ? 'duplicate' : 'ready');
        return { ...r, normalized, bucket };
      });
    });
  };

  const removeRow = (clientId: string) => {
    setRows((prev) => prev?.filter((r) => r.clientId !== clientId) ?? prev);
  };

  const resetImport = () => {
    setRows(null);
    setUploadError(null);
  };

  // State 1 — upload
  if (!rows) {
    return (
      <div className="p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Import Invitations</h1>
          <p className="text-sm text-gray-600 mt-1">
            Upload an Excel file to create dozens of invitations at once.
            Download the template first to see the expected columns.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>1. Download the template</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-3">
              Starts with a styled header row and two sample rows so the format is obvious.
              Delete the sample rows before uploading.
            </p>
            <a href="/invitation-import-template.xlsx" download>
              <Button variant="outline">Download template.xlsx</Button>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>2. Upload your filled-in sheet</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              accept=".xlsx"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
              className="block text-sm"
            />
            {uploading && <p className="text-sm text-gray-500">Parsing…</p>}
            {uploadError && <p className="text-sm text-red-700">{uploadError}</p>}
          </CardContent>
        </Card>

        <Link href="/admin/invitations" className="text-sm text-primary hover:underline">
          ← Back to Invitations
        </Link>
      </div>
    );
  }

  // State 2 — preview with inline edits
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Import Invitations — Preview</h1>
        <Button variant="outline" onClick={resetImport}>Upload a different file</Button>
      </div>

      <div className="flex gap-2 text-sm">
        <span className="px-3 py-1 rounded bg-emerald-100 text-emerald-800">{readyCount} ready</span>
        <span className="px-3 py-1 rounded bg-sky-100 text-sky-800">{duplicateCount} duplicates</span>
        <span className="px-3 py-1 rounded bg-red-100 text-red-800">{errorCount} errors</span>
        <span className="px-3 py-1 rounded bg-gray-100 text-gray-600">you have {existingCount} invitations already</span>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded">
        <table className="text-sm border-collapse">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 bg-gray-50 z-10 text-left px-3 py-2 border-b border-gray-200 min-w-[200px]">Household Name</th>
              <th className="sticky left-[200px] bg-gray-50 z-10 text-left px-3 py-2 border-b border-gray-200 min-w-[180px]">Email</th>
              <th className="sticky left-[380px] bg-gray-50 z-10 text-left px-3 py-2 border-b border-gray-200 min-w-[180px]">Contact Email</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">Address 1</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">Address 2</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">City</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">State</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">Postal</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">+1s</th>
              <th className="text-left px-3 py-2 border-b border-gray-200">Notes</th>
              {Array.from({ length: 10 }).map((_, i) => (
                <th key={i} className="text-left px-3 py-2 border-b border-gray-200">Guest {i + 1}</th>
              ))}
              <th className="text-left px-3 py-2 border-b border-gray-200"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const errors = r.bucket === 'error' ? clientValidate(r.normalized) : [];
              const leftColor = r.bucket === 'error' ? 'border-l-4 border-red-500' : r.bucket === 'duplicate' ? 'border-l-4 border-sky-500' : 'border-l-4 border-emerald-500';
              return (
                <React.Fragment key={r.clientId}>
                  <tr className={`${leftColor}`}>
                    <td className="sticky left-0 bg-white px-2 py-1 border-b border-gray-100">
                      <Input value={r.normalized.householdName} onChange={(e) => updateRow(r.clientId, { householdName: e.target.value })} />
                    </td>
                    <td className="sticky left-[200px] bg-white px-2 py-1 border-b border-gray-100">
                      <Input type="email" value={r.normalized.email ?? ''} onChange={(e) => updateRow(r.clientId, { email: e.target.value || null })} />
                    </td>
                    <td className="sticky left-[380px] bg-white px-2 py-1 border-b border-gray-100">
                      <Input type="email" value={r.normalized.contactEmail ?? ''} onChange={(e) => updateRow(r.clientId, { contactEmail: e.target.value || null })} />
                    </td>
                    <td className="px-2 py-1 border-b border-gray-100"><Input value={r.normalized.mailingAddress1 ?? ''} onChange={(e) => updateRow(r.clientId, { mailingAddress1: e.target.value || null })} /></td>
                    <td className="px-2 py-1 border-b border-gray-100"><Input value={r.normalized.mailingAddress2 ?? ''} onChange={(e) => updateRow(r.clientId, { mailingAddress2: e.target.value || null })} /></td>
                    <td className="px-2 py-1 border-b border-gray-100"><Input value={r.normalized.mailingCity ?? ''} onChange={(e) => updateRow(r.clientId, { mailingCity: e.target.value || null })} /></td>
                    <td className="px-2 py-1 border-b border-gray-100"><Input value={r.normalized.mailingState ?? ''} onChange={(e) => updateRow(r.clientId, { mailingState: e.target.value || null })} /></td>
                    <td className="px-2 py-1 border-b border-gray-100"><Input value={r.normalized.mailingPostalCode ?? ''} onChange={(e) => updateRow(r.clientId, { mailingPostalCode: e.target.value || null })} /></td>
                    <td className="px-2 py-1 border-b border-gray-100 w-20"><Input type="number" min={0} value={r.normalized.plusOnesAllowed} onChange={(e) => updateRow(r.clientId, { plusOnesAllowed: parseInt(e.target.value, 10) || 0 })} /></td>
                    <td className="px-2 py-1 border-b border-gray-100"><Textarea rows={1} value={r.normalized.notes ?? ''} onChange={(e) => updateRow(r.clientId, { notes: e.target.value || null })} /></td>
                    {Array.from({ length: 10 }).map((_, i) => (
                      <td key={i} className="px-2 py-1 border-b border-gray-100">
                        <Input
                          value={r.normalized.guestNames[i] ?? ''}
                          onChange={(e) => {
                            const next = [...r.normalized.guestNames];
                            while (next.length <= i) next.push('');
                            next[i] = e.target.value;
                            // Collapse back to the non-empty-in-order shape the API expects.
                            const trimmed = next.map((s) => s.trim()).filter((s) => s !== '');
                            updateRow(r.clientId, { guestNames: trimmed });
                          }}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 border-b border-gray-100">
                      <Button size="sm" variant="danger" onClick={() => removeRow(r.clientId)}>✕</Button>
                    </td>
                  </tr>
                  {errors.length > 0 && (
                    <tr>
                      <td colSpan={21} className="sticky left-0 bg-red-50 text-red-800 text-xs px-3 py-1 border-b border-red-200">
                        Row {r.rowNumber}: {errors.join(' · ')}
                      </td>
                    </tr>
                  )}
                  {r.bucket === 'duplicate' && r.duplicateMeta && (
                    <tr>
                      <td colSpan={21} className="sticky left-0 bg-sky-50 text-sky-800 text-xs px-3 py-1 border-b border-sky-200">
                        Row {r.rowNumber}: possible duplicate —
                        {r.duplicateMeta.matchedExisting && ' matches an existing invitation.'}
                        {r.duplicateMeta.matchedInSheet && ' another row in this file has the same household + address.'}
                        {' '}Will import unless you remove it.
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button
          disabled={errorCount > 0 || (readyCount + duplicateCount) === 0}
          onClick={() => { /* wired in Task 10 */ }}
        >
          Import {readyCount + duplicateCount} invitation{(readyCount + duplicateCount) === 1 ? '' : 's'}
        </Button>
        {errorCount > 0 && <span className="text-xs text-red-700">Fix errors above before importing.</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(authenticated)/invitations/import/page.tsx"
git commit -m "$(cat <<'EOF'
Add invitation import admin page — upload + preview (states 1 and 2)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Import admin page — commit flow (state 3)

**Files:**
- Modify: `src/app/admin/(authenticated)/invitations/import/page.tsx`

- [ ] **Step 1: Add progress state, chunked commit, and the modal**

At the top of the component function, add state:

```tsx
  const [committing, setCommitting] = useState(false);
  const [committedCount, setCommittedCount] = useState(0);
  const [totalToCommit, setTotalToCommit] = useState(0);
  const [failures, setFailures] = useState<Array<{ rowNumber: number; householdName: string; error: string }>>([]);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
```

Add the chunked commit handler below `resetImport`:

```tsx
  const CHUNK_SIZE = 50;

  const handleCommit = async () => {
    if (!rows) return;
    const toImport = rows.filter((r) => r.bucket !== 'error').map((r) => ({
      rowNumber: r.rowNumber,
      ...r.normalized,
    }));
    setCommitting(true);
    setFinished(false);
    setFailures([]);
    setFatalError(null);
    setCommittedCount(0);
    setTotalToCommit(toImport.length);

    for (let i = 0; i < toImport.length; i += CHUNK_SIZE) {
      const chunk = toImport.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch('/api/invitations/import/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFatalError(data.error || `Server returned ${res.status}`);
          setCommitting(false);
          return;
        }
        setCommittedCount((c) => c + (data.createdCount || 0));
        if (Array.isArray(data.failures) && data.failures.length > 0) {
          setFailures((prev) => [...prev, ...data.failures]);
        }
      } catch (err) {
        setFatalError(err instanceof Error ? err.message : 'Network error');
        setCommitting(false);
        return;
      }
    }
    setCommitting(false);
    setFinished(true);
  };
```

- [ ] **Step 2: Wire the Import button to `handleCommit`**

Replace the `onClick={() => { /* wired in Task 10 */ }}` placeholder with `onClick={handleCommit}`.

- [ ] **Step 3: Add the progress + final report modal**

At the end of the JSX, just before the closing `</div>` of the outer wrapper, add:

```tsx
      {(committing || finished || fatalError) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            {committing ? (
              <>
                <CardHeader><CardTitle>Importing…</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full transition-all" style={{ width: totalToCommit ? `${(committedCount / totalToCommit) * 100}%` : '0%' }} />
                  </div>
                  <p className="text-sm text-gray-600">{committedCount} of {totalToCommit} imported</p>
                </CardContent>
              </>
            ) : fatalError ? (
              <>
                <CardHeader><CardTitle>Import interrupted</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{fatalError}</p>
                  <p className="text-sm text-gray-600">{committedCount} of {totalToCommit} invitations were imported before the error. You can go to Invitations to see the partial result, then re-upload a corrected sheet with the missing rows.</p>
                  <div className="flex justify-end">
                    <Link href="/admin/invitations"><Button>Go to Invitations</Button></Link>
                  </div>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader><CardTitle>{failures.length === 0 ? 'Imported' : 'Imported with errors'}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">
                    Imported {committedCount} of {totalToCommit} invitation{totalToCommit === 1 ? '' : 's'}.
                    {failures.length > 0 && ` ${failures.length} failed.`}
                  </p>
                  {failures.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-red-700">Show failure details</summary>
                      <ul className="mt-2 space-y-1">
                        {failures.map((f, i) => (
                          <li key={i} className="text-xs">
                            <span className="font-medium">Row {f.rowNumber} ({f.householdName}):</span> {f.error}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-gray-500">Fix these in a new sheet and re-upload just those rows.</p>
                    </details>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { setFinished(false); resetImport(); }}>Import another file</Button>
                    <Link href="/admin/invitations"><Button>Go to Invitations</Button></Link>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/(authenticated)/invitations/import/page.tsx"
git commit -m "$(cat <<'EOF'
Wire chunked commit + progress modal into invitation import page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Link "Import from Excel" on /admin/invitations

**Files:**
- Modify: `src/app/admin/(authenticated)/invitations/page.tsx`

- [ ] **Step 1: Add the button next to the existing "Add Invitation" control**

Read `src/app/admin/(authenticated)/invitations/page.tsx` first. Locate the JSX element that renders the "Add Invitation" button (search for `Add Invitation`). Add a sibling link just after it:

```tsx
<Link href="/admin/invitations/import">
  <Button variant="outline">Import from Excel</Button>
</Link>
```

If `Link` isn't already imported at the top of the file, add:

```tsx
import Link from 'next/link';
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(authenticated)/invitations/page.tsx"
git commit -m "$(cat <<'EOF'
Link "Import from Excel" button on the invitations admin page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Public RSVP form + route — 5-input structured address

**Files:**
- Modify: `src/app/(public)/rsvp/page.tsx`
- Modify: `src/app/api/rsvp/route.ts`

- [ ] **Step 1: Update the RSVP POST route to accept + write structured fields**

Read `src/app/api/rsvp/route.ts` first. In the POST handler:

(a) Destructure the new fields from the request body. Find the existing destructure (`const { code, attending, ..., address, contactEmail } = await request.json();`) and add the 5 structured fields, removing the old `address`:

```ts
const { code, attending, guestCount, responses, guestMeals, message, attendingGuests, plusOnes, songRequests, dietaryNotes, contactEmail, mailingAddress1, mailingAddress2, mailingCity, mailingState, mailingPostalCode } = await request.json();
```

(b) Remove the existing `address` persistence block (the `if (typeof address === 'string' && address.trim()) { await prisma.invitation.update(...) }` section).

(c) Add a structured-address persistence block in the same location:

```ts
// Persist structured mailing address on the invitation. Each field is
// independently updated so clearing one field doesn't clobber the others.
const addressPatch: {
  mailingAddress1?: string | null;
  mailingAddress2?: string | null;
  mailingCity?: string | null;
  mailingState?: string | null;
  mailingPostalCode?: string | null;
} = {};
if (typeof mailingAddress1 === 'string') addressPatch.mailingAddress1 = mailingAddress1.trim() || null;
if (typeof mailingAddress2 === 'string') addressPatch.mailingAddress2 = mailingAddress2.trim() || null;
if (typeof mailingCity === 'string') addressPatch.mailingCity = mailingCity.trim() || null;
if (typeof mailingState === 'string') addressPatch.mailingState = mailingState.trim() || null;
if (typeof mailingPostalCode === 'string') addressPatch.mailingPostalCode = mailingPostalCode.trim() || null;
if (Object.keys(addressPatch).length > 0) {
  await prisma.invitation.update({
    where: { id: invitation.id },
    data: addressPatch,
  });
}
```

- [ ] **Step 2: Update the public RSVP form to render 5 address inputs**

Read `src/app/(public)/rsvp/page.tsx` first. Replace the existing single address state + input.

(a) Replace the `const [address, setAddress] = useState('');` line with five state values:

```tsx
const [mailingAddress1, setMailingAddress1] = useState('');
const [mailingAddress2, setMailingAddress2] = useState('');
const [mailingCity, setMailingCity] = useState('');
const [mailingState, setMailingState] = useState('');
const [mailingPostalCode, setMailingPostalCode] = useState('');
```

(b) In `lookupInvitation`, replace `setAddress(data.invitation.address || '');` with:

```tsx
setMailingAddress1(data.invitation.mailingAddress1 || '');
setMailingAddress2(data.invitation.mailingAddress2 || '');
setMailingCity(data.invitation.mailingCity || '');
setMailingState(data.invitation.mailingState || '');
setMailingPostalCode(data.invitation.mailingPostalCode || '');
```

(c) Replace the existing address Textarea JSX (search for `Mailing address`) with:

```tsx
{attending && features.rsvpAddress !== false && (
  <div className="space-y-2">
    <label className="text-sm font-medium">Mailing address <span className="text-gray-500 font-normal">(optional — for save-the-dates and thank-you cards)</span></label>
    <Input value={mailingAddress1} onChange={(e) => setMailingAddress1(e.target.value)} placeholder="Address line 1" />
    <Input value={mailingAddress2} onChange={(e) => setMailingAddress2(e.target.value)} placeholder="Address line 2 (apt, suite, etc.)" />
    <div className="grid grid-cols-3 gap-2">
      <Input className="col-span-2" value={mailingCity} onChange={(e) => setMailingCity(e.target.value)} placeholder="City" />
      <Input value={mailingState} onChange={(e) => setMailingState(e.target.value)} placeholder="State" />
    </div>
    <Input value={mailingPostalCode} onChange={(e) => setMailingPostalCode(e.target.value)} placeholder="Postal code" />
  </div>
)}
```

(d) In the submit handler's POST body, remove `address` and add the 5 new fields. Find the `JSON.stringify({...})` call for `/api/rsvp` and replace `address` with:

```ts
mailingAddress1,
mailingAddress2,
mailingCity,
mailingState,
mailingPostalCode,
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite to confirm no regression**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/rsvp/page.tsx" src/app/api/rsvp/route.ts
git commit -m "$(cat <<'EOF'
Split RSVP address into 5 structured inputs + wire route

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Admin RSVP edit modal + admin PUT route — structured address

**Files:**
- Modify: `src/app/api/rsvp/[invitationId]/route.ts`
- Modify: `src/app/admin/(authenticated)/rsvps/page.tsx`

- [ ] **Step 1: Update the admin PUT route to accept structured address fields**

Read `src/app/api/rsvp/[invitationId]/route.ts` first. In the PUT handler:

(a) Add the 5 new fields to the destructure and remove the existing `address`:

```ts
const { attending, guestCount, responses, guestMeals, attendingGuests, plusOnes, songRequests, dietaryNotes, message, contactEmail, mailingAddress1, mailingAddress2, mailingCity, mailingState, mailingPostalCode } = await request.json();
```

(b) Remove the existing `address` handling from the `invitationPatch` block and add the 5 structured fields:

```ts
const invitationPatch: {
  mailingAddress1?: string | null;
  mailingAddress2?: string | null;
  mailingCity?: string | null;
  mailingState?: string | null;
  mailingPostalCode?: string | null;
  contactEmail?: string | null;
} = {};
if (typeof mailingAddress1 === 'string') invitationPatch.mailingAddress1 = mailingAddress1.trim() || null;
if (typeof mailingAddress2 === 'string') invitationPatch.mailingAddress2 = mailingAddress2.trim() || null;
if (typeof mailingCity === 'string') invitationPatch.mailingCity = mailingCity.trim() || null;
if (typeof mailingState === 'string') invitationPatch.mailingState = mailingState.trim() || null;
if (typeof mailingPostalCode === 'string') invitationPatch.mailingPostalCode = mailingPostalCode.trim() || null;
if (typeof contactEmail === 'string') invitationPatch.contactEmail = contactEmail.trim() || null;
if (Object.keys(invitationPatch).length > 0) {
  await prisma.invitation.update({ where: { id: invitationId }, data: invitationPatch });
}
```

- [ ] **Step 2: Update the admin modal state + seed + save**

Read `src/app/admin/(authenticated)/rsvps/page.tsx` first. In `RsvpsPage`:

(a) Replace the `[editAddress, setEditAddress]` state with 5 entries:

```tsx
const [editMailingAddress1, setEditMailingAddress1] = useState('');
const [editMailingAddress2, setEditMailingAddress2] = useState('');
const [editMailingCity, setEditMailingCity] = useState('');
const [editMailingState, setEditMailingState] = useState('');
const [editMailingPostalCode, setEditMailingPostalCode] = useState('');
```

(b) In the `Invitation` TypeScript interface at the top, remove the `address: string | null` field and add:

```tsx
mailingAddress1: string | null;
mailingAddress2: string | null;
mailingCity: string | null;
mailingState: string | null;
mailingPostalCode: string | null;
```

(c) In `openDetail`, replace `setEditAddress(inv.address || '');` with:

```tsx
setEditMailingAddress1(inv.mailingAddress1 || '');
setEditMailingAddress2(inv.mailingAddress2 || '');
setEditMailingCity(inv.mailingCity || '');
setEditMailingState(inv.mailingState || '');
setEditMailingPostalCode(inv.mailingPostalCode || '');
```

(d) In `handleSaveResponse`, replace the `address: editAddress.trim() || null` line in the body with:

```tsx
mailingAddress1: editMailingAddress1.trim() || null,
mailingAddress2: editMailingAddress2.trim() || null,
mailingCity: editMailingCity.trim() || null,
mailingState: editMailingState.trim() || null,
mailingPostalCode: editMailingPostalCode.trim() || null,
```

(e) In the edit form JSX, replace the existing mailing-address Textarea with:

```tsx
<div className="space-y-2">
  <label className="block text-sm font-medium">Mailing Address</label>
  <Input placeholder="Address line 1" value={editMailingAddress1} onChange={(e) => setEditMailingAddress1(e.target.value)} />
  <Input placeholder="Address line 2" value={editMailingAddress2} onChange={(e) => setEditMailingAddress2(e.target.value)} />
  <div className="grid grid-cols-3 gap-2">
    <Input className="col-span-2" placeholder="City" value={editMailingCity} onChange={(e) => setEditMailingCity(e.target.value)} />
    <Input placeholder="State" value={editMailingState} onChange={(e) => setEditMailingState(e.target.value)} />
  </div>
  <Input placeholder="Postal code" value={editMailingPostalCode} onChange={(e) => setEditMailingPostalCode(e.target.value)} />
</div>
```

(f) In the read-only modal view, replace the existing `selectedInvitation.address` block with:

```tsx
{(selectedInvitation.mailingAddress1 || selectedInvitation.mailingCity || selectedInvitation.mailingPostalCode) && (
  <div>
    <p className="text-sm font-medium text-gray-500">Mailing Address</p>
    <p className="text-sm whitespace-pre-line">
      {[selectedInvitation.mailingAddress1, selectedInvitation.mailingAddress2].filter(Boolean).join('\n')}
      {(selectedInvitation.mailingAddress1 || selectedInvitation.mailingAddress2) && '\n'}
      {[selectedInvitation.mailingCity, selectedInvitation.mailingState].filter(Boolean).join(', ')}
      {selectedInvitation.mailingPostalCode ? ` ${selectedInvitation.mailingPostalCode}` : ''}
    </p>
  </div>
)}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/rsvp/\[invitationId\]/route.ts "src/app/admin/(authenticated)/rsvps/page.tsx"
git commit -m "$(cat <<'EOF'
Admin RSVP edit: 5 structured address inputs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Release notes + final verification

**Files:**
- Modify: `release-notes.json`

- [ ] **Step 1: Draft the release-notes entry for the next version**

Per the memory rule `feedback_release_notes_before_bump.md`, release notes must be added before any version bump. The version bump itself is OUT of scope for this plan — user runs it separately via `./scripts/docker.sh bump-minor` when they're ready.

Read the current `release-notes.json` — you'll find entries for 2.8.0, 2.7.2, and 2.7.1 in reverse-chronological order. Add a new entry at the top (index 0) of the array. Today's date is the latest commit date; use whatever `date -I` returns.

```json
  {
    "version": "2.9.0",
    "date": "<today in YYYY-MM-DD>",
    "changes": [
      { "type": "feature", "text": "Bulk invitation import — upload an Excel sheet to create dozens of invitations at once. Download the included template from the Import page to share with your partner while building the guest list." },
      { "type": "feature", "text": "Structured mailing address — each invitation now has separate fields for Address Line 1, Line 2, City, State, and Postal Code. Ready to drive printable mailing labels later." },
      { "type": "improvement", "text": "RSVP form mailing address is now 5 separate inputs that pre-fill from whatever the admin imported. Saves the same structured data back on submit." }
    ]
  },
```

Fill the `date` field with whatever today's date is (`YYYY-MM-DD`).

- [ ] **Step 2: Run the full test suite and type-check**

Run: `npx vitest run && npx tsc --noEmit && echo OK`
Expected: all tests pass, no type errors, `OK` printed.

- [ ] **Step 3: Commit**

```bash
git add release-notes.json
git commit -m "$(cat <<'EOF'
Draft release notes for v2.9.0 (bulk invitation import + structured address)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Manual smoke test**

Start the dev server: `npm run dev`

Walk through:

1. Navigate to `/admin/invitations` → click "Import from Excel."
2. Click "Download template.xlsx" → verify file downloads, open in Excel/Numbers, check both sheets render correctly and the two sample rows are present.
3. Edit the template: delete the sample rows, add 3 real-ish rows (vary household sizes; make one row match an existing household name + address to test the duplicate flag; make one row have a blank household name to test the error flag).
4. Upload the edited file → verify preview shows counts of ready/duplicate/error correctly.
5. Fix the error row in-place in the preview table → watch it move from the Errors bucket to Ready.
6. Delete one of the rows via the ✕ button → verify it disappears and counts update.
7. Click Import → watch the progress modal, verify final report shows correct counts.
8. Navigate back to `/admin/invitations` → verify the new invitations appear.
9. Click one of the imported invitations to open the detail → verify structured address is visible.
10. Open the public RSVP form via the invitation's magic link → verify the 5 address inputs are pre-filled from the imported values.
11. Edit the address on the RSVP form, submit → verify the admin side shows the updated structured address.
12. (Stress) Upload a sheet with 100+ rows to exercise at least 2 chunk boundaries during commit — verify progress bar updates visibly.

Report any issues found; fix before declaring the plan complete.

---

## Notes on test scope

Route handlers are not unit-tested in this plan, consistent with the project's existing pattern of testing services (`src/lib/*`), not routes. The preview and commit routes are thin glue around thoroughly-tested functions in `invitationImport.ts`. Manual smoke test in Task 14 covers integration.

The RSVP form and admin modal changes are also not unit-tested — they're UI plumbing that reuses existing patterns (state + onChange handlers). Manual smoke test verifies end-to-end behavior.
