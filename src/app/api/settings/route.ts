import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getSiteSettings, getTheme, saveSiteSettings, saveTheme } from '@/lib/settings';

export async function GET() {
  try {
    const [site, theme] = await Promise.all([getSiteSettings(), getTheme()]);
    return NextResponse.json({ site, theme });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { site, theme } = await request.json();
    if (site) await saveSiteSettings(site);
    if (theme) await saveTheme(theme);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
