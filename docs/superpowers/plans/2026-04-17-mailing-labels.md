# Printable Mailing Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin generate an Avery-format PDF of mailing labels from their invitations' structured-address data, pick which labels to include, and print them to a physical sheet.

**Architecture:** Three small pure modules do all the work: `averyFormats.ts` holds the format table, `mailingLabelsPdf.ts` composes each label's lines + computes each label's coordinates + wraps `pdf-lib` to emit the PDF, and the admin page at `/admin/invitations/labels` is a thin selection UI that calls into those helpers. All PDF generation is client-side; no new API route or schema change.

**Tech Stack:** Next.js 15 App Router, `pdf-lib` (new dep; client-only), vitest.

**Spec:** [`docs/superpowers/specs/2026-04-17-mailing-labels-design.md`](../specs/2026-04-17-mailing-labels-design.md)

---

## Background notes for an engineer new to the codebase

- **Tests** live as siblings to source files: `src/lib/foo.ts` → `src/lib/foo.test.ts`. Vitest, node env, `@` alias → `./src`.
- **Commit trailer** (per CLAUDE.md): every commit must end with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. Use heredoc in `git commit -m`.
- **Prisma invitations** are fetched via `/api/invitations` (already exists) — returns full rows including the 5 structured mailing-address fields and the legacy `address`.
- **UI primitives**: `@/components/ui/card`, `.../button`, `.../input`, `.../textarea`. Match existing admin-page styling.
- **`pdf-lib`** is pure JS, no native deps, bundles to ~200KB gzipped. We dynamic-import it from the labels page so the main admin bundle doesn't grow.
- **Avery format numbers** in this plan are from Avery's published product specs. The manual smoke test in Task 6 asks you to overlay the output on an actual Avery sheet to verify alignment; minor tweaks to margins may be needed if Avery's current spec has shifted.

---

## Task 1: Install pdf-lib

**Files:**
- Modify: `package.json` (+ lockfile)

- [ ] **Step 1: Install the dep**

Run:
```bash
npm install pdf-lib
```

Expected: `pdf-lib` appears in `dependencies`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (pdf-lib ships its own types.)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
Add pdf-lib for client-side mailing-label PDF generation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Avery format library

**Files:**
- Create: `src/lib/averyFormats.ts`
- Create: `src/lib/averyFormats.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/averyFormats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AVERY_FORMATS, type AveryFormat } from './averyFormats';

describe('AVERY_FORMATS', () => {
  it('contains the four curated formats', () => {
    const codes = AVERY_FORMATS.map((f) => f.code).sort();
    expect(codes).toEqual(['5160', '5161', '5163', 'L7160']);
  });

  it.each(AVERY_FORMATS.map((f) => [f.code, f] as const))(
    '%s: cols * rows equals labelsPerSheet',
    (_code, f: AveryFormat) => {
      expect(f.cols * f.rows).toBe(f.labelsPerSheet);
    },
  );

  it.each(AVERY_FORMATS.map((f) => [f.code, f] as const))(
    '%s: horizontal layout fits on the page',
    (_code, f: AveryFormat) => {
      const totalWidth = f.marginLeft + f.cols * f.labelWidth + (f.cols - 1) * f.horizontalGap;
      // Allow a tiny numerical tolerance for the float arithmetic.
      expect(totalWidth).toBeLessThanOrEqual(f.pageWidth + 0.01);
    },
  );

  it.each(AVERY_FORMATS.map((f) => [f.code, f] as const))(
    '%s: vertical layout fits on the page',
    (_code, f: AveryFormat) => {
      const totalHeight = f.marginTop + f.rows * f.labelHeight + (f.rows - 1) * f.verticalGap;
      expect(totalHeight).toBeLessThanOrEqual(f.pageHeight + 0.01);
    },
  );

  it.each(AVERY_FORMATS.map((f) => [f.code, f] as const))(
    '%s: has a non-empty displayName',
    (_code, f: AveryFormat) => {
      expect(f.displayName.length).toBeGreaterThan(0);
    },
  );
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/averyFormats.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the format table**

Create `src/lib/averyFormats.ts`:

```ts
// Avery label format specs. All measurements in inches. A4-paper formats
// (like L7160) use inches-equivalent values for uniformity; the renderer
// converts inches to PDF points at draw time.
//
// Numbers taken from Avery's published specs. If a manual print doesn't
// line up on a real sheet, adjust marginTop / marginLeft here.

