# RSVP Code Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print RSVP codes on Avery peel-and-stick label sheets so the couple can sticker pre-printed invite cards instead of printing and cutting the QR-card PDF.

**Architecture:** Generalize the existing client-side label renderer (`src/lib/mailingLabelsPdf.ts`, pdf-lib) to support per-line emphasis (bold + 1.4× size), add a pure `composeCodeLabelLines` composer, and add a "Label type" selector to the existing `/admin/invitations/labels` page. No API or schema changes — the page already fetches invitations (which include `code`) and renders PDFs in the browser.

**Tech Stack:** Next.js 16 App Router (client page), pdf-lib, vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-rsvp-code-labels-design.md`.
- Emphasized lines: Helvetica-Bold at **1.4×** the label's fitted base size; per-line leading = 1.2 × that line's effective size.
- Auto-shrink floor stays **7pt** (base size); ellipsis truncation stays the last resort.
- Existing address-label behavior must be byte-for-byte compatible in intent: plain string lines render exactly as before (regular Helvetica, base size).
- Code-label download filename: `rsvp-code-labels-<formatCode>-<YYYY-MM-DD>.pdf`.
- No new feature flag. Commit convention: sentence-case imperative subject + Claude trailer.
- Verify per task: `npx vitest run src/lib/mailingLabelsPdf.test.ts`, and `npx tsc --noEmit` before each commit.

---

### Task 1: Styled label lines + code-label composer in mailingLabelsPdf.ts

**Files:**
- Modify: `src/lib/mailingLabelsPdf.ts`
- Test: `src/lib/mailingLabelsPdf.test.ts`

**Interfaces:**
- Consumes: existing `AveryFormat` from `src/lib/averyFormats.ts`, existing `renderLabelsPdf` internals.
- Produces (Task 2 relies on these exact names):
  - `export type LabelLine = string | { text: string; emphasis?: boolean }`
  - `export function composeCodeLabelLines(src: { householdName: string; code: string }): LabelLine[]`
  - `renderLabelsPdf(args: { format: AveryFormat; startPosition: number; labels: Array<{ lines: LabelLine[] }> }): Promise<Uint8Array>` (widened `lines` type; plain-string callers unaffected)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/mailingLabelsPdf.test.ts` (imports at the top of the file: add `composeCodeLabelLines` to the existing import from `./mailingLabelsPdf`):

```ts
describe('composeCodeLabelLines', () => {
  it('returns household name then an emphasized code line', () => {
    expect(composeCodeLabelLines({ householdName: 'The Smiths', code: '483920' })).toEqual([
      'The Smiths',
      { text: 'RSVP code: 483920', emphasis: true },
    ]);
  });

  it('trims whitespace and omits an empty household name', () => {
    expect(composeCodeLabelLines({ householdName: '   ', code: ' 483920 ' })).toEqual([
      { text: 'RSVP code: 483920', emphasis: true },
    ]);
  });
});

describe('renderLabelsPdf with emphasized lines', () => {
  it('renders styled labels into a valid PDF that embeds Helvetica-Bold', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: [{ lines: ['The Smiths', { text: 'RSVP code: 483920', emphasis: true }] }],
    });
    const header = new TextDecoder().decode(bytes.slice(0, 4));
    expect(header).toBe('%PDF');
    // Standard-14 fonts are referenced by BaseFont name in the PDF body.
    const body = new TextDecoder('latin1').decode(bytes);
    expect(body).toContain('Helvetica-Bold');
  });

  it('shrinks the base size until the emphasized line fits (no crash on long codes)', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: [{
        lines: [
          'A very long household name that will need shrinking to fit',
          { text: 'RSVP code: 483920483920483920', emphasis: true },
        ],
      }],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('still accepts plain string lines exactly as before', async () => {
    const bytes = await renderLabelsPdf({
      format: format5160,
      startPosition: 1,
      labels: [{ lines: ['The Smiths', '123 Main St'] }],
    });
    const body = new TextDecoder('latin1').decode(bytes);
    expect(body).toContain('Helvetica');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/mailingLabelsPdf.test.ts`
Expected: FAIL — `composeCodeLabelLines` is not exported; TS error on styled line objects.

- [ ] **Step 3: Implement**

In `src/lib/mailingLabelsPdf.ts`:

1. Add after the `LabelSource` interface:

```ts
// A label line is plain text, or text flagged for emphasis. Emphasized lines
// render in Helvetica-Bold at EMPHASIS_SCALE × the label's fitted base size —
// used for the RSVP code so it reads at a glance on a 1" label.
export type LabelLine = string | { text: string; emphasis?: boolean };

const EMPHASIS_SCALE = 1.4;

function lineText(line: LabelLine): string {
  return typeof line === 'string' ? line : line.text;
}

function lineScale(line: LabelLine): number {
  return typeof line !== 'string' && line.emphasis ? EMPHASIS_SCALE : 1;
}

// Produces the lines for an RSVP-code label: household name (regular) with
// the code underneath in bold. The name is deliberate — codes are
// per-household and an unlabeled sticker mixup sends guests into someone
// else's RSVP.
export function composeCodeLabelLines(src: { householdName: string; code: string }): LabelLine[] {
  const lines: LabelLine[] = [];
  const hh = src.householdName.trim();
  if (hh) lines.push(hh);
  lines.push({ text: `RSVP code: ${src.code.trim()}`, emphasis: true });
  return lines;
}
```

