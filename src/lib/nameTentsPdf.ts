import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { TentCardFormat } from './tentCardFormats';
import type { SeatedGuest } from './seatingExport';
import { childSeatLabel } from './guestNeeds';
import { computeLabelPositions, embedThemeFonts, type LabelFontBytes, type ResolvedFonts } from './mailingLabelsPdf';
import { findMarkColor, hexToRgb01, mealCodeFor, type MealCode } from './mealColors';
import { findMealIcon, findMarkIcon, iconViewBox } from './mealIcons';
import { tableLabel } from './tableNumbers';

// Printable table name tents: one folded card per seated guest with their
// name, their table, and optionally a small line of needs (child seat,
// allergies, meal) for the servers. Composition is pure; the renderer only
// depends on pdf-lib, so the admin page builds the PDF in the browser.
//
// Servers can also get corner marks they read at a glance, without reading
// small print: a ½" mark for the meal bottom right — its icon in its color
// (a blue rooster), or a circle in its color when it has no icon — "A" bottom left
// when the guest has an allergy or dietary restriction, and "H" (high chair)
// or "B" (booster) top right — or an icon the couple picked for each, like a
// Leaning Tower for a high chair or a magic wand for allergies.

export interface TentContent {
  name: string;
  table: string;     // '' to leave off
  details: string[]; // small print under the table, joined with " · "
  // Corner marks. Undefined means that mark is turned off for the whole
  // print run, so no space is kept for it; '' / false means this guest just
  // has nothing to show there.
  mealColor?: string;            // '#RRGGBB' or ''
  mealIcon?: string;             // a MEAL_ICONS name or ''; set whenever mealColor is
  allergyMark?: boolean;
  allergyIcon?: string;          // a MARK_ICONS name drawn in place of the A
  allergyColor?: string;         // '#RRGGBB' for the A or its icon; black when missing
  childSeatMark?: 'H' | 'B' | '';
  childSeatIcon?: string;        // a MARK_ICONS name drawn in place of the letter
  childSeatColor?: string;       // '#RRGGBB' for the letter or its icon; black when missing
}

export interface TentOptions {
  showTable: boolean;
  showChildSeat: boolean;
  showAllergies: boolean;
  showMeal: boolean;
  showMealColor?: boolean;
  showAllergyMark?: boolean;
  showChildSeatMark?: boolean;
  // Icons (MARK_ICONS names) to print instead of the H / B / A letters; ''
  // or missing keeps the letter. Colors (MARK_COLORS names) apply to the
  // letter or icon; '' or missing is black.
  highChairIcon?: string;
  boosterIcon?: string;
  allergyIcon?: string;
  highChairColor?: string;
  boosterColor?: string;
  allergyColor?: string;
}

/**
 * Table names are often prefixed purely to sort them ("01. Head Table",
 * "2) Garden"). Drop that prefix for print, and turn a bare number into
 * "Table 5" so a card never just says "5". A table with a number prints as
 * "Table 5" (see tableLabel).
 */
export function tableDisplayName(raw: string): string {
  return tableLabel({ name: raw });
}

