import { describe, it, expect } from 'vitest';
import { isRsvpClosed } from './rsvpStatus';

const open = { rsvpsOpen: true };
const noDeadline = { rsvpDeadline: '', rsvpCloseAfterDeadline: false };

describe('isRsvpClosed', () => {
  it('is open by default', () => {
    expect(isRsvpClosed(noDeadline, open)).toBe(false);
  });

  it('is closed when the Accept RSVPs switch is off', () => {
    expect(isRsvpClosed(noDeadline, { rsvpsOpen: false })).toBe(true);
  });

  it('stays open after the deadline unless closing after it is turned on', () => {
    const settings = { rsvpDeadline: '2026-06-01', rsvpCloseAfterDeadline: false };
    expect(isRsvpClosed(settings, open, new Date(2026, 6, 1))).toBe(false);
  });

  it('closes after the end of the deadline day when closing after it is on', () => {
    const settings = { rsvpDeadline: '2026-06-01T00:00:00', rsvpCloseAfterDeadline: true };
    expect(isRsvpClosed(settings, open, new Date(2026, 5, 1, 23, 0))).toBe(false);
    expect(isRsvpClosed(settings, open, new Date(2026, 5, 2, 0, 1))).toBe(true);
  });

  it('ignores an unparseable deadline', () => {
    const settings = { rsvpDeadline: 'soon', rsvpCloseAfterDeadline: true };
    expect(isRsvpClosed(settings, open)).toBe(false);
  });
});