export interface AveryFormat {
  code: '5160' | '5161' | '5163' | 'L7160';
  displayName: string;
  paper: 'letter' | 'a4';
  pageWidth: number;          // inches
  pageHeight: number;         // inches
  marginTop: number;          // inches, to top edge of first row
  marginLeft: number;         // inches, to left edge of first column
  labelWidth: number;         // inches
  labelHeight: number;        // inches
  horizontalGap: number;      // inches, between columns
  verticalGap: number;        // inches, between rows
  cols: number;
  rows: number;
  labelsPerSheet: number;     // denormalized cols × rows
}

export const AVERY_FORMATS: AveryFormat[] = [
  {
    code: '5160',
    displayName: 'Avery 5160 — 30 labels/sheet (1" × 2⅝")',
    paper: 'letter',
    pageWidth: 8.5,
    pageHeight: 11,
    marginTop: 0.5,
    marginLeft: 0.1875,
    labelWidth: 2.625,
    labelHeight: 1.0,
    horizontalGap: 0.125,
    verticalGap: 0,
    cols: 3,
    rows: 10,
    labelsPerSheet: 30,
  },
  {
    code: '5161',
    displayName: 'Avery 5161 — 20 labels/sheet (1" × 4")',
    paper: 'letter',
    pageWidth: 8.5,
    pageHeight: 11,
    marginTop: 0.5,
    marginLeft: 0.15625,
    labelWidth: 4.0,
    labelHeight: 1.0,
    horizontalGap: 0.1875,
    verticalGap: 0,
    cols: 2,
    rows: 10,
    labelsPerSheet: 20,
  },
  {
    code: '5163',
    displayName: 'Avery 5163 — 10 labels/sheet (2" × 4")',
    paper: 'letter',
    pageWidth: 8.5,
    pageHeight: 11,
    marginTop: 0.5,
    marginLeft: 0.15625,
    labelWidth: 4.0,
    labelHeight: 2.0,
    horizontalGap: 0.1875,
    verticalGap: 0,
    cols: 2,
    rows: 5,
    labelsPerSheet: 10,
  },
  {
    code: 'L7160',
    displayName: 'Avery L7160 — 21 labels/sheet (A4, 1.5" × 2.5")',
    paper: 'a4',
    pageWidth: 8.267,   // 210 mm
    pageHeight: 11.693, // 297 mm
    marginTop: 0.606,   // 15.4 mm
    marginLeft: 0.28,   // 7.1 mm
    labelWidth: 2.5,    // 63.5 mm
    labelHeight: 1.5,   // 38.1 mm
    horizontalGap: 0.1, // 2.5 mm
    verticalGap: 0,
    cols: 3,
    rows: 7,
    labelsPerSheet: 21,
  },
];
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/averyFormats.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/averyFormats.ts src/lib/averyFormats.test.ts
git commit -m "$(cat <<'EOF'
Add Avery format library (5160, 5161, 5163, L7160)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Pure helpers — `composeLabelLines` + `computeLabelPositions`

**Files:**
- Create: `src/lib/mailingLabelsPdf.ts`
- Create: `src/lib/mailingLabelsPdf.test.ts`

These two are pure (no pdf-lib dependency); testing them doesn't require rendering any actual PDFs. Task 4 adds the pdf-lib-using `renderLabelsPdf` to the same file.

- [ ] **Step 1: Write failing tests**