export function composeTentContent(
  guest: SeatedGuest,
  opts: TentOptions,
  mealCodes: Map<string, MealCode> = new Map(),
): TentContent {
  const details: string[] = [];
  if (opts.showChildSeat && guest.childSeat) details.push(childSeatLabel(guest.childSeat));
  // Only this person's own allergies — an unsplit household note could be
  // anyone's, so it never lands on one person's card.
  const ownDietary = guest.dietary.trim();
  if (opts.showAllergies && ownDietary) details.push(`Allergies: ${ownDietary}`);
  if (opts.showMeal && guest.meal.trim()) details.push(guest.meal.trim());
  const content: TentContent = {
    name: guest.guestName.trim(),
    table: opts.showTable ? tableLabel({ name: guest.table, number: guest.tableNumber }) : '',
    details,
  };
  if (opts.showMealColor) {
    const code = mealCodeFor(guest.meal, mealCodes);
    content.mealColor = code?.color?.hex ?? '';
    content.mealIcon = code?.icon?.name ?? '';
  }
  if (opts.showAllergyMark) {
    content.allergyMark = Boolean(ownDietary);
    const icon = content.allergyMark ? findMarkIcon(opts.allergyIcon) : null;
    if (icon) content.allergyIcon = icon.name;
    const color = content.allergyMark ? findMarkColor(opts.allergyColor) : null;
    if (color) content.allergyColor = color.hex;
  }
  if (opts.showChildSeatMark) {
    content.childSeatMark = guest.childSeat === 'high_chair' ? 'H' : guest.childSeat === 'booster' ? 'B' : '';
    const isH = content.childSeatMark === 'H';
    const isB = content.childSeatMark === 'B';
    const icon = findMarkIcon(isH ? opts.highChairIcon : isB ? opts.boosterIcon : '');
    if (icon) content.childSeatIcon = icon.name;
    const color = findMarkColor(isH ? opts.highChairColor : isB ? opts.boosterColor : '');
    if (color) content.childSeatColor = color.hex;
  }
  return content;
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
// Corner marks: the meal circle is ½" across; letters are bold and large
// enough to read from a server's standing height.
const CIRCLE_DIAMETER = 36;
const MARK_SIZE = 20;
const MARK_CAP = 0.72; // Helvetica-Bold cap height as a share of its size
const MARK_GAP = 4;    // between a mark band and the text
// A child-seat icon in the top band: smaller than the meal mark so the name
// keeps room, but still about ⅖" — readable from standing height.
const ICON_MARK_SIZE = 28;

// When no theme font loads, the fallback Helvetica can only encode
// Windows-1252 and throws on anything else, which would fail the whole PDF.
// Drop accents it can't show and replace any other character with "?" so
// one unusual name degrades instead.
function encodable(font: PDFFont, text: string): string {
  try {
    font.encodeText(text);
    return text;
  } catch {
    const ok = (ch: string) => {
      try { font.encodeText(ch); return true; } catch { return false; }
    };
    return Array.from(text).map((ch) => {
      if (ok(ch)) return ch;
      const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return base && ok(base) ? base : '?';
    }).join('');
  }
}

export type DrawOp =
  | { kind: 'text'; text: string; font: PDFFont; size: number; x: number; y: number; color?: RGB }
  | { kind: 'circle'; x: number; y: number; radius: number; color: RGB }
  // An icon's SVG paths, drawn size points square centred on (x, y).
  | { kind: 'icon'; x: number; y: number; size: number; paths: string[]; viewBox: number; color: RGB };

/**
 * Which mark bands a print run keeps clear, decided once for every card so
 * names line up across a table. topIcon: some card has a child-seat icon,
 * so the top band is icon-sized rather than letter-sized.
 */
export interface MarkBands { top: boolean; bottom: boolean; topIcon?: boolean }

export function markBandsFor(tents: TentContent[]): MarkBands {
  return {
    top: tents.some((t) => t.childSeatMark !== undefined),
    topIcon: tents.some((t) => t.childSeatIcon),
    bottom: tents.some((t) => t.mealColor !== undefined || t.mealIcon !== undefined || t.allergyMark !== undefined),
  };
}

type Line = { text: string; font: PDFFont; size: number; gapBefore: number };

// The name (one line, or two when long), then the table, then optional small
// print, at the largest name size up to nameCap.
function stackLines(content: TentContent, fonts: ResolvedFonts, maxW: number, nameCap: number, withDetails: boolean): Line[] {
  const lines: Line[] = [];
  const nameW = (s: string, size: number) => fonts.heading.widthOfTextAtSize(s, size);
  let nameSize = Math.min(NAME_MAX, nameCap);
  while (nameSize > NAME_ONE_LINE_MIN && nameW(content.name, nameSize) > maxW) nameSize -= 0.5;
  if (nameW(content.name, nameSize) <= maxW) {
    lines.push({ text: content.name, font: fonts.heading, size: nameSize, gapBefore: 0 });
  } else {
    nameSize = Math.min(NAME_TWO_LINE_MAX, nameCap);
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

  if (withDetails && content.details.length) {
    const wrapped = wrapText(content.details.join(' · '), maxW, 2, (s) => fonts.body.widthOfTextAtSize(s, DETAIL_SIZE));
    wrapped.forEach((text, i) => lines.push({ text, font: fonts.body, size: DETAIL_SIZE, gapBefore: i ? 2 : 6 }));
  }
  return lines;
}

const stackHeight = (lines: Line[]) => lines.reduce((sum, l) => sum + l.gapBefore + l.size, 0);

// Each line occupies its size (cap height + descender, roughly) plus the gap
// above it; centre the stack vertically between bottomY and topY.
function placeLines(lines: Line[], width: number, bottomY: number, topY: number): DrawOp[] {
  const maxH = topY - bottomY;
  const blockH = Math.min(maxH, stackHeight(lines));
  let cursorTop = bottomY + (maxH + blockH) / 2;
  const ops: DrawOp[] = [];
  for (const l of lines) {
    cursorTop -= l.gapBefore;
    const baseline = cursorTop - l.size * 0.8;
    cursorTop -= l.size;
    if (baseline < bottomY - l.size * 0.2) break;
    const w = l.font.widthOfTextAtSize(l.text, l.size);
    ops.push({ kind: 'text', text: l.text, font: l.font, size: l.size, x: (width - w) / 2, y: baseline });
  }
  return ops;
}

/**
 * Lays out one panel in its own upright coordinates: (0,0) is the panel's
 * bottom-left, (width,height) its top-right. Text is centred. With mark
 * bands, the name and table sit between them, the corner marks go in the
 * bands, and any small print moves into the bottom band between the marks.
 */
export function layoutTentPanel(
  raw: TentContent,
  fonts: ResolvedFonts,
  markFont: PDFFont,
  bands: MarkBands,
  width: number, height: number, padX: number, padY: number,
): DrawOp[] {
  const content: TentContent = {
    ...raw,
    name: encodable(fonts.heading, raw.name),
    table: encodable(fonts.body, raw.table),
    details: raw.details.map((d) => encodable(fonts.body, d)),
  };
  const maxW = width - padX * 2;
  const markCapH = MARK_SIZE * MARK_CAP;
  const bottomY = padY + (bands.bottom ? CIRCLE_DIAMETER + MARK_GAP : 0);
  const topY = height - padY - (bands.top ? (bands.topIcon ? ICON_MARK_SIZE : markCapH) + MARK_GAP : 0);
  const detailsInBand = bands.bottom;

  // Shrink the name until the whole stack fits between the bands.
  let nameCap = NAME_MAX;
  let lines = stackLines(content, fonts, maxW, nameCap, !detailsInBand);
  while (stackHeight(lines) > topY - bottomY && nameCap > NAME_MIN) {
    nameCap -= 0.5;
    lines = stackLines(content, fonts, maxW, nameCap, !detailsInBand);
  }
  const ops = placeLines(lines, width, bottomY, topY);

  const circleY = padY + CIRCLE_DIAMETER / 2;
  const mealX = width - padX - CIRCLE_DIAMETER / 2;
  const mealRgb = content.mealColor ? rgb(...hexToRgb01(content.mealColor)) : null;
  const icon = findMealIcon(content.mealIcon);
  if (icon) {
    ops.push({ kind: 'icon', x: mealX, y: circleY, size: CIRCLE_DIAMETER, paths: icon.paths, viewBox: iconViewBox(icon), color: mealRgb ?? INK });
  } else if (mealRgb) {
    ops.push({ kind: 'circle', x: mealX, y: circleY, radius: CIRCLE_DIAMETER / 2, color: mealRgb });
  }
  const markRgb = (hex?: string) => (hex ? rgb(...hexToRgb01(hex)) : INK);
  const allergyIcon = findMarkIcon(content.allergyIcon);
  const allergyRgb = markRgb(content.allergyColor);
  if (content.allergyMark && allergyIcon) {
    const s = CIRCLE_DIAMETER;
    ops.push({ kind: 'icon', x: padX + s / 2, y: circleY, size: s, paths: allergyIcon.paths, viewBox: iconViewBox(allergyIcon), color: allergyRgb });
  } else if (content.allergyMark) {
    ops.push({ kind: 'text', text: 'A', font: markFont, size: MARK_SIZE, x: padX, y: circleY - markCapH / 2, color: allergyRgb });
  }
  const seatIcon = findMarkIcon(content.childSeatIcon);
  const seatRgb = markRgb(content.childSeatColor);
  if (content.childSeatMark && seatIcon) {
    const s = ICON_MARK_SIZE;
    ops.push({ kind: 'icon', x: width - padX - s / 2, y: height - padY - s / 2, size: s, paths: seatIcon.paths, viewBox: iconViewBox(seatIcon), color: seatRgb });
  } else if (content.childSeatMark) {
    const w = markFont.widthOfTextAtSize(content.childSeatMark, MARK_SIZE);
    ops.push({ kind: 'text', text: content.childSeatMark, font: markFont, size: MARK_SIZE, x: width - padX - w, y: height - padY - markCapH, color: seatRgb });
  }

  if (detailsInBand && content.details.length) {
    // Between the "A" and the circle, centred on the circle's middle.
    const bandW = maxW - 2 * (CIRCLE_DIAMETER + MARK_GAP);
    const wrapped = wrapText(content.details.join(' · '), bandW, 2, (s) => fonts.body.widthOfTextAtSize(s, DETAIL_SIZE));
    const detailLines = wrapped.map((text, i) => ({ text, font: fonts.body, size: DETAIL_SIZE, gapBefore: i ? 2 : 0 }));
    const h = stackHeight(detailLines);
    ops.push(...placeLines(detailLines, width, circleY - h / 2, circleY + h / 2));
  }
  return ops;
}

function drawPanel(page: PDFPage, ops: DrawOp[], left: number, bottom: number, width: number, height: number, flipped: boolean) {
  for (const op of ops) {
    // The flipped half is rotated 180° about the panel centre so it reads
    // upright once the card is folded and that half faces the other way.
    const x = flipped ? left + width - op.x : left + op.x;
    const y = flipped ? bottom + height - op.y : bottom + op.y;
    if (op.kind === 'circle') {
      page.drawCircle({ x, y, size: op.radius, color: op.color, borderColor: INK, borderWidth: 0.5 });
    } else if (op.kind === 'icon') {
      // drawSvgPath puts the icon's top-left corner at its origin and rotates
      // about it, so the flipped copy starts from the opposite corner.
      const half = op.size / 2;
      const scale = op.size / op.viewBox;
      for (const path of op.paths) {
        page.drawSvgPath(path, {
          x: flipped ? x + half : x - half,
          y: flipped ? y - half : y + half,
          scale,
          rotate: flipped ? degrees(180) : undefined,
          color: op.color,
        });
      }
    } else {
      page.drawText(op.text, { x, y, size: op.size, font: op.font, color: op.color ?? INK, rotate: flipped ? degrees(180) : undefined });
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
  // Marks always use plain bold Helvetica: a script theme font makes an
  // "A" or "H" hard to read at a glance.
  const markFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const bands = markBandsFor(tents);
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

    const ops = layoutTentPanel(tent, fonts, markFont, bands, cardW, panelH, padX, padY);
    drawPanel(page, ops, left, bottom, cardW, panelH, false);
    if (bothSides) drawPanel(page, ops, left, foldY, cardW, panelH, true);
  });

  return doc.save();
}
