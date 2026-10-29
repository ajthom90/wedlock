import { describe, it, expect } from 'vitest';
import { compareTables, parseTableNumber, splitTablePrefix, tableHeading, tableLabel } from './tableNumbers';

describe('splitTablePrefix', () => {
  it('moves an "NN. " sort prefix into the number', () => {
    expect(splitTablePrefix("34. Kim Mo's HS Friends")).toEqual({ number: 34, name: "Kim Mo's HS Friends" });
    expect(splitTablePrefix('05. Smith Family')).toEqual({ number: 5, name: 'Smith Family' });
    expect(splitTablePrefix('  7.   Cousins  ')).toEqual({ number: 7, name: 'Cousins' });
    expect(splitTablePrefix('12. 12')).toEqual({ number: 12, name: '12' });
  });

  it('gives an all-zero prefix no number, so the Head Table keeps its name', () => {
    expect(splitTablePrefix('00. Head Table')).toEqual({ number: null, name: 'Head Table' });
    expect(splitTablePrefix('0. Sweetheart')).toEqual({ number: null, name: 'Sweetheart' });
  });

  it('leaves names without the prefix alone', () => {
    for (const name of ['Head Table', '5', 'Table 5', '1.5 Cake Table', '12.', '12. ', '2) Garden', '10 - Family', 'A. Smith']) {
      expect(splitTablePrefix(name)).toBeNull();
    }
  });
});

describe('parseTableNumber', () => {
  it('takes whole numbers of 0 or more and nothing else', () => {
    expect(parseTableNumber(5)).toBe(5);
    expect(parseTableNumber(' 12 ')).toBe(12);
    expect(parseTableNumber('0')).toBe(0);
    for (const v of ['', '  ', null, undefined, '-1', '2.5', 'five', Number.NaN]) expect(parseTableNumber(v)).toBeNull();
  });
});

describe('tableLabel', () => {
  it('prints a numbered table as "Table N"', () => {
    expect(tableLabel({ name: "Kim Mo's HS Friends", number: 34 })).toBe('Table 34');
  });

  it('falls back to the name, prefix dropped, when there is no number', () => {
    expect(tableLabel({ name: 'Head Table', number: null })).toBe('Head Table');
    expect(tableLabel({ name: '01. Head Table' })).toBe('Head Table');
    expect(tableLabel({ name: '5' })).toBe('Table 5');
  });
});

describe('tableHeading', () => {
  it('shows the number and the name', () => {
    expect(tableHeading({ name: "Kim Mo's HS Friends", number: 34 })).toBe("Table 34 · Kim Mo's HS Friends");
    expect(tableHeading({ name: 'Head Table', number: null })).toBe('Head Table');
  });

  it("doesn't repeat a name that is just the number", () => {
    expect(tableHeading({ name: '5', number: 5 })).toBe('Table 5');
    expect(tableHeading({ name: 'table 5', number: 5 })).toBe('Table 5');
  });
});

describe('compareTables', () => {
  it('puts tables without a number first, by name, then numbered tables by number', () => {
    const tables = [
      { name: 'Cousins', number: 10 },
      { name: "Kim Mo's HS Friends", number: 34 },
      { name: 'Head Table', number: null },
      { name: 'Family', number: 2 },
      { name: 'Band' },
    ];
    expect([...tables].sort(compareTables).map((t) => t.name)).toEqual(['Band', 'Head Table', 'Family', 'Cousins', "Kim Mo's HS Friends"]);
  });

  it('still orders names that keep an old prefix', () => {
    const tables = [{ name: '10. Cousins' }, { name: '00. Head Table' }, { name: '02. Family' }];
    expect([...tables].sort(compareTables).map((t) => t.name)).toEqual(['00. Head Table', '02. Family', '10. Cousins']);
  });
});
