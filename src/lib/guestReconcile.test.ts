import { describe, it, expect } from 'vitest';
import { reconcileGuests } from './guestReconcile';

const g = (id: string, name: string) => ({ id, name });

describe('reconcileGuests', () => {
  it('updates in place when names are unchanged', () => {
    const ops = reconcileGuests([g('a', 'Alice'), g('b', 'Bob')], [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ]);
    expect(ops.create).toEqual([]);
    expect(ops.deleteIds).toEqual([]);
    expect(ops.update).toEqual([
      { id: 'a', name: 'Alice', isPrimary: true, order: 0 },
      { id: 'b', name: 'Bob', isPrimary: false, order: 1 },
    ]);
  });

  it('preserves the row id on a typo fix when the edit row carries the guest id', () => {
    const ops = reconcileGuests([g('a', 'Alice'), g('b', 'Sara')], [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Sarah' },
    ]);
    expect(ops.create).toEqual([]);
    expect(ops.deleteIds).toEqual([]);
    expect(ops.update).toContainEqual({ id: 'b', name: 'Sarah', isPrimary: false, order: 1 });
  });

  it('treats a rename WITHOUT an id as remove + add (no positional guessing)', () => {
    const ops = reconcileGuests([g('a', 'Alice'), g('b', 'Sara')], [
      { name: 'Alice' },
      { name: 'Sarah' },
    ]);
    expect(ops.update).toEqual([{ id: 'a', name: 'Alice', isPrimary: true, order: 0 }]);
    expect(ops.create).toEqual([{ name: 'Sarah', isPrimary: false, order: 1 }]);
    expect(ops.deleteIds).toEqual(['b']);
  });

  it('does NOT transfer a removed guest\'s row to a new person added in the same edit', () => {
    // Bob removed, Carol added — Carol must be a NEW row, not Bob's row renamed.
    const ops = reconcileGuests([g('a', 'Alice'), g('b', 'Bob')], [
      { id: 'a', name: 'Alice' },
      { id: null, name: 'Carol' },
    ]);
    expect(ops.update).toEqual([{ id: 'a', name: 'Alice', isPrimary: true, order: 0 }]);
    expect(ops.create).toEqual([{ name: 'Carol', isPrimary: false, order: 1 }]);
    expect(ops.deleteIds).toEqual(['b']);
  });

  it('preserves ids on reorder and stamps the new order and isPrimary', () => {
    const ops = reconcileGuests([g('a', 'Alice'), g('b', 'Bob')], [
      { id: 'b', name: 'Bob' },
      { id: 'a', name: 'Alice' },
    ]);
    expect(ops.create).toEqual([]);
    expect(ops.deleteIds).toEqual([]);
    expect(ops.update).toContainEqual({ id: 'b', name: 'Bob', isPrimary: true, order: 0 });
    expect(ops.update).toContainEqual({ id: 'a', name: 'Alice', isPrimary: false, order: 1 });
  });

  it('name identity wins over row identity when rows are swapped by retyping', () => {
    // Admin retyped the names into opposite rows: keep each NAME's data with
    // its original row so meals stay with the right person.
    const ops = reconcileGuests([g('a', 'Alice'), g('b', 'Bob')], [
      { id: 'a', name: 'Bob' },
      { id: 'b', name: 'Alice' },
    ]);
    expect(ops.update).toContainEqual({ id: 'b', name: 'Bob', isPrimary: true, order: 0 });
    expect(ops.update).toContainEqual({ id: 'a', name: 'Alice', isPrimary: false, order: 1 });
    expect(ops.create).toEqual([]);
    expect(ops.deleteIds).toEqual([]);
  });

  it('creates rows for added names and deletes removed ones', () => {
    const ops = reconcileGuests([g('a', 'Alice'), g('b', 'Bob')], [
      { id: 'a', name: 'Alice' },
      { name: 'Dave' },
    ]);
    expect(ops.update).toEqual([{ id: 'a', name: 'Alice', isPrimary: true, order: 0 }]);
    expect(ops.create).toEqual([{ name: 'Dave', isPrimary: false, order: 1 }]);
    expect(ops.deleteIds).toEqual(['b']);
  });

  it('ignores stale ids that no longer exist', () => {
    const ops = reconcileGuests([g('a', 'Alice')], [
      { id: 'a', name: 'Alice' },
      { id: 'ghost', name: 'Bob' },
    ]);
    expect(ops.update).toEqual([{ id: 'a', name: 'Alice', isPrimary: true, order: 0 }]);
    expect(ops.create).toEqual([{ name: 'Bob', isPrimary: false, order: 1 }]);
    expect(ops.deleteIds).toEqual([]);
  });

  it('deletes everything when the incoming list is empty', () => {
    const ops = reconcileGuests([g('a', 'Alice'), g('b', 'Bob')], []);
    expect(ops.update).toEqual([]);
    expect(ops.create).toEqual([]);
    expect(ops.deleteIds).toEqual(['a', 'b']);
  });

  it('creates everything when there are no existing rows', () => {
    const ops = reconcileGuests([], [{ name: 'Alice' }, { name: 'Bob' }]);
    expect(ops.update).toEqual([]);
    expect(ops.create).toEqual([
      { name: 'Alice', isPrimary: true, order: 0 },
      { name: 'Bob', isPrimary: false, order: 1 },
    ]);
    expect(ops.deleteIds).toEqual([]);
  });

  it('matches duplicate names to distinct rows', () => {
    const ops = reconcileGuests(
      [g('a', 'John Smith'), g('b', 'John Smith')],
      [{ name: 'John Smith' }, { name: 'John Smith' }],
    );
    expect(ops.update).toHaveLength(2);
    expect(new Set(ops.update.map((u) => u.id))).toEqual(new Set(['a', 'b']));
    expect(ops.create).toEqual([]);
    expect(ops.deleteIds).toEqual([]);
  });

  it('never assigns the same existing row twice even when ids repeat', () => {
    const ops = reconcileGuests([g('a', 'Alice')], [
      { id: 'a', name: 'Alicia' },
      { id: 'a', name: 'Alexandra' },
    ]);
    expect(ops.update).toEqual([{ id: 'a', name: 'Alicia', isPrimary: true, order: 0 }]);
    expect(ops.create).toEqual([{ name: 'Alexandra', isPrimary: false, order: 1 }]);
    expect(ops.deleteIds).toEqual([]);
  });
});
