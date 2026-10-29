import { describe, it, expect } from 'vitest';
import { buildSeatingExportRows, compareTableNames, resolveSeatedGuests, type SeatingExportInvitation } from './seatingExport';

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
  it('sorts alphabetically so numbered prefixes set the order', () => {
    const names = ['34. Kim Mo\'s HS Friends', '01. Kim & Joe\'s Table', '10. Cousins', '00. Head Table'];
    expect([...names].sort(compareTableNames)).toEqual(['00. Head Table', '01. Kim & Joe\'s Table', '10. Cousins', '34. Kim Mo\'s HS Friends']);
  });
});

describe('buildSeatingExportRows', () => {
  it('orders by table and resolves meals for guests and plus-ones', () => {
    const rows = buildSeatingExportRows(
      [
        { name: '02. Friends', assignments: [{ guestName: 'Dee Lee', invitationId: 'inv2' }] },
        { name: '00. Head Table', assignments: [{ guestName: 'Bob Smith', invitationId: 'inv1' }, { guestName: 'Cal Jones', invitationId: 'inv1' }] },
      ],
      [smiths, lees],
    );
    expect(rows).toEqual([
      { guestName: 'Bob Smith', table: '00. Head Table', meal: 'Fish', dietary: 'Household: Bob: no shellfish', childSeat: '' },
      { guestName: 'Cal Jones', table: '00. Head Table', meal: 'Vegetarian', dietary: 'Household: Bob: no shellfish', childSeat: '' },
      { guestName: 'Dee Lee', table: '02. Friends', meal: 'Beef', dietary: '', childSeat: '' },
      { guestName: 'Ann Smith', table: 'Unassigned', meal: 'Chicken', dietary: 'Household: Bob: no shellfish', childSeat: '' },
    ]);
  });

  it('skips declined invitations from the unassigned list', () => {
    const declined = { ...lees, response: { ...lees.response!, attending: 'no' } };
    expect(buildSeatingExportRows([], [declined])).toEqual([]);
  });

  it('uses per-guest allergies and child seats, for guests and plus-ones', () => {
    const kids: SeatingExportInvitation = {
      id: 'inv3',
      guests: [{ id: 'g4', name: 'Eve Park', childSeat: null }, { id: 'g5', name: 'Finn Park', childSeat: 'high_chair' }],
      response: {
        attending: 'yes',
        attendingGuests: JSON.stringify(['g4', 'g5']),
        guestMeals: null,
        guestDietary: JSON.stringify({ g4: 'Peanuts' }),
        plusOnes: JSON.stringify([{ name: 'Gus Park', meal: 'Kids', dietary: 'Dairy', childSeat: 'booster' }]),
        dietaryNotes: 'old household note',
      },
    };
    expect(buildSeatingExportRows([{ name: 'Table 3', assignments: [{ guestName: 'Finn Park', invitationId: 'inv3' }] }], [kids])).toEqual([
      { guestName: 'Finn Park', table: 'Table 3', meal: '', dietary: '', childSeat: 'High chair' },
      { guestName: 'Eve Park', table: 'Unassigned', meal: '', dietary: 'Peanuts', childSeat: '' },
      { guestName: 'Gus Park', table: 'Unassigned', meal: 'Kids', dietary: 'Dairy', childSeat: 'Booster seat' },
    ]);
  });

  it('gives an old household note to a household of one', () => {
    const rows = resolveSeatedGuests([{ name: 'T1', assignments: [{ guestName: 'Dee Lee', invitationId: 'inv2' }] }], [
      { ...lees, response: { ...lees.response!, dietaryNotes: 'Gluten free' } },
    ]);
    expect(rows[0]).toMatchObject({ guestName: 'Dee Lee', dietary: 'Gluten free', householdDietary: '' });
  });
});
