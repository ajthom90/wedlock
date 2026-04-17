# Printable mailing labels — design

## Goal

Let the admin print Avery-format mailing label sheets from the invitations' structured mailing-address data. One click on `/admin/invitations`, pick a format, pick recipients, download a PDF, feed the sheet into a printer. Closes the loop on the structured-address work shipped in 2.9.

## Non-goals (V1)

- Custom layouts or label editors. Avery codes only, from a curated list.
- Return-address printing (as a corner-of-label header or a dedicated sheet). Can be added later if the admin wants self-adhesive return-address labels too.
- Server-side PDF generation, storage, or emailing. Purely client-side; the PDF is downloaded directly.
- Content customization per-label beyond what the address data gives us. No "include nickname", no "add wedding date", no QR codes. Just name + address, which is what every Avery-printing couple actually uses.
- Printing guest names (attendees or plus-ones) on labels. Labels go to households, addressed to `householdName`.
- Any schema changes. Uses existing `Invitation` fields verbatim.

## Supported Avery formats

Curated list of 4, covering >95% of real use. All data-driven — adding a format later is adding one line to `AVERY_FORMATS`.

| Code | Count/sheet | Dimensions | Paper | Typical use |
|---|---|---|---|---|
| 5160 | 30 | 1" × 2⅝" | US Letter | Standard mailing labels (most common) |
| 5161 | 20 | 1" × 4" | US Letter | Wider mailing labels |
| 5163 | 10 | 2" × 4" | US Letter | Shipping / large labels |
| L7160 | 21 | 38.1mm × 63.5mm (~1.5" × 2.5") | A4 | European A4 equivalent of 5160 |

More formats can be added post-V1; the format library is pure data with no code changes required for new codes.

## Components

### `src/lib/averyFormats.ts` — format library (pure data)

One exported type + one exported array. No logic.

```ts
export interface AveryFormat {
  code: '5160' | '5161' | '5163' | 'L7160';
  displayName: string;       // shown in the UI dropdown
  paper: 'letter' | 'a4';
  pageWidth: number;         // inches
  pageHeight: number;        // inches
  marginTop: number;         // inches, to top edge of first row
  marginLeft: number;        // inches, to left edge of first column
  labelWidth: number;        // inches
  labelHeight: number;       // inches
  horizontalGap: number;     // inches, between columns
  verticalGap: number;       // inches, between rows
  cols: number;
  rows: number;
  labelsPerSheet: number;    // denormalized cols × rows
}

export const AVERY_FORMATS: AveryFormat[] = [ /* 4 entries */ ];
```

A4-paper formats use inches-equivalent values throughout for uniformity (A4 = 8.27" × 11.69"). The renderer converts inches to PDF points at draw time.

Invariants the test suite checks:
- `cols * rows === labelsPerSheet` (catches data-entry typos)
- `marginLeft + cols*labelWidth + (cols-1)*horizontalGap <= pageWidth` (horizontal layout fits)
- `marginTop + rows*labelHeight + (rows-1)*verticalGap <= pageHeight` (vertical layout fits)

### `src/lib/mailingLabelsPdf.ts` — PDF renderer

Client-only. `pdf-lib` is imported here; the module is only loaded on the labels page, so the main admin bundle doesn't grow.

One public function:

```ts
export async function renderLabelsPdf(args: {
  format: AveryFormat;
  startPosition: number;                         // 1-indexed; 1 = top-left
  labels: Array<{ lines: string[] }>;            // each label = array of text lines
}): Promise<Uint8Array>;                         // PDF bytes, ready to download
```

Internal logic:

1. Create a blank PDF in `pdf-lib`. Page size = `format.pageWidth * 72`, `format.pageHeight * 72` (inches → points).
2. For each label in `labels`:
   - `gridIndex = (startPosition - 1) + i`
   - `pageIndex = floor(gridIndex / labelsPerSheet)`
   - `slotInPage = gridIndex % labelsPerSheet`
   - `col = slotInPage % format.cols`
   - `row = floor(slotInPage / format.cols)`
   - If we've moved to a new page, `doc.addPage([...])` with the same dimensions.
   - Compute the label's top-left in points:
     - `x = (marginLeft + col*(labelWidth + horizontalGap)) * 72`
     - `y = pageHeight*72 - (marginTop + row*(labelHeight + verticalGap)) * 72` (PDF origin is bottom-left, so flip Y)
   - Inner padding: 0.1" = 7.2pt.
   - For each line in the label, call `page.drawText(line, { x: x + padding, y: lineY, size: fontSize, font })`. Use Helvetica at 10pt (5160/5161/L7160) or 12pt (5163). `lineY` descends by `fontSize * 1.2` per line.
3. `return doc.save();`

**Shrink-to-fit.** Before drawing each label, measure each line with `font.widthOfTextAtSize(line, baseSize)`. If the widest exceeds `labelWidth - padding*2`, scale to the largest size that fits, floor of 7pt. Past that, truncate with "…" appended.

**Font.** `StandardFonts.Helvetica` — built into every PDF reader, no file load, no font embedding required.

### `src/app/admin/(authenticated)/invitations/labels/page.tsx` — admin UI

Client component. Loads all invitations on mount via `fetch('/api/invitations')` (already exists). State:

- `formatCode`: string, default `'5160'`
- `startPosition`: number, default 1
- `selectedIds`: `Set<string>` of invitation ids

