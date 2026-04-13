import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSiteSettings } from '@/lib/settings';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const settings = await getSiteSettings();
    if (password === settings.sitePassword) {
      (await cookies()).set('site_access', 'granted', {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: false });
  } catch (error) {
    console.error('Error verifying site password:', error);
    return NextResponse.json({ error: 'Failed to verify password' }, { status: 500 });
  }
}
