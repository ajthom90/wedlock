import { NextResponse } from 'next/server';
import { CURRENT_VERSION, RELEASE_NOTES } from '@/lib/releaseNotes';

export async function GET() {
  // Public endpoint — the version is already visible in the admin UI and
  // release notes aren't sensitive. AdminNav and the new-features banner
  // both read from here.
  return NextResponse.json({ currentVersion: CURRENT_VERSION, notes: RELEASE_NOTES });
}
