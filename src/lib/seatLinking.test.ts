import { describe, it, expect } from 'vitest';
import { isPlusOneSeat, planSeatLinks, plusOnesOf, type SeatToLink } from './seatLinking';

const seat = (id: string, guestName: string, invitationId: string | null, guestId: string | null = null): SeatToLink => ({
  id, guestName, invitationId, guestId,
});

const steffens = [
  { id: 'g-daryl', name: 'Daryl Steffen', invitationId: 'steffen' },
  { id: 'g-marilyn', name: 'Marilyn Steffen', invitationId: 'steffen' },
  { id: 'g-jake', name: 'Jake Steffen', invitationId: 'steffen' },
];
const lees = [{ id: 'g-ann', name: 'Ann Lee', invitationId: 'lee' }];

describe('planSeatLinks', () => {
  it('links seats to guests by exact name on their own invitation, ignoring case and spacing', () => {
    const plan = planSeatLinks(
      [seat('s1', 'Ann Lee', 'lee'), seat('s2', '  marilyn   steffen ', 'steffen')],
      [...steffens, ...lees],
      [],
    );
    expect(plan.links).toEqual([
      { seatId: 's1', guestId: 'g-ann', how: 'exact' },
      { seatId: 's2', guestId: 'g-marilyn', how: 'exact' },
    ]);
    expect(plan.flagged).toEqual([]);
  });

  it('links a guest renamed from a first name to a full name within the same household', () => {
    const plan = planSeatLinks([seat('s1', 'Daryl', 'steffen'), seat('s2', 'Jake', 'steffen')], steffens, []);
    expect(plan.links).toEqual([
      { seatId: 's1', guestId: 'g-daryl', how: 'renamed' },
      { seatId: 's2', guestId: 'g-jake', how: 'renamed' },
    ]);
  });

  it('also links the other way, a full name shortened', () => {
    const plan = planSeatLinks([seat('s1', 'Ann Lee Park', 'lee')], lees, []);
    expect(plan.links).toEqual([{ seatId: 's1', guestId: 'g-ann', how: 'renamed' }]);
  });

  it('flags a renamed seat when more than one guest in the household fits', () => {
    const plan = planSeatLinks(
      [seat('s1', 'Ella', 'b')],
      [{ id: 'g1', name: 'Ella Studier', invitationId: 'b' }, { id: 'g2', name: 'Ella Elbert', invitationId: 'b' }],
      [],
    );
    expect(plan.links).toEqual([]);
    expect(plan.flagged).toEqual([{ seatId: 's1', guestName: 'Ella', reason: 'ambiguous' }]);
  });

  it('flags a seat whose guest is gone, and never matches a guest in another household by a partial name', () => {
    const plan = planSeatLinks(
      [seat('s1', 'Zed Quill', 'lee'), seat('s2', 'Daryl', 'lee')],
      [...steffens, ...lees],
      [],
    );
    expect(plan.links).toEqual([]);
    expect(plan.flagged).toEqual([
      { seatId: 's1', guestName: 'Zed Quill', reason: 'no-match' },
      { seatId: 's2', guestName: 'Daryl', reason: 'no-match' },
    ]);
  });

  it('keeps a seat on its own household even when the exact name is in another one', () => {
    const plan = planSeatLinks([seat('s1', 'Ann Lee', 'steffen')], [...steffens, ...lees], []);
    expect(plan.links).toEqual([]);
    expect(plan.flagged.map((f) => f.reason)).toEqual(['no-match']);
  });

  it('links a seat saved without an invitation only when one guest anywhere has the name', () => {
    const plan = planSeatLinks(
      [seat('s1', 'Ann Lee', null), seat('s2', 'Sam Roe', null), seat('s3', 'Ann Lee', 'deleted-invitation')],
      [...lees, { id: 'g-sam1', name: 'Sam Roe', invitationId: 'x' }, { id: 'g-sam2', name: 'Sam Roe', invitationId: 'y' }],
      [],
    );
    expect(plan.links).toEqual([{ seatId: 's1', guestId: 'g-ann', how: 'exact-other-invitation' }]);
    expect(plan.flagged).toEqual([
      { seatId: 's2', guestName: 'Sam Roe', reason: 'ambiguous' },
      { seatId: 's3', guestName: 'Ann Lee', reason: 'already-seated' },
    ]);
  });

  it('links only the first of two seats for the same guest and flags the other', () => {
    const plan = planSeatLinks([seat('s1', 'Ann Lee', 'lee'), seat('s2', 'Ann Lee', 'lee')], lees, []);
    expect(plan.links).toEqual([{ seatId: 's1', guestId: 'g-ann', how: 'exact' }]);
    expect(plan.flagged).toEqual([{ seatId: 's2', guestName: 'Ann Lee', reason: 'already-seated' }]);
  });

  it('leaves the stale seat flagged when the renamed guest was already re-seated under the new name', () => {
    const plan = planSeatLinks([seat('old', 'Daryl', 'steffen'), seat('new', 'Daryl Steffen', 'steffen')], steffens, []);
    expect(plan.links).toEqual([{ seatId: 'new', guestId: 'g-daryl', how: 'exact' }]);
    expect(plan.flagged).toEqual([{ seatId: 'old', guestName: 'Daryl', reason: 'already-seated' }]);
  });

  it('flags a seat when two guests in its household share the name', () => {
    const twins = [{ id: 'a', name: 'Pat Kim', invitationId: 'k' }, { id: 'b', name: 'Pat Kim', invitationId: 'k' }];
    const plan = planSeatLinks([seat('s1', 'Pat Kim', 'k')], twins, []);
    expect(plan.links).toEqual([]);
    expect(plan.flagged).toEqual([{ seatId: 's1', guestName: 'Pat Kim', reason: 'ambiguous' }]);
  });

  it('keeps plus-one seats as plus-ones and leaves linked seats alone', () => {
    const plan = planSeatLinks(
      [seat('s1', 'Cal Jones', 'lee'), seat('s2', 'Ann Lee', 'lee', 'g-ann'), seat('s3', 'Ann Lee', 'lee')],
      lees,
      [{ invitationId: 'lee', name: 'Cal Jones' }],
    );
    expect(plan.links).toEqual([]);
    expect(plan.plusOnes).toEqual(['s1']);
    expect(plan.flagged).toEqual([{ seatId: 's3', guestName: 'Ann Lee', reason: 'already-seated' }]);
  });

  it('prefers an exact match over a renamed one for the same guest', () => {
    const plan = planSeatLinks([seat('s1', 'Jake', 'steffen'), seat('s2', 'Jake Steffen', 'steffen')], steffens, []);
    expect(plan.links).toEqual([{ seatId: 's2', guestId: 'g-jake', how: 'exact' }]);
    expect(plan.flagged).toEqual([{ seatId: 's1', guestName: 'Jake', reason: 'already-seated' }]);
  });
});

describe('plusOnesOf / isPlusOneSeat', () => {
  it('reads plus-ones from either RSVP shape', () => {
    expect(plusOnesOf({ id: 'a', response: { plusOnes: JSON.stringify([{ name: 'Cal' }, { name: ' ' }, null]) } })).toEqual([
      { invitationId: 'a', name: 'Cal' },
    ]);
    expect(plusOnesOf({ id: 'b', response: { plusOnes: null, plusOneName: 'Dee' } })).toEqual([{ invitationId: 'b', name: 'Dee' }]);
    expect(plusOnesOf({ id: 'c', response: null })).toEqual([]);
  });

  it('tells a plus-one seat from one that lost its guest', () => {
    const pluses = [{ invitationId: 'a', name: 'Cal Jones' }];
    expect(isPlusOneSeat({ guestName: 'cal jones', invitationId: 'a' }, pluses)).toBe(true);
    expect(isPlusOneSeat({ guestName: 'Cal Jones', invitationId: 'b' }, pluses)).toBe(false);
    expect(isPlusOneSeat({ guestName: 'Cal Jones', invitationId: 'a', guestId: 'g' }, pluses)).toBe(false);
  });
});
