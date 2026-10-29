import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { composeTentContent, layoutTentPanel, markBandsFor, renderNameTentsPdf, tableDisplayName, wrapText, type DrawOp } from './nameTentsPdf';
import { TENT_CARD_FORMATS } from './tentCardFormats';
import { buildMealColorMap } from './mealColors';
import type { SeatedGuest } from './seatingExport';

const format3328 = TENT_CARD_FORMATS.find((f) => f.code === '3328')!;

const guest = (over: Partial<SeatedGuest> = {}): SeatedGuest => ({
  guestName: 'Ann Smith', table: '01. Head Table', tableNumber: null, meal: 'Chicken', dietary: 'Peanuts',
  householdDietary: '', childSeat: null, invitationId: 'inv1', unlinked: false, ...over,
});

const allOff = { showTable: false, showChildSeat: false, showAllergies: false, showMeal: false };

describe('TENT_CARD_FORMATS', () => {
  it.each(TENT_CARD_FORMATS.map((f) => [f.code, f] as const))('%s fits on the page', (_c, f) => {
    expect(f.cols * f.rows).toBe(f.labelsPerSheet);
    expect(f.marginLeft + f.cols * f.labelWidth + (f.cols - 1) * f.horizontalGap).toBeLessThanOrEqual(f.pageWidth + 0.01);
    expect(f.marginTop + f.rows * f.labelHeight + (f.rows - 1) * f.verticalGap).toBeLessThanOrEqual(f.pageHeight + 0.01);
  });

  it('3328 folds to 2" × 3½" panels', () => {
    expect(format3328.labelWidth).toBe(3.5);
    expect(format3328.labelHeight / 2).toBe(2);
  });

  it("3328 matches Avery's template: cards at ½\" and 4½\" across, 1¼\" and 5¾\" down", async () => {
    const { computeLabelPositions } = await import('./mailingLabelsPdf');
    const pos = computeLabelPositions({ format: format3328, startPosition: 1, labelCount: 4 });
    expect(pos.map((p) => [p.xInches, p.yInchesFromTop])).toEqual([[0.5, 1.25], [4.5, 1.25], [0.5, 5.75], [4.5, 5.75]]);
  });
});

describe('tableDisplayName', () => {
  it('drops a sort prefix', () => {
    expect(tableDisplayName('01. Head Table')).toBe('Head Table');
    expect(tableDisplayName('2) Garden')).toBe('Garden');
    expect(tableDisplayName('10 - Family')).toBe('Family');
  });

  it('turns a bare number into "Table N"', () => {
    expect(tableDisplayName('5')).toBe('Table 5');
    expect(tableDisplayName('03. 3')).toBe('Table 3');
  });

  it('leaves ordinary names alone', () => {
    expect(tableDisplayName('Table 12')).toBe('Table 12');
    expect(tableDisplayName('  Sweetheart  ')).toBe('Sweetheart');
  });
});

describe('composeTentContent', () => {
  it('prints only the name when everything is off', () => {
    expect(composeTentContent(guest(), allOff)).toEqual({ name: 'Ann Smith', table: '', details: [] });
  });

  it('adds table, child seat, own allergies and meal in that order', () => {
    expect(composeTentContent(guest({ childSeat: 'booster' }), {
      showTable: true, showChildSeat: true, showAllergies: true, showMeal: true,
    })).toEqual({ name: 'Ann Smith', table: 'Head Table', details: ['Booster seat', 'Allergies: Peanuts', 'Chicken'] });
  });

  it('never prints an unassigned household note on one person', () => {
    const c = composeTentContent(guest({ dietary: '', householdDietary: 'Bob: shellfish' }), { ...allOff, showAllergies: true });
    expect(c.details).toEqual([]);
  });

  const colors = buildMealColorMap([{ name: 'Chicken', color: 'Blue' }, { name: 'Beef', color: 'Red' }, { name: 'Vendor Meal' }]);
  const marksOn = { ...allOff, showMealColor: true, showAllergyMark: true, showChildSeatMark: true };

  it('adds the meal color, A and H/B marks when turned on', () => {
    expect(composeTentContent(guest({ childSeat: 'high_chair' }), marksOn, colors))
      .toMatchObject({ mealColor: '#1F5FD1', allergyMark: true, childSeatMark: 'H' });
    expect(composeTentContent(guest({ meal: 'beef', dietary: ' ', childSeat: 'booster' }), marksOn, colors))
      .toMatchObject({ mealColor: '#D62828', allergyMark: false, childSeatMark: 'B' });
  });

  it('leaves the circle off for a meal with no color, and marks off when turned off', () => {
    expect(composeTentContent(guest({ meal: 'Vendor Meal' }), marksOn, colors).mealColor).toBe('');
    expect(composeTentContent(guest({ meal: '' }), marksOn, colors).mealColor).toBe('');
    const off = composeTentContent(guest({ childSeat: 'booster' }), allOff, colors);
    expect(off).not.toHaveProperty('mealColor');
    expect(off).not.toHaveProperty('allergyMark');
    expect(off).not.toHaveProperty('childSeatMark');
  });

  it('only marks A for the guest’s own allergies', () => {
    expect(composeTentContent(guest({ dietary: '', householdDietary: 'Bob: shellfish' }), marksOn, colors).allergyMark).toBe(false);
  });
});

