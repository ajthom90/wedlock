import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { TentCardFormat } from './tentCardFormats';
import type { SeatedGuest } from './seatingExport';
import { childSeatLabel } from './guestNeeds';
import { computeLabelPositions, embedThemeFonts, type LabelFontBytes, type ResolvedFonts } from './mailingLabelsPdf';

// Printable table name tents: one folded card per seated guest with their
// name, their table, and optionally a small line of needs (child seat,
// allergies, meal) for the servers. Composition is pure; the renderer only
// depends on pdf-lib, so the admin page builds the PDF in the browser.

export interface TentContent {
  name: string;
  table: string;     // '' to leave off
  details: string[]; // small print under the table, joined with " · "
}

export interface TentOptions {
  showTable: boolean;
  showChildSeat: boolean;
  showAllergies: boolean;
  showMeal: boolean;
}

/**
 * Table names are often prefixed purely to sort them ("01. Head Table",
 * "2) Garden"). Drop that prefix for print, and turn a bare number into
 * "Table 5" so a card never just says "5".
 */
export function tableDisplayName(raw: string): string {
  const name = raw.trim();
  const stripped = name.replace(/^\d+\s*[.):\-]\s*/, '').trim();
  const shown = stripped || name;
  return /^\d+$/.test(shown) ? `Table ${shown}` : shown;
}

export function composeTentContent(guest: SeatedGuest, opts: TentOptions): TentContent {
  const details: string[] = [];
  if (opts.showChildSeat && guest.childSeat) details.push(childSeatLabel(guest.childSeat));
  // Only this person's own allergies — an unsplit household note could be
  // anyone's, so it never lands on one person's card.
  if (opts.showAllergies && guest.dietary.trim()) details.push(`Allergies: ${guest.dietary.trim()}`);
  if (opts.showMeal && guest.meal.trim()) details.push(guest.meal.trim());
  return {
    name: guest.guestName.trim(),
    table: opts.showTable ? tableDisplayName(guest.table) : '',
    details,
  };
}

/**
 * Greedy word wrap into at most maxLines lines; the last line gets an
 * ellipsis when text is left over. `measure` returns a string's width.
 */
