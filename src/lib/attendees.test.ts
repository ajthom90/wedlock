import { describe, it, expect } from 'vitest';
import { legacyNoteOwner, listAttendees, type AttendeeInvitation } from './attendees';

const base: AttendeeInvitation = {
  id: 'inv',
  guests: [{ id: 'a', name: 'Ann', childSeat: null }, { id: 'b', name: 'Bo', childSeat: 'booster' }, { id: 'c', name: 'Cy' }],
  response: {
    attending: 'yes',
    attendingGuests: JSON.stringify(['a', 'b']),
    guestMeals: JSON.stringify({ a: 'Fish', c: 'Beef' }),
    guestDietary: JSON.stringify({ b: 'Peanuts', c: 'Dairy' }),
    plusOnes: JSON.stringify([{ name: 'Pat', meal: 'Beef', dietary: 'Gluten', childSeat: 'high_chair' }, { name: '  ' }]),
    dietaryNotes: null,
  },
};

describe('listAttendees', () => {
  it('lists ticked guests then plus-ones with their own needs', () => {
    expect(listAttendees(base)).toEqual({
      attendees: [
        { invitationId: 'inv', name: 'Ann', kind: 'guest', guestId: 'a', meal: 'Fish', dietary: '', childSeat: null },
        { invitationId: 'inv', name: 'Bo', kind: 'guest', guestId: 'b', meal: '', dietary: 'Peanuts', childSeat: 'booster' },
        { invitationId: 'inv', name: 'Pat', kind: 'plus-one', guestId: null, meal: 'Beef', dietary: 'Gluten', childSeat: 'high_chair' },
      ],
      unassignedDietary: '',
    });
  });

  it('returns nobody for a declined or missing response', () => {
    expect(listAttendees({ ...base, response: { ...base.response!, attending: 'no' } }).attendees).toEqual([]);
    expect(listAttendees({ ...base, response: null }).attendees).toEqual([]);
  });

  it('treats a missing roster as the whole household', () => {
    const r = listAttendees({ ...base, response: { ...base.response!, attendingGuests: null, plusOnes: null } });
    expect(r.attendees.map((a) => a.name)).toEqual(['Ann', 'Bo', 'Cy']);
  });

  it('keeps an old household note apart when several people are coming', () => {
    const r = listAttendees({ ...base, response: { ...base.response!, guestDietary: null, dietaryNotes: 'Bo: no nuts' } });
    expect(r.unassignedDietary).toBe('Bo: no nuts');
    expect(r.attendees.every((a) => a.dietary === '' || a.kind === 'plus-one')).toBe(true);
  });

  it('gives an old household note to a lone attendee', () => {
    const r = listAttendees({
      ...base,
      response: { ...base.response!, attendingGuests: JSON.stringify(['a']), guestDietary: null, plusOnes: null, dietaryNotes: 'Shellfish' },
    });
    expect(r.attendees).toHaveLength(1);
    expect(r.attendees[0].dietary).toBe('Shellfish');
    expect(r.unassignedDietary).toBe('');
  });
});

describe('legacyNoteOwner', () => {
  const base = {
    id: 'inv1',
    guests: [{ id: 'g1', name: 'Ann' }],
    response: {
      attending: 'yes', attendingGuests: '["g1"]', guestMeals: null, guestDietary: null,
      plusOnes: null, dietaryNotes: 'Peanuts',
    },
  };

  it('is the one attending guest', () => {
    expect(legacyNoteOwner(base)).toEqual({ guestId: 'g1', name: 'Ann' });
  });

  it('is the one plus-one in a plus-ones-only household', () => {
    expect(legacyNoteOwner({
      ...base, guests: [],
      response: { ...base.response, attendingGuests: null, plusOnes: '[{"name":"Sam"}]' },
    })).toEqual({ guestId: null, name: 'Sam' });
  });

  it('is nobody when a plus-one comes too', () => {
    expect(legacyNoteOwner({ ...base, response: { ...base.response, plusOnes: '[{"name":"Sam"}]' } })).toBeNull();
  });

  it('is nobody when the only attendee has their own note, or there is no note', () => {
    expect(legacyNoteOwner({ ...base, response: { ...base.response, guestDietary: '{"g1":"Shellfish"}' } })).toBeNull();
    expect(legacyNoteOwner({ ...base, response: { ...base.response, dietaryNotes: '  ' } })).toBeNull();
  });
});