describe('markBandsFor', () => {
  it('keeps bands for every card once a mark is on for the run', () => {
    expect(markBandsFor([{ name: 'a', table: '', details: [] }])).toEqual({ top: false, bottom: false });
    expect(markBandsFor([{ name: 'a', table: '', details: [], mealColor: '' }])).toEqual({ top: false, bottom: true });
    expect(markBandsFor([{ name: 'a', table: '', details: [], childSeatMark: '' }])).toEqual({ top: true, bottom: false });
  });
});

describe('layoutTentPanel', () => {
  // A 3328 panel in points.
  const W = 3.5 * 72, H = 2 * 72, PX = 0.3 * 72, PY = 0.25 * 72;

  async function layout(content: Parameters<typeof layoutTentPanel>[0]) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fonts = { heading: font, body: font, bodyBold: bold };
    return layoutTentPanel(content, fonts, bold, markBandsFor([content]), W, H, PX, PY);
  }

  const texts = (ops: DrawOp[]) => ops.filter((o): o is Extract<DrawOp, { kind: 'text' }> => o.kind === 'text');

  it('puts the circle bottom right, A bottom left and H top right, clear of the name', async () => {
    const ops = await layout({
      name: 'Alexandra Mohrhauser', table: 'Head Table', details: ['Allergies: gluten'],
      mealColor: '#D62828', allergyMark: true, childSeatMark: 'H',
    });
    const circle = ops.find((o) => o.kind === 'circle')!;
    expect(circle.kind === 'circle' && circle.radius).toBe(18);
    expect(circle.x + 18).toBeCloseTo(W - PX);
    expect(circle.y - 18).toBeCloseTo(PY);

    const a = texts(ops).find((o) => o.text === 'A')!;
    expect(a.x).toBeCloseTo(PX);
    expect(a.y).toBeLessThan(PY + 36);
    const h = texts(ops).find((o) => o.text === 'H')!;
    expect(h.x + h.font.widthOfTextAtSize('H', h.size)).toBeCloseTo(W - PX);
    expect(h.y).toBeGreaterThan(H / 2);

    // Name and table sit between the bands; the small print sits between A and the circle.
    const name = texts(ops).find((o) => o.text.startsWith('Alexandra'))!;
    const table = texts(ops).find((o) => o.text === 'Head Table')!;
    for (const t of [name, table]) {
      expect(t.y - t.size * 0.2).toBeGreaterThanOrEqual(PY + 36);
      expect(t.y + t.size * 0.8).toBeLessThanOrEqual(h.y);
    }
    const detail = texts(ops).find((o) => o.text.startsWith('Allergies'))!;
    expect(detail.x).toBeGreaterThan(PX + 36);
    expect(detail.x + detail.font.widthOfTextAtSize(detail.text, detail.size)).toBeLessThan(W - PX - 36);
  });

  it('prints no circle or letters for a guest with nothing to mark', async () => {
    const ops = await layout({ name: 'Ann Smith', table: 'Table 1', details: [], mealColor: '', allergyMark: false, childSeatMark: '' });
    expect(ops.some((o) => o.kind === 'circle')).toBe(false);
    expect(texts(ops).map((o) => o.text)).toEqual(['Ann Smith', 'Table 1']);
  });

  it('keeps a long two-line name inside the bands', async () => {
    const ops = await layout({
      name: 'Maximiliana Alexandrina Featherstonehaugh-Montgomery', table: 'Head Table', details: [],
      mealColor: '#1F5FD1', allergyMark: false, childSeatMark: 'B',
    });
    const top = H - PY - 20 * 0.72;
    for (const t of texts(ops).filter((o) => o.text !== 'B')) {
      expect(t.y - t.size * 0.2).toBeGreaterThanOrEqual(PY + 36);
      expect(t.y + t.size * 0.8).toBeLessThanOrEqual(top + 0.01);
    }
    expect(texts(ops).some((o) => o.text === 'Head Table')).toBe(true);
  });
});