**Layout:**
- Page header + brief explainer.
- Sticky controls strip:
  - Format dropdown (4 options).
  - Start-position number input (range 1..`labelsPerSheet` of the selected format; auto-clamps when format changes).
  - Bulk-selection buttons: "Select all with address" / "Select attending" / "Select pending" / "Clear selection".
  - Count badge: "N labels selected".
- Table of invitations, sorted by household name A-Z:
  - Checkbox · Household Name · composed address preview · RSVP status badge.
  - Invitations without any address (neither the 5 structured fields nor the legacy `address`) are shown but with the checkbox disabled and an italic "no address on file" note.
- Sticky "Generate PDF for N labels" button at bottom. Disabled when N = 0.

**Which address does a label use?** Prefer the 5 structured fields. If `mailingAddress1` is empty AND the invitation has a non-empty legacy `address`, fall back to using the legacy text as the single address line (pasted whole — doesn't try to parse it). No attempt at naive split; legacy data is rare and the admin can manually edit the invitation if it renders poorly.

**Generate-PDF flow:**

1. Build the `labels` array from `selectedIds`, resolving each to an invitation and composing its lines:
   - Line 1: `householdName`
   - Line 2: `mailingAddress1` (or legacy `address` fallback)
   - Line 3: `mailingAddress2` — **only included if non-empty**; else skipped so line 4 becomes line 3
   - Line 4 (or 3): `"${mailingCity}, ${mailingState} ${mailingPostalCode}"` — each component optional, join carefully so missing components don't produce artifacts like ", IL" or " 62704"
2. Dynamic-import `pdf-lib` and `renderLabelsPdf`. Call it.
3. Turn the returned `Uint8Array` into a Blob (`type: 'application/pdf'`).
4. Trigger a download via a temporary `<a>` element: filename `mailing-labels-{formatCode}-{YYYY-MM-DD}.pdf`.

### `src/app/admin/(authenticated)/invitations/page.tsx` — link-in

Add a new button "Print mailing labels" next to the existing "Export addresses" button, linking to `/admin/invitations/labels`. Same `Button variant="outline"` styling.

## Dependency

Add `pdf-lib` to `dependencies` in `package.json`. Zero native deps; pure JS; ~200KB gzipped. Dynamic-imported from the labels page so it doesn't add to the main admin bundle.

## Error semantics

- **No invitations with addresses** (fresh site, no imports yet): page still renders, "Select all" is a no-op, Generate button is disabled.
- **Start position > `labelsPerSheet`**: input has a `max` attribute; if the admin types past it, the input clamps. Generate disabled if invalid.
- **PDF renderer throws** (e.g., pdf-lib internal error, browser OOM on an enormous sheet): caught by the Generate handler; alert-based error toast ("Could not generate PDF: {message}. Try a smaller selection.").
- **Label content too long for the box**: shrink-to-fit to 7pt minimum, then truncate with "…". No error surfaced — the label renders, possibly with visible truncation, and the admin can fix the underlying record if they don't like it.

## Testing

### Unit tests (`vitest`)

`src/lib/averyFormats.test.ts`:
- For each format: `cols * rows === labelsPerSheet`.
- For each format: horizontal and vertical layouts fit within the page (no overflow).
- Every format has a non-empty `displayName`.

`src/lib/mailingLabelsPdf.test.ts`:
- Returns a Uint8Array whose first 4 bytes are `%PDF`.
- Places the first label at the correct `(x, y)` for each of the 4 formats (spy on `drawText`, assert the call's `x` and `y` args within 0.1pt tolerance of inches×72).
- `startPosition: 13` leaves positions 1–12 blank and places the first label at slot 13's coordinates.
- 40 labels in a 30-slot format produces 2 pages (`doc.getPageCount() === 2`).
- A label line exceeding `labelWidth - padding*2` at base font size is drawn at a smaller font.
- Empty `mailingAddress2` is not included in the drawn lines for a label (assert `drawText` call count per label matches expected).

### Route / UI

Not unit-tested, consistent with the project's pattern. Manual smoke test covers integration.

### Manual smoke test

1. From `/admin/invitations`, click "Print mailing labels" → lands on the new page.
2. Select format 5160, keep start position = 1, select a handful of invitations → click Generate → PDF downloads.
3. Open the PDF and either print on an Avery 5160 sheet to verify alignment, or overlay it on Avery's official PDF template in a viewer to eyeball that positions match.
4. Switch format to 5163 → same invitations re-render into the larger layout; verify content fits.
5. Switch to L7160 → verify A4 page size and layout.
6. Set start position to 13 for 5160 + select 5 invitations → verify positions 1–12 are blank and labels start at 13.
7. Select 40+ invitations on 5160 → verify 2-page PDF.
8. Include one invitation with only a legacy free-text `address` → verify it renders (single line fallback).
9. Bulk button "Select attending" → verify only households with `response.attending === 'yes'` are checked.
10. (Edge) Pick an invitation with a very long household name → verify the label renders with shrink-to-fit or a truncation ellipsis rather than overflowing the box.

### CI guardrails (per CLAUDE.md)

- `npx tsc --noEmit`
- `npx vitest run`

## Rollout

- New npm dep: `pdf-lib`. No native deps, client-only import.
- No schema changes. No env vars. No feature flag.
- **Release notes entry** (required before bump, per `feedback_release_notes_before_bump.md`):
  - `feature`: "Printable mailing labels — generate Avery-format PDF label sheets from the invitations' mailing addresses. Supports Avery 5160, 5161, 5163, and L7160 (A4). Start-position input so you can reuse partially-used sheets."
- Intended as **v2.10.0** (minor bump — new feature). The bump itself is out of scope for this plan.
