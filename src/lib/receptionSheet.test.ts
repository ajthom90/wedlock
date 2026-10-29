import { describe, it, expect } from 'vitest';
import { buildReceptionSheet, sheetTableValue, sheetToText } from './receptionSheet';
import type { SeatingExportInvitation } from './seatingExport';

const inv = (
  id: string,
  people: { name: string; meal?: string; dietary?: string; seat?: string }[],
  householdNote: string | null = null,
): SeatingExportInvitation => ({
  id,
  guests: people.map((p, i) => ({ id: `${id}-${i}`, name: p.name, childSeat: p.seat ?? null })),
  response: {
    attending: 'yes',
    attendingGuests: JSON.stringify(people.map((_, i) => `${id}-${i}`)),
    guestMeals: JSON.stringify(Object.fromEntries(people.map((p, i) => [`${id}-${i}`, p.meal ?? '']))),
    guestDietary: JSON.stringify(Object.fromEntries(people.flatMap((p, i) => (p.dietary ? [[`${id}-${i}`, p.dietary]] : [])))),
    plusOnes: null,
    dietaryNotes: householdNote,
  },
});

const mealChoices = [
  { name: 'Beef', color: 'Red' },
  { name: 'Chicken', color: 'Blue' },
  { name: "Kid's Meal", color: 'Pink' },
  { name: 'Fish' },
];

describe('sheetTableValue', () => {
  it('gives numbered tables as numbers and keeps named tables as names', () => {
    expect(sheetTableValue('5')).toBe(5);
    expect(sheetTableValue('Table 12')).toBe(12);
    expect(sheetTableValue('07. 7')).toBe(7);
    expect(sheetTableValue('00. Head Table')).toBe('Head Table');
    expect(sheetTableValue('Head Table')).toBe('Head Table');
  });

  it("uses the table's own number over its name", () => {
    expect(sheetTableValue("Kim Mo's HS Friends", 34)).toBe(34);
    expect(sheetTableValue('Head Table', null)).toBe('Head Table');
    expect(sheetTableValue('Kids', 0)).toBe(0);
  });
});

describe('buildReceptionSheet with table numbers', () => {
  const invitations = [
    inv('a', [{ name: 'Ann Lee', meal: 'Beef' }]),
    inv('b', [{ name: 'Cy Park', meal: 'Chicken' }]),
    inv('c', [{ name: 'Flo Ng', meal: 'Beef' }]),
    inv('d', [{ name: 'Hal Ito', meal: 'Beef' }]),
  ];
  // As the upgrade leaves them: names without their "NN. " prefix, numbers set.
  const tables = [
    { name: "Kim Mo's HS Friends", number: 34, assignments: [{ guestName: 'Flo Ng', invitationId: 'c' }] },
    { name: 'Cousins', number: 2, assignments: [{ guestName: 'Cy Park', invitationId: 'b' }] },
    { name: 'Head Table', number: null, assignments: [{ guestName: 'Ann Lee', invitationId: 'a' }] },
    { name: 'Family', number: 10, assignments: [{ guestName: 'Hal Ito', invitationId: 'd' }] },
  ];
  const sheet = buildReceptionSheet({ tables, invitations, mealChoices, vendorMeals: [] });
  const guestRows = sheet.rows.slice(sheet.headerRow);

  it('shows the number in Table# and orders Head Table first, then by number', () => {
    expect(guestRows.map((r) => [r[0], r[1]])).toEqual([
      ['Ann Lee', 'Head Table'],
      ['Cy Park', 2],
      ['Hal Ito', 10],
      ['Flo Ng', 34],
    ]);
  });
});

