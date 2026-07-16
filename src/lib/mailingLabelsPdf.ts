import type { AveryFormat } from './averyFormats';
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

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

// A label line is plain text (body font, base size) or a styled line: a
// sequence of runs — so part of a line can be bold, e.g. only the code number
// in "RSVP code: 483920" — with an optional size multiplier and font role.
// Roles map to the site theme: 'heading' for the household name, 'body' for
// everything else, mirroring the website's own hierarchy.
export type LabelRun = { text: string; bold?: boolean };
export type LabelLine =
  | string
  | { runs: LabelRun[]; scale?: number; font?: 'heading' | 'body' };

function lineRuns(line: LabelLine): LabelRun[] {
  return typeof line === 'string' ? [{ text: line }] : line.runs;
}

function lineScale(line: LabelLine): number {
  return typeof line === 'string' ? 1 : (line.scale ?? 1);
}

function lineFontRole(line: LabelLine): 'heading' | 'body' {
  return typeof line === 'string' ? 'body' : (line.font ?? 'body');
}

// Theme font bytes for embedding (from /api/fonts/pdf). All optional — any
// slot that's missing or fails to embed falls back gracefully so label
// generation never depends on fonts resolving.
export interface LabelFontBytes {
  heading?: ArrayBuffer | Uint8Array;
  body?: ArrayBuffer | Uint8Array;
  bodyBold?: ArrayBuffer | Uint8Array;
}

interface ResolvedFonts {
  heading: PDFFont;
  body: PDFFont;
  bodyBold: PDFFont;
}

function runFont(role: 'heading' | 'body', bold: boolean, fonts: ResolvedFonts): PDFFont {
  if (bold) return fonts.bodyBold;
  return role === 'heading' ? fonts.heading : fonts.body;
}