Create `src/lib/mailingLabelsPdf.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { composeLabelLines, computeLabelPositions } from './mailingLabelsPdf';
import { AVERY_FORMATS } from './averyFormats';

const format5160 = AVERY_FORMATS.find((f) => f.code === '5160')!;

describe('composeLabelLines', () => {
  it('includes all 4 lines when every field is populated', () => {
    expect(composeLabelLines({
      householdName: 'The Smiths',
      mailingAddress1: '123 Main St',
      mailingAddress2: 'Apt 2',
      mailingCity: 'Springfield',
      mailingState: 'IL',
      mailingPostalCode: '62704',
      address: null,
    })).toEqual([
      'The Smiths',
      '123 Main St',
      'Apt 2',
      'Springfield, IL 62704',
    ]);
  });

  it('omits address line 2 when empty', () => {
    expect(composeLabelLines({
      householdName: 'The Smiths',
      mailingAddress1: '123 Main St',
      mailingAddress2: null,
      mailingCity: 'Springfield',
      mailingState: 'IL',
      mailingPostalCode: '62704',
      address: null,
    })).toEqual([
      'The Smiths',
      '123 Main St',
      'Springfield, IL 62704',
    ]);
  });

  it('falls back to legacy address field when mailingAddress1 is empty', () => {
    expect(composeLabelLines({
      householdName: 'The Smiths',
      mailingAddress1: null,
      mailingAddress2: null,
      mailingCity: null,
      mailingState: null,
      mailingPostalCode: null,
      address: '123 Old St, Springfield, IL 62704',
    })).toEqual([
      'The Smiths',
      '123 Old St, Springfield, IL 62704',
    ]);
  });

  it('joins partial city/state/zip sensibly', () => {
    // City only — no comma trail.
    expect(composeLabelLines({
      householdName: 'A',
      mailingAddress1: '1 A St',
      mailingAddress2: null,
      mailingCity: 'Springfield',
      mailingState: null,
      mailingPostalCode: null,
      address: null,
    })).toEqual(['A', '1 A St', 'Springfield']);

    // State + zip only — no leading comma.
    expect(composeLabelLines({
      householdName: 'A',
      mailingAddress1: '1 A St',
      mailingAddress2: null,
      mailingCity: null,
      mailingState: 'IL',
      mailingPostalCode: '62704',
      address: null,
    })).toEqual(['A', '1 A St', 'IL 62704']);
  });

  it('returns only the household name when there is no address data at all', () => {
    expect(composeLabelLines({
      householdName: 'The Smiths',
      mailingAddress1: null,
      mailingAddress2: null,
      mailingCity: null,
      mailingState: null,
      mailingPostalCode: null,
      address: null,
    })).toEqual(['The Smiths']);
  });

  it('trims whitespace on all components', () => {
    expect(composeLabelLines({
      householdName: '  The Smiths  ',
      mailingAddress1: '  123 Main St  ',
      mailingAddress2: null,
      mailingCity: '  Springfield  ',
      mailingState: '  IL  ',
      mailingPostalCode: '  62704  ',
      address: null,
    })).toEqual([
      'The Smiths',
      '123 Main St',
      'Springfield, IL 62704',
    ]);
  });
});

describe('computeLabelPositions', () => {
  it('places the first label at the top-left of the first page for startPosition=1', () => {
    const positions = computeLabelPositions({
      format: format5160,
      startPosition: 1,
      labelCount: 1,
    });
    expect(positions).toHaveLength(1);
    expect(positions[0].pageIndex).toBe(0);
    // Top of first row = marginTop from top; x = marginLeft from left.
    expect(positions[0].xInches).toBeCloseTo(format5160.marginLeft);
    expect(positions[0].yInchesFromTop).toBeCloseTo(format5160.marginTop);
  });

  it('uses startPosition to skip the first N-1 slots', () => {
    // Slot 13 of 5160 (3 cols × 10 rows) = row 4 (0-indexed), col 0.
    const positions = computeLabelPositions({
      format: format5160,
      startPosition: 13,
      labelCount: 1,
    });
    expect(positions).toHaveLength(1);
    expect(positions[0].pageIndex).toBe(0);
    const expectedY = format5160.marginTop + 4 * (format5160.labelHeight + format5160.verticalGap);
    expect(positions[0].yInchesFromTop).toBeCloseTo(expectedY);
  });

  it('starts a new page when slots run out', () => {
    // 5160 has 30 slots per sheet. Start at 1, want 31 labels → page 1 gets labels 1-30, page 2 gets label 31.
    const positions = computeLabelPositions({
      format: format5160,
      startPosition: 1,
      labelCount: 31,
    });
    expect(positions).toHaveLength(31);
    expect(positions[29].pageIndex).toBe(0);
    expect(positions[30].pageIndex).toBe(1);
    // First slot on page 2 is back at top-left.
    expect(positions[30].xInches).toBeCloseTo(format5160.marginLeft);
    expect(positions[30].yInchesFromTop).toBeCloseTo(format5160.marginTop);
  });

  it('returns empty array for zero labels', () => {
    expect(computeLabelPositions({
      format: format5160,
      startPosition: 1,
      labelCount: 0,
    })).toEqual([]);
  });

  it('handles startPosition > 1 crossing a page boundary correctly', () => {
    // 5160: 30 slots. Start at 25, want 10 labels → 6 on page 1 (slots 25-30), 4 on page 2 (slots 1-4).
    const positions = computeLabelPositions({
      format: format5160,
      startPosition: 25,
      labelCount: 10,
    });
    expect(positions).toHaveLength(10);
    expect(positions[5].pageIndex).toBe(0);  // slot 30
    expect(positions[6].pageIndex).toBe(1);  // slot 1 of page 2
    expect(positions[6].xInches).toBeCloseTo(format5160.marginLeft);
    expect(positions[6].yInchesFromTop).toBeCloseTo(format5160.marginTop);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/mailingLabelsPdf.test.ts`