describe('buildReceptionSheet', () => {
  const invitations = [
    inv('a', [{ name: 'Ann Lee', meal: 'Beef', dietary: 'Gluten Free' }, { name: 'Bo Lee', meal: 'Chicken' }]),
    inv('b', [{ name: 'Cy Park', meal: 'Beef' }, { name: 'Di Park', meal: "Kid's Meal", seat: 'high_chair' }, { name: 'Ed Park', meal: "Kid's Meal", seat: 'booster' }]),
    inv('c', [{ name: 'Flo Ng', meal: 'Chicken' }, { name: 'Gil Ng', meal: 'Beef' }], 'Shellfish'),
    inv('d', [{ name: 'Hal Ito' }]),
  ];
  const tables = [
    { name: '10', assignments: [{ guestName: 'Flo Ng', invitationId: 'c' }, { guestName: 'Gil Ng', invitationId: 'c' }] },
    { name: '2', assignments: [{ guestName: 'Cy Park', invitationId: 'b' }, { guestName: 'Di Park', invitationId: 'b' }, { guestName: 'Ed Park', invitationId: 'b' }] },
    { name: 'Head Table', assignments: [{ guestName: 'Bo Lee', invitationId: 'a' }, { guestName: 'Ann Lee', invitationId: 'a' }] },
  ];
  const sheet = buildReceptionSheet({ tables, invitations, mealChoices, vendorMeals: [{ name: 'Standard Vendor Meals', count: 3 }, { name: 'Vegetarian Vendor Meal', count: 1 }] });

  it('lays out the summary block, header and guest rows like the couple’s sheet', () => {
    expect(sheetToText(sheet.rows)).toBe([
      'Meal Choice\t\tColor Code',
      'Beef\t3\tRed',
      'Chicken\t2\tBlue',
      "Kid's Meal\t2\tPink",
      'Fish\t0',
      'No meal chosen\t1',
      'Standard Vendor Meals\t3\tAllergens / Restrictions (A)\t1',
      'Vegetarian Vendor Meal\t1\tBooster Chairs (B)\t1',
      'Total:\t12\tHeight Chairs (H)\t1',
      '',
      'Guest Name\tTable#\tMeal Choice\tDietary Restrictions\tH / B\tA\tColor Code',
      'Bo Lee\tHead Table\tChicken\t\t\t\tBlue',
      'Ann Lee\tHead Table\tBeef\tGluten Free\t\tA\tRed',
      'Cy Park\t2\tBeef\t\t\t\tRed',
      "Di Park\t2\tKid's Meal\t\tH\t\tPink",
      "Ed Park\t2\tKid's Meal\t\tB\t\tPink",
      'Flo Ng\t10\tChicken\tHousehold: Shellfish\t\t\tBlue',
      'Gil Ng\t10\tBeef\tHousehold: Shellfish\t\t\tRed',
      'Hal Ito\tUnassigned',
    ].join('\n'));
    expect(sheet.headerRow).toBe(11);
    expect(sheet.summary).toEqual({
      firstMealRow: 2, lastMealRow: 6, noMealRow: 6, firstVendorRow: 7, lastVendorRow: 8,
      totalRow: 9, allergensRow: 7, boostersRow: 8, highChairsRow: 9,
    });
  });

  it('writes table numbers and counts as numbers', () => {
    const header = sheet.headerRow - 1;
    expect(sheet.rows[1][1]).toBe(3);
    expect(sheet.rows[header + 3][1]).toBe(2);
    expect(sheet.rows[header + 6][1]).toBe(10);
  });

  it('leaves out the no-meal row when everyone has one, and ignores bad vendor counts', () => {
    const s = buildReceptionSheet({
      tables: [], invitations: [inv('a', [{ name: 'Ann Lee', meal: 'Lobster' }])], mealChoices: [{ name: 'Beef', color: 'Red' }],
      vendorMeals: [{ name: 'Crew', count: -2 }, { name: 'Band', count: Number.NaN }],
    });
    expect(sheetToText(s.rows).split('\n').slice(0, 6)).toEqual([
      'Meal Choice\t\tColor Code',
      'Beef\t0\tRed',
      'Lobster\t1',
      'Crew\t0\tAllergens / Restrictions (A)\t0',
      'Band\t0\tBooster Chairs (B)\t0',
      'Total:\t1\tHeight Chairs (H)\t0',
    ]);
  });

  const summary = (vendorMeals: { name: string; count: number }[]) =>
    sheetToText(buildReceptionSheet({ tables: [], invitations: [inv('a', [{ name: 'Ann Lee', meal: 'Beef' }])], mealChoices: [{ name: 'Beef', color: 'Red' }], vendorMeals }).rows)
      .split('\n').slice(0, -3);

  it('lists any number of vendor meals and adds them all to the total', () => {
    expect(summary([{ name: 'DJ', count: 2 }, { name: 'Photo', count: 3 }, { name: 'Planner (GF)', count: 1 }])).toEqual([
      'Meal Choice\t\tColor Code',
      'Beef\t1\tRed',
      'DJ\t2',
      'Photo\t3\tAllergens / Restrictions (A)\t0',
      'Planner (GF)\t1\tBooster Chairs (B)\t0',
      'Total:\t7\tHeight Chairs (H)\t0',
    ]);
  });

  it('keeps A and B off the meal rows when there are fewer than two vendor meals', () => {
    expect(summary([{ name: 'Crew', count: 4 }])).toEqual([
      'Meal Choice\t\tColor Code',
      'Beef\t1\tRed',
      'Crew\t4\tAllergens / Restrictions (A)\t0',
      '\t\tBooster Chairs (B)\t0',
      'Total:\t5\tHeight Chairs (H)\t0',
    ]);
    expect(summary([])).toEqual([
      'Meal Choice\t\tColor Code',
      'Beef\t1\tRed',
      '\t\tAllergens / Restrictions (A)\t0',
      '\t\tBooster Chairs (B)\t0',
      'Total:\t1\tHeight Chairs (H)\t0',
    ]);
  });
});