// Produces the lines for an RSVP-code label: household name (heading font)
// with the code underneath — only the number itself bold — and a keep-this
// note. The name is deliberate: codes are per-household and an unlabeled
// sticker mixup sends guests into someone else's RSVP.
export function composeCodeLabelLines(src: { householdName: string; code: string }): LabelLine[] {
  const lines: LabelLine[] = [];
  const hh = src.householdName.trim();
  if (hh) lines.push({ runs: [{ text: hh }], font: 'heading' });
  lines.push({ runs: [{ text: 'RSVP code: ' }, { text: src.code.trim(), bold: true }], scale: 1.4 });
  lines.push({ runs: [{ text: 'Please do not lose this code' }], scale: 0.85 });
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

// Inner padding inside each label box (in inches). Keeps text off the edges
// where label perforations or cutter tolerances might swallow it.
const LABEL_PADDING_IN = 0.1;

// Base font size per format. Larger formats get bigger text by default.
function baseFontSize(format: AveryFormat): number {
  if (format.code === '5163') return 12;  // 2"×4" — more room
  return 10;
}

const MIN_FONT_SIZE = 7;

function lineWidthAt(line: LabelLine, baseSize: number, fonts: ResolvedFonts): number {
  const effective = baseSize * lineScale(line);
  const role = lineFontRole(line);
  return lineRuns(line).reduce(
    (sum, run) => sum + runFont(role, !!run.bold, fonts).widthOfTextAtSize(run.text, effective),
    0,
  );
}

// Returns the largest BASE font size ≤ desiredSize where every line fits the
// box width at its own effective size (base × line scale) and fonts, AND the
// stacked lines fit the box height (each line consumes 1.2 × its effective
// size). Floors at MIN_FONT_SIZE; if width still doesn't fit there, the draw
// loop truncates the last run with an ellipsis.
function fitFontSize(args: {
  lines: LabelLine[];
  fonts: ResolvedFonts;
  maxWidthPt: number;
  maxHeightPt: number;
  desiredSize: number;
}): number {
  const { lines, fonts, maxWidthPt, maxHeightPt, desiredSize } = args;
  const totalScale = lines.reduce((sum, l) => sum + lineScale(l), 0);
  let size = desiredSize;
  while (size > MIN_FONT_SIZE) {
    const widest = Math.max(...lines.map((l) => lineWidthAt(l, size, fonts)));
    const stackedHeight = totalScale * size * 1.2;
    if (widest <= maxWidthPt && stackedHeight <= maxHeightPt) return size;
    size -= 0.5;
  }
  return MIN_FONT_SIZE;
}

// If the line still doesn't fit at the minimum font size, chop characters off
// the END of the LAST run (with an ellipsis) until the whole line fits.
// Earlier runs are preserved — for code labels the last run is the code
// number / note text, and the "RSVP code: " prefix must survive intact.
function truncateRunsToFit(
  runs: LabelRun[],
  role: 'heading' | 'body',
  size: number,
  fonts: ResolvedFonts,
  maxWidthPt: number,
): LabelRun[] {
  const width = (rs: LabelRun[]) =>
    rs.reduce((sum, r) => sum + runFont(role, !!r.bold, fonts).widthOfTextAtSize(r.text, size), 0);
  if (width(runs) <= maxWidthPt) return runs;
  const head = runs.slice(0, -1);
  const last = runs[runs.length - 1];
  let text = last.text;
  while (text.length > 1 && width([...head, { ...last, text: text + '…' }]) > maxWidthPt) {
    text = text.slice(0, -1);
  }
  return [...head, { ...last, text: text + '…' }];
}

// Main entry point for the admin page. All args are plain data; nothing
// depends on browser DOM or server APIs.
export async function renderLabelsPdf(args: {
  format: AveryFormat;
  startPosition: number;
  labels: Array<{ lines: LabelLine[] }>;
  // Optional theme font bytes. Missing/broken slots degrade: body → Helvetica,
  // heading → body, bodyBold → the body font itself when a theme body loaded
  // (a custom family usually has no separate bold file; the 1.4× code size
  // still carries the emphasis) or Helvetica-Bold otherwise.
  fonts?: LabelFontBytes;
}): Promise<Uint8Array> {
  const { format, startPosition, labels, fonts: fontBytes } = args;
  const doc = await PDFDocument.create();
  if (fontBytes && (fontBytes.heading || fontBytes.body || fontBytes.bodyBold)) {
    doc.registerFontkit(fontkit);
  }
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  let body = helvetica;
  let usedThemeBody = false;
  if (fontBytes?.body) {
    try { body = await doc.embedFont(fontBytes.body); usedThemeBody = true; } catch { body = helvetica; }
  }
  let heading = body;
  if (fontBytes?.heading) {
    try { heading = await doc.embedFont(fontBytes.heading); } catch { heading = body; }
  }
  let bodyBold: PDFFont | null = null;
  if (fontBytes?.bodyBold) {
    try { bodyBold = await doc.embedFont(fontBytes.bodyBold); } catch { bodyBold = null; }
  }
  if (!bodyBold) bodyBold = usedThemeBody ? body : await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts: ResolvedFonts = { heading, body, bodyBold };

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
      fonts,
      maxWidthPt: maxTextWidthPt,
      maxHeightPt: labelHeightPt - paddingPt * 2,
      desiredSize,
    });

    // Label box top-left in PDF coordinates (origin = bottom-left of page).
    const boxLeftPt = pos.xInches * 72;
    const boxTopPt = pageHeightPt - pos.yInchesFromTop * 72;
    const boxBottomLimitPt = boxTopPt - labelHeightPt + paddingPt;

    // Per-line cursor: each line's leading (1.2×) derives from its own
    // effective size, so the larger code line gets proportionally more room.
    let cursorTopPt = boxTopPt - paddingPt;
    label.lines.forEach((rawLine) => {
      const scale = lineScale(rawLine);
      const role = lineFontRole(rawLine);
      const effectiveSize = fontSize * scale;
      const runs = truncateRunsToFit(lineRuns(rawLine), role, effectiveSize, fonts, maxTextWidthPt);
      const baselineY = cursorTopPt - effectiveSize;
      cursorTopPt = baselineY - effectiveSize * 0.2;
      // Don't draw lines that would fall below the label box.
      if (baselineY < boxBottomLimitPt) return;
      let x = boxLeftPt + paddingPt;
      for (const run of runs) {
        const rf = runFont(role, !!run.bold, fonts);
        page.drawText(run.text, { x, y: baselineY, size: effectiveSize, font: rf });
        x += rf.widthOfTextAtSize(run.text, effectiveSize);
      }
    });
  });

  return doc.save();
}
