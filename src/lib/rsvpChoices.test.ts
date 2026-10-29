import { describe, it, expect } from 'vitest';
import { parseRsvpChoices } from './rsvpChoices';

describe('parseRsvpChoices', () => {
  it('reads the legacy string[] shape', () => {
    expect(parseRsvpChoices('["Beef", " Chicken ", ""]')).toEqual([{ name: 'Beef' }, { name: 'Chicken' }]);
  });

  it('keeps descriptions and a known color, normalizing its case', () => {
    expect(parseRsvpChoices(JSON.stringify([
      { name: 'Beef', description: 'Short rib', color: 'red' },
      { name: 'Chicken', color: 'Blue' },
    ]))).toEqual([
      { name: 'Beef', description: 'Short rib', color: 'Red' },
      { name: 'Chicken', color: 'Blue' },
    ]);
  });

  it('drops a color that is not in the palette', () => {
    expect(parseRsvpChoices(JSON.stringify([{ name: 'Beef', color: 'Chartreuse' }, { name: 'Fish', color: 7 }])))
      .toEqual([{ name: 'Beef' }, { name: 'Fish' }]);
  });

  it('returns [] for empty or broken input', () => {
    expect(parseRsvpChoices(null)).toEqual([]);
    expect(parseRsvpChoices('not json')).toEqual([]);
    expect(parseRsvpChoices('{}')).toEqual([]);
  });
});
