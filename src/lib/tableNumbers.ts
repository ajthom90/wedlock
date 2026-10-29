// Table numbers: an optional printed number beside each table's name. Pure —
// no Prisma — so the parsing, labels and ordering can be unit-tested.
//
// Before tables had a number field, couples put it in the name as a sort
// prefix ("05. Smith Family", "00. Head Table"). splitTablePrefix() turns
// that into a number and a clean name; it runs once on upgrade
// (tableNumbersDb.ts). An all-zero prefix ("00.") was only there to sort
// first, so it gives no number: the Head Table keeps showing by name.

export interface NumberedTable {
  name: string;
  number?: number | null;
}

const PREFIX = /^(\d+)\.\s+(\S.*)$/;

/** "05. Smith Family" → { number: 5, name: "Smith Family" }; null when the name has no "NN. " prefix. */
export function splitTablePrefix(raw: string): { number: number | null; name: string } | null {
  const m = PREFIX.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return { number: n > 0 ? n : null, name: m[2].trim() };
}

/** Read a table number from a form or request: a whole number of 0 or more, or null. */
export function parseTableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

/**
 * How a table is named on paper (name tents): "Table 5" when it has a
 * number, otherwise its name with any old sort prefix dropped ("01. Head
 * Table" → "Head Table") and a bare number turned into "Table 5".
 */
export function tableLabel(t: NumberedTable): string {
  if (t.number != null) return `Table ${t.number}`;
  const name = t.name.trim();
  const stripped = name.replace(/^\d+\s*[.):\-]\s*/, '').trim();
  const shown = stripped || name;
  return /^\d+$/.test(shown) ? `Table ${shown}` : shown;
}

/** Admin and public listings: "Table 5 · Smith Family", or just the name when there's no number. */
export function tableHeading(t: NumberedTable): string {
  if (t.number == null) return t.name;
  const label = `Table ${t.number}`;
  const name = t.name.trim();
  // Don't repeat a name that already is the number ("5", "Table 5").
  return !name || name === String(t.number) || name.toLowerCase() === label.toLowerCase() ? label : `${label} · ${name}`;
}

/**
 * Tables without a number first (Head Table), by name, so names still
 * carrying an old "00." prefix keep their order; then numbered tables by
 * number.
 */
export function compareTables(a: NumberedTable, b: NumberedTable): number {
  const an = a.number ?? null;
  const bn = b.number ?? null;
  if (an == null && bn != null) return -1;
  if (an != null && bn == null) return 1;
  if (an != null && bn != null && an !== bn) return an - bn;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}