export function wrapText(text: string, maxWidth: number, maxLines: number, measure: (s: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = current ? `${current} ${words[i]}` : words[i];
    if (measure(next) <= maxWidth || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = words[i];
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && current) {
    lines.push(current);
    i = words.length;
  }
  // A single word wider than the box still has to be cut.
  const out = lines.map((l) => ellipsize(l, maxWidth, measure));
  const last = out.length - 1;
  if (last >= 0 && i < words.length) out[last] = ellipsize(lines[last], maxWidth, measure, true);
  return out;
}

function ellipsize(text: string, maxWidth: number, measure: (s: string) => number, force = false): string {
  if (!force && measure(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && measure(`${t}…`) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// Text sizes in points. The name shrinks to fit one line, then two.
const NAME_MAX = 28;
const NAME_ONE_LINE_MIN = 15;
const NAME_TWO_LINE_MAX = 22;
const NAME_MIN = 10;
const TABLE_SIZE = 12;
const DETAIL_SIZE = 8;
const INK = rgb(0.12, 0.12, 0.12);

interface DrawOp { text: string; font: PDFFont; size: number; x: number; y: number }

// Lays out one panel in its own upright coordinates: (0,0) is the panel's
// bottom-left, (width,height) its top-right. Everything is centred.
function layoutPanel(content: TentContent, fonts: ResolvedFonts, width: number, height: number, padX: number, padY: number): DrawOp[] {
  const maxW = width - padX * 2;
  const maxH = height - padY * 2;
  type Line = { text: string; font: PDFFont; size: number; gapBefore: number };
  const lines: Line[] = [];

  const nameW = (s: string, size: number) => fonts.heading.widthOfTextAtSize(s, size);
  let nameSize = NAME_MAX;
  while (nameSize > NAME_ONE_LINE_MIN && nameW(content.name, nameSize) > maxW) nameSize -= 0.5;
  if (nameW(content.name, nameSize) <= maxW) {
    lines.push({ text: content.name, font: fonts.heading, size: nameSize, gapBefore: 0 });
  } else {
    nameSize = NAME_TWO_LINE_MAX;
    let wrapped = wrapText(content.name, maxW, 2, (s) => nameW(s, nameSize));
    while (nameSize > NAME_MIN && wrapped.some((l) => nameW(l, nameSize) > maxW || l.endsWith('…'))) {
      nameSize -= 0.5;
      wrapped = wrapText(content.name, maxW, 2, (s) => nameW(s, nameSize));
    }
    wrapped.forEach((text, i) => lines.push({ text, font: fonts.heading, size: nameSize, gapBefore: i ? nameSize * 0.15 : 0 }));
  }

  if (content.table) {
    const text = ellipsize(content.table, maxW, (s) => fonts.body.widthOfTextAtSize(s, TABLE_SIZE));
    lines.push({ text, font: fonts.body, size: TABLE_SIZE, gapBefore: 7 });
  }

  if (content.details.length) {
    const wrapped = wrapText(content.details.join(' · '), maxW, 2, (s) => fonts.body.widthOfTextAtSize(s, DETAIL_SIZE));
    wrapped.forEach((text, i) => lines.push({ text, font: fonts.body, size: DETAIL_SIZE, gapBefore: i ? 2 : 6 }));
  }

  // Each line occupies its size (cap height + descender, roughly) plus the
  // gap above it; centre the whole stack vertically.
  const blockH = Math.min(maxH, lines.reduce((sum, l) => sum + l.gapBefore + l.size, 0));
  let cursorTop = padY + (maxH + blockH) / 2;
  const ops: DrawOp[] = [];
  for (const l of lines) {
    cursorTop -= l.gapBefore;
    const baseline = cursorTop - l.size * 0.8;
    cursorTop -= l.size;
    if (baseline < padY - l.size * 0.2) break;
    const w = l.font.widthOfTextAtSize(l.text, l.size);
    ops.push({ text: l.text, font: l.font, size: l.size, x: (width - w) / 2, y: baseline });
  }
  return ops;
}

function drawPanel(page: PDFPage, ops: DrawOp[], left: number, bottom: number, width: number, height: number, flipped: boolean) {
  for (const op of ops) {
    if (!flipped) {
      page.drawText(op.text, { x: left + op.x, y: bottom + op.y, size: op.size, font: op.font, color: INK });
    } else {
      // Rotate 180° about the panel centre so the text reads upright once
      // the card is folded and this half faces the other way.
      page.drawText(op.text, {
        x: left + width - op.x, y: bottom + height - op.y,
        size: op.size, font: op.font, color: INK, rotate: degrees(180),
      });
    }
  }
}

export async function renderNameTentsPdf(args: {
  format: TentCardFormat;
  startPosition: number;
  tents: TentContent[];
  fonts?: LabelFontBytes;
  bothSides: boolean;   // print the upside-down back panel too
  outline: boolean;     // draw card edges + fold line, for test prints on plain paper
  offsetXInches?: number; // + moves everything right
  offsetYInches?: number; // + moves everything down
}): Promise<Uint8Array> {
  const { format, startPosition, tents, bothSides, outline } = args;
  const doc = await PDFDocument.create();
  const fonts = await embedThemeFonts(doc, args.fonts);
  const positions = computeLabelPositions({ format, startPosition, labelCount: tents.length });

  const pageW = format.pageWidth * 72;
  const pageH = format.pageHeight * 72;
  const cardW = format.labelWidth * 72;
  const cardH = format.labelHeight * 72;
  const panelH = cardH / 2;
  const padX = format.panelPaddingX * 72;
  const padY = format.panelPaddingY * 72;
  const dx = (args.offsetXInches ?? 0) * 72;
  const dy = (args.offsetYInches ?? 0) * 72;

  const pages = new Map<number, PDFPage>();
  const getPage = (i: number) => {
    let page = pages.get(i);
    if (!page) {
      page = doc.addPage([pageW, pageH]);
      pages.set(i, page);
    }
    return page;
  };
  getPage(0);

  tents.forEach((tent, i) => {
    const pos = positions[i];
    const page = getPage(pos.pageIndex);
    const left = pos.xInches * 72 + dx;
    const top = pageH - pos.yInchesFromTop * 72 - dy;
    const foldY = top - panelH;
    const bottom = top - cardH;

    if (outline) {
      const grey = rgb(0.7, 0.7, 0.7);
      page.drawRectangle({ x: left, y: bottom, width: cardW, height: cardH, borderColor: grey, borderWidth: 0.5 });
      page.drawLine({ start: { x: left, y: foldY }, end: { x: left + cardW, y: foldY }, thickness: 0.5, color: grey, dashArray: [3, 3] });
    }

    const ops = layoutPanel(tent, fonts, cardW, panelH, padX, padY);
    drawPanel(page, ops, left, bottom, cardW, panelH, false);
    if (bothSides) drawPanel(page, ops, left, foldY, cardW, panelH, true);
  });

  return doc.save();
}