Expected: FAIL — `mailingLabelsPdf.ts` doesn't exist yet.

- [ ] **Step 3: Implement the pure helpers**

Create `src/lib/mailingLabelsPdf.ts`:

```ts
import type { AveryFormat } from './averyFormats';

// Minimal invitation shape the label composer needs. Matches the subset of
// fields Prisma returns on the admin /api/invitations endpoint.
export interface LabelSource {
  householdName: string;
  mailingAddress1: string | null;
  mailingAddress2: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingPostalCode: string | null;
  address: string | null;  // legacy pre-2.9 free-text fallback
}

// Produces the 2–4 lines of text that go on a single label.
// Household always line 1. Prefer structured mailing fields; fall back to
// the legacy `address` text as a single line if mailingAddress1 is empty.
// Address line 2 is only emitted when non-empty. City/state/zip joined with
// a comma between city and state and a space before the zip; each component
// optional so "IL 62704" and "Springfield" both render cleanly.
export function composeLabelLines(src: LabelSource): string[] {
  const lines: string[] = [];
  const hh = src.householdName.trim();
  if (hh) lines.push(hh);

  const a1 = src.mailingAddress1?.trim();
  if (a1) {
    lines.push(a1);
    const a2 = src.mailingAddress2?.trim();
    if (a2) lines.push(a2);
  } else if (src.address?.trim()) {
    lines.push(src.address.trim());
  }

  const city = src.mailingCity?.trim();
  const state = src.mailingState?.trim();
  const zip = src.mailingPostalCode?.trim();
  const cityState = [city, state].filter(Boolean).join(', ');
  const cityStateZip = [cityState, zip].filter(Boolean).join(' ');
  if (cityStateZip) lines.push(cityStateZip);

  return lines;
}

export interface LabelPosition {
  pageIndex: number;
  xInches: number;           // left edge of the label on its page
  yInchesFromTop: number;    // top edge of the label, measured from the page top
}

// Given a format + starting slot + number of labels, compute where each
// label lands. Pure math — no pdf-lib involved. The renderer in Task 4
// converts inches to PDF points and draws inside each box.
export function computeLabelPositions(args: {
  format: AveryFormat;
  startPosition: number;    // 1-indexed; 1 = first slot on the first page
  labelCount: number;
}): LabelPosition[] {
  const { format, startPosition, labelCount } = args;
  const positions: LabelPosition[] = [];
  for (let i = 0; i < labelCount; i++) {
    const gridIndex = (startPosition - 1) + i;
    const pageIndex = Math.floor(gridIndex / format.labelsPerSheet);
    const slotInPage = gridIndex % format.labelsPerSheet;
    const col = slotInPage % format.cols;
    const row = Math.floor(slotInPage / format.cols);
    positions.push({
      pageIndex,
      xInches: format.marginLeft + col * (format.labelWidth + format.horizontalGap),
      yInchesFromTop: format.marginTop + row * (format.labelHeight + format.verticalGap),
    });
  }
  return positions;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/mailingLabelsPdf.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mailingLabelsPdf.ts src/lib/mailingLabelsPdf.test.ts
git commit -m "$(cat <<'EOF'
Add composeLabelLines and computeLabelPositions helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `renderLabelsPdf` — pdf-lib wrapper

**Files:**
- Modify: `src/lib/mailingLabelsPdf.ts` (append — do NOT modify Task 3 exports)
- Modify: `src/lib/mailingLabelsPdf.test.ts` (append a new describe block)

- [ ] **Step 1: Write failing tests**

Append to `src/lib/mailingLabelsPdf.test.ts`:

```ts
import { renderLabelsPdf } from './mailingLabelsPdf';
import { PDFDocument } from 'pdf-lib';

