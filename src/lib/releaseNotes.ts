import releaseNotes from '../../release-notes.json';
import pkg from '../../package.json';

export type ChangeType = 'feature' | 'improvement' | 'fix';

export interface ReleaseChange {
  type: ChangeType;
  text: string;
}

export interface ReleaseNote {
  version: string;
  date: string;       // YYYY-MM-DD
  changes: ReleaseChange[];
}

// package.json is the source of truth for the current version; git tags are
// always `v${version}`, so the two stay in lockstep as long as releases go
// through ./scripts/docker.sh bump-*.
export const CURRENT_VERSION: string = pkg.version;

// Sorted newest-first by semver, so consumers can just take index 0 for the
// "what's new in this release" banner.
export const RELEASE_NOTES: ReleaseNote[] = (releaseNotes as ReleaseNote[])
  .slice()
  .sort((a, b) => compareSemver(b.version, a.version));

// Returns the entry matching the currently-running version if we have
// notes for it, otherwise null. Old versions (pre-2.8) may not have notes
// — that's fine, banner just stays hidden.
export function getNotesForCurrentVersion(): ReleaseNote | null {
  return RELEASE_NOTES.find((n) => n.version === CURRENT_VERSION) ?? null;
}

// Strict numeric semver comparison (no suffix support). Returns negative if
// a < b, positive if a > b, zero if equal.
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}