describe('wrapText', () => {
  const measure = (s: string) => s.length; // one unit per character

  it('keeps text that fits on one line', () => {
    expect(wrapText('High chair', 20, 2, measure)).toEqual(['High chair']);
  });

  it('wraps onto a second line', () => {
    expect(wrapText('Allergies: peanuts and tree nuts', 20, 2, measure)).toEqual(['Allergies: peanuts', 'and tree nuts']);
  });

  it('ellipsizes text left over after the last line', () => {
    const out = wrapText('one two three four five six seven', 9, 2, measure);
    expect(out).toHaveLength(2);
    expect(out[1].endsWith('…')).toBe(true);
    out.forEach((l) => expect(measure(l)).toBeLessThanOrEqual(9));
  });

  it('cuts a single word wider than the box', () => {
    const [line] = wrapText('Supercalifragilistic', 8, 1, measure);
    expect(line.endsWith('…')).toBe(true);
    expect(measure(line)).toBeLessThanOrEqual(8);
  });
});

describe('renderNameTentsPdf', () => {
  const tents = Array.from({ length: 5 }, (_, i) => composeTentContent(
    guest({ guestName: `Guest Number ${i + 1}`, childSeat: i === 0 ? 'high_chair' : null }),
    { showTable: true, showChildSeat: true, showAllergies: true, showMeal: false },
  ));

  it('puts four cards on a sheet', async () => {
    const bytes = await renderNameTentsPdf({ format: format3328, startPosition: 1, tents, bothSides: true, outline: false });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
    expect([w, h]).toEqual([612, 792]);
  });

  it('honours the start position and still renders an empty sheet', async () => {
    const shifted = await PDFDocument.load(await renderNameTentsPdf({
      format: format3328, startPosition: 4, tents: tents.slice(0, 2), bothSides: false, outline: true, offsetXInches: 0.1, offsetYInches: -0.1,
    }));
    expect(shifted.getPageCount()).toBe(2);
    const empty = await PDFDocument.load(await renderNameTentsPdf({ format: format3328, startPosition: 1, tents: [], bothSides: true, outline: false }));
    expect(empty.getPageCount()).toBe(1);
  });

  it('prints names the fallback font can’t encode instead of failing', async () => {
    const tents = ['Łukasz Żółć', '王小明', 'José'].map((n) => composeTentContent(guest({ guestName: n }), allOff));
    const bytes = await renderNameTentsPdf({ format: format3328, startPosition: 1, tents, bothSides: true, outline: false });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('renders meal circles and corner marks on both halves', async () => {
    const colors = buildMealColorMap([{ name: 'Chicken', color: 'Blue' }]);
    const marked = [guest(), guest({ childSeat: 'booster', meal: 'Beef' })].map((g) => composeTentContent(g, {
      ...allOff, showTable: true, showMealColor: true, showAllergyMark: true, showChildSeatMark: true,
    }, colors));
    const bytes = await renderNameTentsPdf({ format: format3328, startPosition: 1, tents: marked, bothSides: true, outline: false });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('copes with a very long name', async () => {
    const long = composeTentContent(guest({ guestName: 'Maximiliana Alexandrina Featherstonehaugh-Montgomery-Smythe' }), allOff);
    const bytes = await renderNameTentsPdf({ format: format3328, startPosition: 1, tents: [long], bothSides: true, outline: false });
    expect(bytes.length).toBeGreaterThan(0);
  });
});
