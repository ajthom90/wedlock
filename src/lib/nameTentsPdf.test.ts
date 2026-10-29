import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { composeTentContent, renderNameTentsPdf, tableDisplayName, wrapText } from './nameTentsPdf';
import { TENT_CARD_FORMATS } from './tentCardFormats';
import type { SeatedGuest } from './seatingExport';

const format3328 = TENT_CARD_FORMATS.find((f) => f.code === '3328')!;

const guest = (over: Partial<SeatedGuest> = {}): SeatedGuest => ({
  guestName: 'Ann Smith', table: '01. Head Table', meal: 'Chicken', dietary: 'Peanuts',
  householdDietary: '', childSeat: null, invitationId: 'inv1', ...over,
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

  it('copes with a very long name', async () => {
    const long = composeTentContent(guest({ guestName: 'Maximiliana Alexandrina Featherstonehaugh-Montgomery-Smythe' }), allOff);
    const bytes = await renderNameTentsPdf({ format: format3328, startPosition: 1, tents: [long], bothSides: true, outline: false });
    expect(bytes.length).toBeGreaterThan(0);
  });
});
