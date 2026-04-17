import type { AveryFormat } from './averyFormats';
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';

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
