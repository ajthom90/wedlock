import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from './prisma';
import { splitTableNumbersOnce, TABLE_NUMBERS_SETTING } from './tableNumbersDb';

describe('splitTableNumbersOnce', () => {
  let updates: { where: { id: string }; data: { name: string; number: number | null } }[];
  let settings: { data: { key: string; value: string } }[];

  beforeEach(() => {
    vi.restoreAllMocks();
    updates = [];
    settings = [];
    const tx = {
      seatingTable: { update: vi.fn(async (args) => { updates.push(args); return {}; }) },
      setting: { create: vi.fn(async (args) => { settings.push(args); return {}; }) },
    };
    vi.spyOn(prisma, '$transaction').mockImplementation((async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) as any);
  });

  it('splits prefixed names once and records the old names', async () => {
    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.seatingTable, 'findMany').mockResolvedValue([
      { id: 't0', name: '00. Head Table', number: null },
      { id: 't1', name: '01. Kim & Joe’s Table', number: null },
      { id: 't34', name: "34. Kim Mo's HS Friends", number: null },
      { id: 'tx', name: 'Kids Table', number: null },
      { id: 'ty', name: '07. Already Numbered', number: 9 },
    ] as any);

    await splitTableNumbersOnce();

    expect(updates).toEqual([
      { where: { id: 't0' }, data: { name: 'Head Table', number: null } },
      { where: { id: 't1' }, data: { name: 'Kim & Joe’s Table', number: 1 } },
      { where: { id: 't34' }, data: { name: "Kim Mo's HS Friends", number: 34 } },
    ]);
    expect(settings).toHaveLength(1);
    expect(settings[0].data.key).toBe(TABLE_NUMBERS_SETTING);
    const recorded = JSON.parse(settings[0].data.value);
    expect(recorded.tables).toBe(5);
    expect(recorded.changes.map((c: { from: string }) => c.from)).toEqual(['00. Head Table', '01. Kim & Joe’s Table', "34. Kim Mo's HS Friends"]);
  });

  it('does nothing once it has run', async () => {
    vi.spyOn(prisma.setting, 'findUnique').mockResolvedValue({ id: 's', key: TABLE_NUMBERS_SETTING, value: '{}' });
    const findMany = vi.spyOn(prisma.seatingTable, 'findMany');
    await splitTableNumbersOnce();
    expect(findMany).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
    expect(settings).toEqual([]);
  });
});