2. Replace `fitFontSize` so every line is measured with its own font and scale:

```ts
// Returns the largest BASE font size ≤ desiredSize where every line fits the
// box width at its own effective size (base × emphasis scale) and font.
// Floors at MIN_FONT_SIZE; the caller truncates with an ellipsis beyond that.
function fitFontSize(args: {
  lines: LabelLine[];
  fonts: { regular: PDFFont; bold: PDFFont };
  maxWidthPt: number;
  desiredSize: number;
}): number {
  const { lines, fonts, maxWidthPt, desiredSize } = args;
  let size = desiredSize;
  while (size > MIN_FONT_SIZE) {
    const widest = Math.max(...lines.map((l) => {
      const font = lineScale(l) > 1 ? fonts.bold : fonts.regular;
      return font.widthOfTextAtSize(lineText(l), size * lineScale(l));
    }));
    if (widest <= maxWidthPt) return size;
    size -= 0.5;
  }
  return MIN_FONT_SIZE;
}
```

3. In `renderLabelsPdf`: widen the arg type to `labels: Array<{ lines: LabelLine[] }>`, embed both fonts, and draw with a per-line cursor instead of uniform leading:

```ts
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
```

and replace the per-label draw block with:

```ts
  labels.forEach((label, i) => {
    const pos = positions[i];
    const page = getPage(pos.pageIndex);

    const desiredSize = baseFontSize(format);
    const fontSize = fitFontSize({
      lines: label.lines,
      fonts: { regular: font, bold: boldFont },
      maxWidthPt: maxTextWidthPt,
      desiredSize,
    });

    // Label box top-left in PDF coordinates (origin = bottom-left of page).
    const boxLeftPt = pos.xInches * 72;
    const boxTopPt = pageHeightPt - pos.yInchesFromTop * 72;
    const boxBottomLimitPt = boxTopPt - labelHeightPt + paddingPt;

    // Per-line cursor: each line's leading (1.2×) derives from its own
    // effective size, so a bold code line gets proportionally more room.
    let cursorTopPt = boxTopPt - paddingPt;
    label.lines.forEach((rawLine) => {
      const scale = lineScale(rawLine);
      const effectiveSize = fontSize * scale;
      const lineFont = scale > 1 ? boldFont : font;
      const line = truncateToFit(lineText(rawLine), lineFont, effectiveSize, maxTextWidthPt);
      const baselineY = cursorTopPt - effectiveSize;
      cursorTopPt = baselineY - effectiveSize * 0.2;
      // Don't draw lines that would fall below the label box.
      if (baselineY < boxBottomLimitPt) return;
      page.drawText(line, {
        x: boxLeftPt + paddingPt,
        y: baselineY,
        size: effectiveSize,
        font: lineFont,
      });
    });
  });
```

