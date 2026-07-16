import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSiteSettings } from '@/lib/settings';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const settings = await getSiteSettings();
    // Guard the empty case: with no password configured the gate isn't
    // rendered, and an empty submission must not mint an access cookie.
    if (settings.sitePassword && password === settings.sitePassword) {
      (await cookies()).set('site_access', 'granted', {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
      return NextResponse.json({ success: true });
    }
    // 401 (not 200 {success:false}) — SitePasswordGate branches on res.ok.
    return NextResponse.json({ error: 'Incorrect password. Please try again.' }, { status: 401 });
  } catch (error) {
    console.error('Error verifying site password:', error);
    return NextResponse.json({ error: 'Failed to verify password' }, { status: 500 });
  }
}
