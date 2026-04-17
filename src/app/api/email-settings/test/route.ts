import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getEmailConfig, sendMail } from '@/lib/email';
import { getSiteSettings } from '@/lib/settings';

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { to } = await request.json();
    if (typeof to !== 'string' || !to.trim()) {
      return NextResponse.json({ error: 'Recipient address required' }, { status: 400 });
    }
    if (!getEmailConfig().configured) {
      return NextResponse.json({ error: 'SMTP env vars not set' }, { status: 400 });
    }
    const site = await getSiteSettings();
    const result = await sendMail({
      to: to.trim(),
      subject: `Test email — ${site.coupleName1} & ${site.coupleName2}`,
      body: `This is a test email from your wedding site.\n\nIf you're seeing this, your SMTP configuration is working.\n\n— ${site.coupleName1} & ${site.coupleName2}`,
      fromName: `${site.coupleName1} & ${site.coupleName2}`,
      replyTo: site.replyToEmail || undefined,
    });
    if (result.ok) return NextResponse.json({ ok: true });
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  } catch (err) {
    console.error('Test email failed:', err);
    return NextResponse.json({ error: 'Failed to send test email' }, { status: 500 });
  }
}
