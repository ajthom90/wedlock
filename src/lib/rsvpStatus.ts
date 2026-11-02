// Whether guests can currently RSVP. Closed when the couple turned off the
// "Accept RSVPs" feature switch, or when the deadline has passed and Settings
// says to close RSVPs after it. The deadline runs to the end of that day in
// the server's time zone. Admin edits from the RSVPs page ignore this.
export function isRsvpClosed(
  settings: { rsvpDeadline: string; rsvpCloseAfterDeadline: boolean },
  features: { rsvpsOpen: boolean },
  now: Date = new Date(),
): boolean {
  if (!features.rsvpsOpen) return true;
  if (!settings.rsvpDeadline || !settings.rsvpCloseAfterDeadline) return false;
  const deadline = new Date(settings.rsvpDeadline);
  if (isNaN(deadline.getTime())) return false;
  deadline.setHours(23, 59, 59, 999);
  return now > deadline;
}
