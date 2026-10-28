import { describe, it, expect } from 'vitest';
import { buildSeatingExportRows, compareTableNames, type SeatingExportInvitation } from './seatingExport';

const smiths: SeatingExportInvitation = {
  id: 'inv1',
  guests: [{ id: 'g1', name: 'Ann Smith' }, { id: 'g2', name: 'Bob Smith' }],
  response: {
    attending: 'yes',
    attendingGuests: JSON.stringify(['g1', 'g2']),
    guestMeals: JSON.stringify({ g1: 'Chicken', g2: 'Fish' }),
    plusOnes: JSON.stringify([{ name: 'Cal Jones', meal: 'Vegetarian' }]),
    dietaryNotes: 'Bob: no shellfish',
  },
};

const lees: SeatingExportInvitation = {
  id: 'inv2',
  guests: [{ id: 'g3', name: 'Dee Lee' }],
  response: { attending: 'yes', attendingGuests: JSON.stringify(['g3']), guestMeals: JSON.stringify({ g3: 'Beef' }), plusOnes: null, dietaryNotes: null },
};

describe('compareTableNames', () => {
  it('puts the head table first, then numbers naturally', () => {
    const names = ['Table 10', 'Table 2', 'Head Table', 'Table 1'];
    expect([...names].sort(compareTableNames)).toEqual(['Head Table', 'Table 1', 'Table 2', 'Table 10']);
  });
});

describe('buildSeatingExportRows', () => {
  it('orders by table and resolves meals for guests and plus-ones', () => {
    const rows = buildSeatingExportRows(
      [
        { name: 'Table 2', assignments: [{ guestName: 'Dee Lee', invitationId: 'inv2' }] },
        { name: 'Head Table', assignments: [{ guestName: 'Bob Smith', invitationId: 'inv1' }, { guestName: 'Cal Jones', invitationId: 'inv1' }] },
      ],
      [smiths, lees],
    );
    expect(rows).toEqual([
      { guestName: 'Bob Smith', table: 'Head Table', meal: 'Fish', dietary: 'Bob: no shellfish' },
      { guestName: 'Cal Jones', table: 'Head Table', meal: 'Vegetarian', dietary: 'Bob: no shellfish' },
      { guestName: 'Dee Lee', table: 'Table 2', meal: 'Beef', dietary: '' },
      { guestName: 'Ann Smith', table: 'Unassigned', meal: 'Chicken', dietary: 'Bob: no shellfish' },
    ]);
  });

  it('skips declined invitations from the unassigned list', () => {
    const declined = { ...lees, response: { ...lees.response!, attending: 'no' } };
    expect(buildSeatingExportRows([], [declined])).toEqual([]);
  });
});