(The old `leading` variable and `lineIndex` math go away; `truncateToFit` is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/mailingLabelsPdf.test.ts`
Expected: all existing + new tests PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` — expect clean.

```bash
git add src/lib/mailingLabelsPdf.ts src/lib/mailingLabelsPdf.test.ts
git commit -m "Support emphasized lines and RSVP-code composition in label PDFs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Label-type selector on the labels page

**Files:**
- Modify: `src/app/admin/(authenticated)/invitations/labels/page.tsx`
- Modify: `src/app/admin/(authenticated)/invitations/page.tsx:271-272` (link copy)

**Interfaces:**
- Consumes from Task 1: `composeCodeLabelLines`, widened `renderLabelsPdf`, `LabelLine`.
- Produces: no downstream consumers.

- [ ] **Step 1: Add label-type state and mode-aware helpers**

In `labels/page.tsx`:

1. Add `code: string;` to `InvitationForLabels` (the `/api/invitations` payload already includes it).
2. Import `composeCodeLabelLines` alongside `composeLabelLines`.
3. Add state + a mode-aware inclusion check, and prune the selection when the mode changes:

```ts
type LabelType = 'address' | 'code';
```

```ts
  const [labelType, setLabelType] = useState<LabelType>('address');
```

```ts
  // Code labels only need the household's code, which every invitation has;
  // address labels need something printable in composeLabelLines.
  const canInclude = (inv: InvitationForLabels) =>
    labelType === 'code' ? Boolean(inv.householdName.trim()) : hasAddress(inv);

  const switchLabelType = (next: LabelType) => {
    setLabelType(next);
    // Drop selections that aren't valid under the new mode (e.g. address-less
    // households selected in code mode, then switching to address mode).
    setSelectedIds((prev) => {
      const valid = new Set(
        invitations
          .filter((i) => (next === 'code' ? Boolean(i.householdName.trim()) : hasAddress(i)))
          .map((i) => i.id),
      );
      return new Set([...prev].filter((id) => valid.has(id)));
    });
  };
```

4. Update the quick-select handlers to respect the mode (`selectAllWithAddress` becomes `selectAll`):

```ts
  const selectAll = () => {
    setSelectedIds(new Set(invitations.filter(canInclude).map((i) => i.id)));
  };
  const selectAttending = () => {
    setSelectedIds(new Set(
      invitations.filter((i) => canInclude(i) && i.response?.attending === 'yes').map((i) => i.id),
    ));
  };
  const selectPending = () => {
    setSelectedIds(new Set(
      invitations.filter((i) => canInclude(i) && !i.response).map((i) => i.id),
    ));
  };
```

- [ ] **Step 2: Render the label-type selector and mode-aware copy**

1. At the top of the "Label sheet" card content, before the Format select:

```tsx
          <div>
            <label className="block text-sm font-medium mb-1">Label type</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="label-type"
                  checked={labelType === 'address'}
                  onChange={() => switchLabelType('address')}
                />
                Mailing address
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="label-type"
                  checked={labelType === 'code'}
                  onChange={() => switchLabelType('code')}
                />
                RSVP code
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {labelType === 'code'
                ? 'Each label shows the household name with its RSVP code in bold — stick one onto each invite card.'
                : 'Each label shows the household’s mailing address for envelopes.'}
            </p>
          </div>
```

2. Page header: change the `<h1>` to `Print Labels` and the description to:

```tsx
          <p className="text-sm text-gray-500">
            Generate a PDF of Avery-format labels — mailing addresses for envelopes, or RSVP codes
            to stick onto invite cards. Pick a format and which invitations to include, then print
            the PDF onto a real label sheet.
          </p>
```

3. In the invitation rows, make the gate and preview mode-aware (replace the `canInclude`/`lines` block inside the map):

```tsx
              const includable = canInclude(inv);
              const preview = labelType === 'code'
                ? `RSVP code: ${inv.code}`
                : composeLabelLines(inv as LabelSource).slice(1).join(' · ');
```

with the row body using `includable` where it used `canInclude`, showing `preview` where it showed `previewAddress`, and the empty-state text becoming `{labelType === 'code' ? 'no household name' : 'no address on file'}`.

4. Quick-select button labels: `Select all with address` → `{labelType === 'code' ? 'Select all' : 'Select all with address'}` calling `selectAll`.

- [ ] **Step 3: Mode-aware generation**

In `handleGenerate`, build lines and the filename per mode:

```ts
      const { renderLabelsPdf } = await import('@/lib/mailingLabelsPdf');
      const selected = invitations.filter((i) => selectedIds.has(i.id));
      const labels = selected.map((inv) => ({
        lines: labelType === 'code'
          ? composeCodeLabelLines(inv)
          : composeLabelLines(inv as LabelSource),
      }));
      const bytes = await renderLabelsPdf({ format, startPosition, labels });
```

and:

```ts
      a.download = `${labelType === 'code' ? 'rsvp-code-labels' : 'mailing-labels'}-${formatCode}-${today}.pdf`;
```

- [ ] **Step 4: Update the invitations-page link copy**

In `src/app/admin/(authenticated)/invitations/page.tsx:272`, change the button text
`Print mailing labels` → `Print labels`.

- [ ] **Step 5: Typecheck, full tests, commit**

Run: `npx tsc --noEmit` — expect clean.
Run: `npx vitest run` — expect all green.

```bash
git add "src/app/admin/(authenticated)/invitations/labels/page.tsx" "src/app/admin/(authenticated)/invitations/page.tsx"
git commit -m "Add RSVP-code label type to the labels page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Drive the page in a browser**

Start the dev server (`npm run dev`; port 3000 may be taken — use the port it prints). Seed an
admin session + a few invitations if the dev DB lacks them (see `.smoke-seed.ts` pattern from
session history: insert an `AdminSession` row whose `tokenHash` is sha256 of a known token, set
the `admin_session` cookie to that token in the browser).

On `/admin/invitations/labels`:
1. Default mode is Mailing address — behavior identical to before (spot-check a generated PDF).
2. Switch to RSVP code — address-less invitations become selectable, previews show codes.
3. Select all → Generate → confirm `rsvp-code-labels-5160-<date>.pdf` downloads; open it and
   confirm each label shows the household name with the code below it in larger bold text, and
   the grid aligns with the 5160 layout (compare against an address-label PDF).

- [ ] **Step 2: Clean up**

Remove any seeded rows and stop the dev server. Working tree should contain only the two feature commits.