describe('renderLabelsPdf', () => {
  it('returns a valid PDF buffer (starts with %PDF)', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: [{ lines: ['The Smiths', '123 Main St', 'Springfield, IL 62704'] }],
    });
    expect(bytes.byteLength).toBeGreaterThan(0);
    const header = new TextDecoder().decode(bytes.slice(0, 4));
    expect(header).toBe('%PDF');
  });

  it('creates one page for a small label set that fits on one sheet', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: Array.from({ length: 5 }, (_, i) => ({ lines: [`Row ${i}`] })),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('creates multiple pages when labels overflow a single sheet', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: Array.from({ length: 40 }, (_, i) => ({ lines: [`Row ${i}`] })),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it('produces a page of the expected size for the given format', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: [{ lines: ['Solo'] }],
    });
    const doc = await PDFDocument.load(bytes);
    const page = doc.getPage(0);
    // pdf-lib uses points (1 inch = 72 points). 8.5 × 11 inch → 612 × 792 points.
    expect(page.getWidth()).toBeCloseTo(format5160.pageWidth * 72);
    expect(page.getHeight()).toBeCloseTo(format5160.pageHeight * 72);
  });

  it('startPosition=5 places labels starting at slot 5 on the first page', async () => {
    // 5 empty slots + 3 labels → still all on page 1, page count still 1.
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 5,
      labels: [
        { lines: ['A'] }, { lines: ['B'] }, { lines: ['C'] },
      ],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/mailingLabelsPdf.test.ts`
Expected: the new `renderLabelsPdf` block FAILs — function not exported.

- [ ] **Step 3: Implement `renderLabelsPdf`**

Append to `src/lib/mailingLabelsPdf.ts`:

```ts
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';

// Inner padding inside each label box (in inches). Keeps text off the edges
// where label perforations or cutter tolerances might swallow it.
const LABEL_PADDING_IN = 0.1;

// Base font size per format. Larger formats get bigger text by default.
function baseFontSize(format: AveryFormat): number {
  if (format.code === '5163') return 12;  // 2"×4" — more room
  return 10;
}

const MIN_FONT_SIZE = 7;

// Returns the largest font size ≤ desiredSize where every line fits inside
// the given pixel-width box. Floors at MIN_FONT_SIZE; if even that doesn't
// fit, the caller truncates with an ellipsis (handled in drawLabel below).
function fitFontSize(args: {
  lines: string[];
  font: PDFFont;
  maxWidthPt: number;
  desiredSize: number;
}): number {
  const { lines, font, maxWidthPt, desiredSize } = args;
  let size = desiredSize;
  while (size > MIN_FONT_SIZE) {
    const widest = Math.max(...lines.map((l) => font.widthOfTextAtSize(l, size)));
    if (widest <= maxWidthPt) return size;
    size -= 0.5;
  }
  return MIN_FONT_SIZE;
}

// If the line still doesn't fit at the minimum font size, append "…" and
// chop characters from the end until it does. Unlikely in practice with
// real addresses; this is the last-resort fallback.
function truncateToFit(line: string, font: PDFFont, size: number, maxWidthPt: number): string {
  if (font.widthOfTextAtSize(line, size) <= maxWidthPt) return line;
  let text = line;
  while (text.length > 1 && font.widthOfTextAtSize(text + '…', size) > maxWidthPt) {
    text = text.slice(0, -1);
  }
  return text + '…';
}

// Main entry point for the admin page. All args are plain data; nothing
// depends on browser DOM or server APIs.
export async function renderLabelsPdf(args: {
  format: AveryFormat;
  startPosition: number;
  labels: Array<{ lines: string[] }>;
}): Promise<Uint8Array> {
  const { format, startPosition, labels } = args;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const positions = computeLabelPositions({
    format,
    startPosition,
    labelCount: labels.length,
  });

  const pageWidthPt = format.pageWidth * 72;
  const pageHeightPt = format.pageHeight * 72;
  const labelWidthPt = format.labelWidth * 72;
  const labelHeightPt = format.labelHeight * 72;
  const paddingPt = LABEL_PADDING_IN * 72;
  const maxTextWidthPt = labelWidthPt - paddingPt * 2;

  // Lazy-create pages as positions reference new pageIndexes. Using a sparse
  // map keeps this correct even if startPosition skips right past a page.
  const pagesByIndex = new Map<number, ReturnType<typeof doc.addPage>>();
  const getPage = (index: number) => {
    let page = pagesByIndex.get(index);
    if (!page) {
      page = doc.addPage([pageWidthPt, pageHeightPt]);
      pagesByIndex.set(index, page);
    }
    return page;
  };

  // Pre-create page 0 so the final PDF always has at least one page even
  // when labels.length === 0.
  getPage(0);

  labels.forEach((label, i) => {
    const pos = positions[i];
    const page = getPage(pos.pageIndex);

    const desiredSize = baseFontSize(format);
    const fontSize = fitFontSize({
      lines: label.lines,
      font,
      maxWidthPt: maxTextWidthPt,
      desiredSize,
    });
    const leading = fontSize * 1.2;

    // Label box top-left in PDF coordinates (origin = bottom-left of page).
    const boxLeftPt = pos.xInches * 72;
    const boxTopPt = pageHeightPt - pos.yInchesFromTop * 72;

    label.lines.forEach((rawLine, lineIndex) => {
      const line = truncateToFit(rawLine, font, fontSize, maxTextWidthPt);
      // Baseline y = boxTop - padding - fontSize - lineIndex * leading.
      const baselineY = boxTopPt - paddingPt - fontSize - lineIndex * leading;
      // Don't draw lines that would fall below the label box.
      if (baselineY < boxTopPt - labelHeightPt + paddingPt) return;
      page.drawText(line, {
        x: boxLeftPt + paddingPt,
        y: baselineY,
        size: fontSize,
        font,
      });
    });
  });

  return doc.save();
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/mailingLabelsPdf.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Full type-check + test run**

Run: `npx tsc --noEmit && npx vitest run && echo OK`
Expected: no type errors, all tests pass, `OK` printed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mailingLabelsPdf.ts src/lib/mailingLabelsPdf.test.ts
git commit -m "$(cat <<'EOF'
Add renderLabelsPdf — pdf-lib-based Avery-sheet PDF generator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Admin UI page

**Files:**
- Create: `src/app/admin/(authenticated)/invitations/labels/page.tsx`

- [ ] **Step 1: Implement the page**

Create `src/app/admin/(authenticated)/invitations/labels/page.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AVERY_FORMATS, type AveryFormat } from '@/lib/averyFormats';
import { composeLabelLines, type LabelSource } from '@/lib/mailingLabelsPdf';

interface InvitationForLabels {
  id: string;
  householdName: string;
  mailingAddress1: string | null;
  mailingAddress2: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingPostalCode: string | null;
  address: string | null;
  response: { attending: string } | null;
}

// Returns true if this invitation has anything we can turn into a label.
// At minimum we need a household name AND either a structured line 1 or a
// legacy free-text address.
function hasAddress(inv: InvitationForLabels): boolean {
  if (!inv.householdName.trim()) return false;
  if (inv.mailingAddress1?.trim()) return true;
  if (inv.address?.trim()) return true;
  return false;
}

export default function MailingLabelsPage() {
  const [invitations, setInvitations] = useState<InvitationForLabels[]>([]);
  const [loading, setLoading] = useState(true);
  const [formatCode, setFormatCode] = useState<AveryFormat['code']>('5160');
  const [startPosition, setStartPosition] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const format = useMemo(
    () => AVERY_FORMATS.find((f) => f.code === formatCode)!,
    [formatCode],
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/invitations');
        if (!res.ok) throw new Error('Failed to load invitations');
        const data = (await res.json()) as InvitationForLabels[];
        // Sort alphabetically by household name.
        data.sort((a, b) => a.householdName.localeCompare(b.householdName));
        setInvitations(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Clamp startPosition whenever format changes — if the admin had position 25
  // on 5160 (30/sheet) and switches to 5163 (10/sheet), clamp to 10.
  useEffect(() => {
    setStartPosition((p) => Math.min(p, format.labelsPerSheet));
  }, [format]);

  const selectAllWithAddress = () => {
    setSelectedIds(new Set(invitations.filter(hasAddress).map((i) => i.id)));
  };
  const selectAttending = () => {
    setSelectedIds(new Set(
      invitations.filter((i) => hasAddress(i) && i.response?.attending === 'yes').map((i) => i.id),
    ));
  };
  const selectPending = () => {
    setSelectedIds(new Set(
      invitations.filter((i) => hasAddress(i) && !i.response).map((i) => i.id),
    ));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      // Dynamic import so pdf-lib isn't pulled into any page that doesn't
      // actually use it.
      const { renderLabelsPdf } = await import('@/lib/mailingLabelsPdf');
      const selected = invitations.filter((i) => selectedIds.has(i.id));
      const labels = selected.map((inv) => ({
        lines: composeLabelLines(inv as LabelSource),
      }));
      const bytes = await renderLabelsPdf({ format, startPosition, labels });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `mailing-labels-${formatCode}-${today}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="p-6"><p className="text-sm text-gray-500">Loading…</p></div>;

  const canGenerate = selectedIds.size > 0
    && startPosition >= 1
    && startPosition <= format.labelsPerSheet;

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Print Mailing Labels</h1>
          <p className="text-sm text-gray-500">
            Generate a PDF of Avery-format mailing labels from the invitations' addresses.
            Pick a format and which invitations to include, then print the PDF onto a real sheet.
          </p>
        </div>
        <Link href="/admin/invitations" className="text-sm text-primary hover:underline">
          ← Back to Invitations
        </Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Label sheet</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Format</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              value={formatCode}
              onChange={(e) => setFormatCode(e.target.value as AveryFormat['code'])}
            >
              {AVERY_FORMATS.map((f) => (
                <option key={f.code} value={f.code}>{f.displayName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start at label position</label>
            <Input
              type="number"
              min={1}
              max={format.labelsPerSheet}
              value={startPosition}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setStartPosition(Math.max(1, Math.min(format.labelsPerSheet, n)));
              }}
            />
            <p className="text-xs text-gray-500 mt-1">
              1 to {format.labelsPerSheet}. Use this to reuse a partially-used sheet — earlier positions will be left blank on the first page.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-baseline justify-between">
            <CardTitle>Invitations</CardTitle>
            <span className="text-sm text-gray-500">{selectedIds.size} selected</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Button size="sm" variant="outline" onClick={selectAllWithAddress}>Select all with address</Button>
            <Button size="sm" variant="outline" onClick={selectAttending}>Select attending</Button>
            <Button size="sm" variant="outline" onClick={selectPending}>Select pending</Button>
            <Button size="sm" variant="outline" onClick={clearSelection}>Clear selection</Button>
          </div>

          <div className="divide-y border border-gray-200 rounded">
            {invitations.map((inv) => {
              const canInclude = hasAddress(inv);
              const lines = canInclude ? composeLabelLines(inv as LabelSource) : [];
              const previewAddress = lines.slice(1).join(' · ');
              const status = inv.response?.attending === 'yes'
                ? { text: 'attending', className: 'bg-emerald-100 text-emerald-800' }
                : inv.response?.attending === 'no'
                ? { text: 'declined', className: 'bg-gray-100 text-gray-600' }
                : { text: 'pending', className: 'bg-amber-100 text-amber-800' };
              return (
                <label
                  key={inv.id}
                  className={`flex items-center gap-3 px-3 py-2 text-sm ${canInclude ? 'cursor-pointer' : 'opacity-60'}`}
                >
                  <input
                    type="checkbox"
                    disabled={!canInclude}
                    checked={selectedIds.has(inv.id)}
                    onChange={() => toggleRow(inv.id)}
                    className="h-4 w-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{inv.householdName}</div>
                    {canInclude
                      ? <div className="text-xs text-gray-500 truncate">{previewAddress}</div>
                      : <div className="text-xs italic text-gray-400">no address on file</div>
                    }
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${status.className}`}>{status.text}</span>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="sticky bottom-0 bg-gray-50 py-3 -mx-6 px-6 border-t border-gray-200 flex items-center gap-3">
        <Button disabled={!canGenerate || generating} onClick={handleGenerate}>
          {generating ? 'Generating…' : `Generate PDF for ${selectedIds.size} label${selectedIds.size === 1 ? '' : 's'}`}
        </Button>
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
git add "src/app/admin/(authenticated)/invitations/labels/page.tsx"
git commit -m "$(cat <<'EOF'
Add mailing-labels admin page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Link-in button + release notes + manual smoke test

**Files:**
- Modify: `src/app/admin/(authenticated)/invitations/page.tsx`
- Modify: `release-notes.json`

- [ ] **Step 1: Add "Print mailing labels" button to the invitations page**

Read `src/app/admin/(authenticated)/invitations/page.tsx`. Locate the existing `<Button variant="outline" onClick={exportAddresses}>Export addresses</Button>` button. Add a sibling link immediately after it:

```tsx
<Link href="/admin/invitations/labels">
  <Button variant="outline">Print mailing labels</Button>
</Link>
```

Verify `Link` is imported at the top of the file (`import Link from 'next/link';`). It should already be there from earlier "Import from Excel" work — if not, add it.

- [ ] **Step 2: Add the release-notes entry**

Read the current `release-notes.json` — it's an array, newest first. Get today's date via `date -I` (YYYY-MM-DD).

Insert a new entry at index 0:

```json
  {
    "version": "2.10.0",
    "date": "<today in YYYY-MM-DD>",
    "changes": [
      { "type": "feature", "text": "Printable mailing labels — generate Avery-format PDF label sheets from your invitations' addresses. Supports Avery 5160, 5161, 5163, and L7160 (A4). Includes a start-position input so you can reuse partially-used sheets." }
    ]
  },
```

Make sure the JSON stays valid (comma after the new entry's closing brace, before the existing 2.9.1 entry).

- [ ] **Step 3: Full type-check + test suite**

Run: `npx tsc --noEmit && npx vitest run && echo OK`
Expected: no type errors, all tests pass, `OK` printed.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(authenticated)/invitations/page.tsx" release-notes.json
git commit -m "$(cat <<'EOF'
Link mailing-labels page + draft release notes for v2.10.0

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Manual smoke test**

Start the dev server: `npm run dev`

Walk through the spec's smoke-test checklist:

1. From `/admin/invitations`, click **Print mailing labels** → lands on `/admin/invitations/labels`.
2. Select format **5160**, keep start position = 1, click **Select all with address** → checkboxes light up for every invitation that has an address. Count badge updates.
3. Click **Generate PDF for N labels** → PDF downloads with filename `mailing-labels-5160-YYYY-MM-DD.pdf`.
4. Open the PDF. Ideally overlay it on Avery's official 5160 template PDF (downloadable from avery.com) in a viewer → verify the text lands in each label box. Minor (<2mm) misalignment: tweak `marginTop` / `marginLeft` for that format in `src/lib/averyFormats.ts`.
5. Change format to **5163** → start-position clamps to 10 if it was higher. Regenerate → verify bigger labels, 2 columns × 5 rows.
6. Change format to **L7160** → A4 page size, 3 × 7 grid, metric spacing. Regenerate → verify.
7. Set start position to 13 on 5160, select 5 invitations → verify output has the first 12 slots blank and labels at 13–17.
8. Select 40+ invitations on 5160 → verify the PDF has 2 pages.
9. Include an invitation with only a legacy free-text `address` (not structured fields) → verify it renders with the legacy address as line 2.
10. Try an invitation with a very long household name → verify the label shrinks its font or truncates with ellipsis rather than overflowing.

Report any positioning issues found during step 4 — these are adjusted in `averyFormats.ts` and don't require a new commit for each micro-tweak if you batch them.

---

## Notes on test scope

Consistent with the project pattern: library code (`averyFormats.ts`, `mailingLabelsPdf.ts`) is unit-tested thoroughly; the admin page is not. The page is thin glue — loads invitations, tracks selection, calls `renderLabelsPdf`, triggers a download. Manual smoke test in Task 6 covers its integration surface.

PDF-layout correctness (does it actually land on a real Avery sheet?) can only be verified by printing one, so that lives in the manual smoke test — no automated test can meaningfully check physical alignment.
