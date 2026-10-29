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

describe('resolveSeatedGuests with table numbers', () => {
  it('orders unnumbered tables first, then by number, and carries the number', () => {
    const seated = resolveSeatedGuests(
      [
        { name: 'Friends', number: 12, assignments: [{ guestName: 'Dee Lee', invitationId: 'inv2' }] },
        { name: 'Family', number: 3, assignments: [{ guestName: 'Bob Smith', invitationId: 'inv1' }] },
        { name: 'Head Table', number: null, assignments: [{ guestName: 'Ann Smith', invitationId: 'inv1' }] },
      ],
      [smiths, lees],
    );
    expect(seated.map((g) => [g.guestName, g.table, g.tableNumber])).toEqual([
      ['Ann Smith', 'Head Table', null],
      ['Bob Smith', 'Family', 3],
      ['Dee Lee', 'Friends', 12],
      ['Cal Jones', 'Unassigned', null],
    ]);
    expect(buildSeatingExportRows([{ name: 'Family', number: 3, assignments: [{ guestName: 'Dee Lee', invitationId: 'inv2' }] }], [lees])[0].table).toBe('3');
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

  it('uses per-guest allergies and child seats, and keeps an unsplit household note', () => {
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
      { guestName: 'Finn Park', table: 'Table 3', meal: '', dietary: 'Household: old household note', childSeat: 'High chair' },
      { guestName: 'Eve Park', table: 'Unassigned', meal: '', dietary: 'Peanuts; Household: old household note', childSeat: '' },
      { guestName: 'Gus Park', table: 'Unassigned', meal: 'Kids', dietary: 'Dairy; Household: old household note', childSeat: 'Booster seat' },
    ]);
  });

  it('gives an old household note to a household of one', () => {
    const rows = resolveSeatedGuests([{ name: 'T1', assignments: [{ guestName: 'Dee Lee', invitationId: 'inv2' }] }], [
      { ...lees, response: { ...lees.response!, dietaryNotes: 'Gluten free' } },
    ]);
    expect(rows[0]).toMatchObject({ guestName: 'Dee Lee', dietary: 'Gluten free', householdDietary: '' });
  });
});

describe('resolveSeatedGuests with seats linked to guests', () => {
  // Bob Smith was seated as "Bob", then renamed on the Invitations page. The
  // Guest row (g2) keeps its id, so the linked seat still finds him.
  const renamed: SeatingExportInvitation = {
    ...smiths,
    guests: [{ id: 'g1', name: 'Ann Smith' }, { id: 'g2', name: 'Robert Smith', childSeat: 'booster' }],
    response: { ...smiths.response!, guestDietary: JSON.stringify({ g2: 'Peanuts' }), dietaryNotes: null },
  };

  it('keeps a renamed guest at their table with their current name, meal, allergies and child seat', () => {
    const rows = resolveSeatedGuests(
      [{ name: 'T1', assignments: [{ guestName: 'Bob', invitationId: 'inv1', guestId: 'g2', guest: { name: 'Robert Smith' } }] }],
      [renamed],
    );
    expect(rows[0]).toMatchObject({ guestName: 'Robert Smith', table: 'T1', meal: 'Fish', dietary: 'Peanuts', childSeat: 'booster', unlinked: false });
    // …and isn't listed again as unseated.
    expect(rows.filter((r) => r.guestName === 'Robert Smith')).toHaveLength(1);
    expect(rows.map((r) => r.table)).toEqual(['T1', 'Unassigned', 'Unassigned']);
  });

  it('flags a seat that lost its guest and lists the guest as unseated, without borrowing their meal', () => {
    const rows = resolveSeatedGuests([{ name: 'T1', assignments: [{ guestName: 'Bob', invitationId: 'inv1' }] }], [renamed]);
    expect(rows[0]).toMatchObject({ guestName: 'Bob', table: 'T1', meal: '', dietary: '', unlinked: true });
    expect(rows.find((r) => r.guestName === 'Robert Smith')).toMatchObject({ table: 'Unassigned', meal: 'Fish' });
  });

  it('keeps plus-one seats matched by name and not flagged', () => {
    const rows = resolveSeatedGuests([{ name: 'T1', assignments: [{ guestName: 'Cal Jones', invitationId: 'inv1' }] }], [smiths]);
    expect(rows[0]).toMatchObject({ guestName: 'Cal Jones', meal: 'Vegetarian', unlinked: false });
  });

  it('keeps a linked guest who has since declined in their seat, with no meal', () => {
    const declined = { ...lees, response: { ...lees.response!, attending: 'no' } };
    const rows = resolveSeatedGuests(
      [{ name: 'T1', assignments: [{ guestName: 'Dee Lee', invitationId: 'inv2', guestId: 'g3', guest: { name: 'Dee Lee' } }] }],
      [declined],
    );
    expect(rows).toEqual([expect.objectContaining({ guestName: 'Dee Lee', table: 'T1', meal: '', unlinked: false })]);
  });

  it('tells apart two guests with the same name in different households', () => {
    const otherAnn: SeatingExportInvitation = {
      id: 'inv9',
      guests: [{ id: 'g9', name: 'Ann Smith' }],
      response: { attending: 'yes', attendingGuests: JSON.stringify(['g9']), guestMeals: JSON.stringify({ g9: 'Beef' }), plusOnes: null, dietaryNotes: null },
    };
    const rows = resolveSeatedGuests(
      [{ name: 'T1', assignments: [{ guestName: 'Ann Smith', invitationId: 'inv9', guestId: 'g9', guest: { name: 'Ann Smith' } }] }],
      [smiths, otherAnn],
    );
    expect(rows.filter((r) => r.guestName === 'Ann Smith').map((r) => [r.table, r.meal])).toEqual([['T1', 'Beef'], ['Unassigned', 'Chicken']]);
  });
});
