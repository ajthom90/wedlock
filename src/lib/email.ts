import { getTheme, getSiteSettings } from './settings';

const REQUIRED_SMTP_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const;

export interface EmailConfigStatus {
  configured: boolean;
  host?: string;
  port?: string;
  user?: string;
  from?: string;
  publicSiteUrl?: string;
}

export function getEmailConfig(): EmailConfigStatus {
  const configured = REQUIRED_SMTP_VARS.every((v) => !!process.env[v]);
  return {
    configured,
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    from: process.env.SMTP_FROM,
    publicSiteUrl: process.env.PUBLIC_SITE_URL,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Replaces newlines with <br> and turns bare URLs into anchor tags. Must run
// AFTER escapeHtml so the &amp; etc. are already in place; the URL regex
// matches the escaped form just fine for bare http(s) links.
function plainTextToHtmlBody(plain: string, linkColor: string): string {
  const escaped = escapeHtml(plain);
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}" style="color: ${linkColor};">${url}</a>`,
  );
  return linked.replace(/\n/g, '<br>');
}

import nodemailer, { Transporter } from 'nodemailer';

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter {
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
    pool: true,         // amortize TLS handshake across consecutive sends
    maxConnections: 1,
  });
  return cachedTransport;
}

// Test-only hook so tests don't reuse a mocked transport across describe blocks.
export function _resetEmailTransportForTests() {
  cachedTransport = null;
}

export interface SendMailArgs {
  to: string;
  subject: string;
  body: string;          // plain text
  replyTo?: string;
  fromName?: string;
}

export type SendMailResult = { ok: true } | { ok: false; error: string };

export async function sendMail(args: SendMailArgs): Promise<SendMailResult> {
  try {
    const html = await renderThemedEmailHtml(args.body);
    const fromAddress = process.env.SMTP_FROM!;
    const from = args.fromName
      ? `"${args.fromName}" <${fromAddress}>`
      : fromAddress;
    await getTransport().sendMail({
      from,
      to: args.to,
      subject: args.subject,
      text: args.body,
      html,
      replyTo: args.replyTo,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

import type { Invitation, RsvpResponse } from '@prisma/client';

function formatDeadline(deadline: string): string {
  if (!deadline) return '';
  // Date strings come from settings as YYYY-MM-DD; render as a friendly date
  // without forcing a timezone parse. Falls back to the raw string if Date
  // construction fails.
  const d = new Date(deadline + 'T00:00:00');
  if (isNaN(d.getTime())) return deadline;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function buildRsvpRecapBody(args: {
  householdName: string;
  attending: string;
  guestCount: number;
  // attendingGuests stores guest IDs from Invitation.guests — we resolve
  // them against guestNameById below. Unknown IDs render raw as a fallback.
  attendingGuests: string[] | null;
  guestNameById: Record<string, string>;
  plusOnes: { name: string; meal?: string }[] | null;
  guestMeals: Record<string, string> | null;
  songRequests: string | null;
  dietaryNotes: string | null;
  message: string | null;
  rsvpDeadline: string;
  magicLink: string;
  coupleNames: string;
}): string {
  const lines: string[] = [];
  // Strip a leading "The " from the household name so "The Johnson Family"
  // reads naturally as "Hi Johnson Family," not "Hi The Johnson Family,".
  const greetingName = args.householdName.replace(/^the\s+/i, '');
  lines.push(`Hi ${greetingName},`);
  lines.push('');
  lines.push("Thanks for your RSVP! Here's what we got:");
  lines.push('');
  lines.push(`  Attending: ${args.attending === 'yes' ? 'Yes' : 'No'}`);

  if (args.attending === 'yes' && args.guestCount > 0) {
    lines.push(`  Guests: ${args.guestCount}`);
    if (args.attendingGuests && args.attendingGuests.length) {
      for (const id of args.attendingGuests) {
        const name = args.guestNameById[id] ?? id;
        const meal = args.guestMeals?.[id];
        lines.push(meal ? `    - ${name} (${meal})` : `    - ${name}`);
      }
    }
    if (args.plusOnes && args.plusOnes.length) {
      for (const p of args.plusOnes) {
        lines.push(p.meal ? `    - ${p.name} (${p.meal})` : `    - ${p.name}`);
      }
    }
  }

  lines.push('');
  if (args.dietaryNotes) lines.push(`Dietary notes: ${args.dietaryNotes}`, '');
  if (args.songRequests) lines.push(`Song requests: ${args.songRequests}`, '');
  if (args.message) lines.push(`Your message: ${args.message}`, '');

  const deadlineCopy = args.rsvpDeadline
    ? `before ${formatDeadline(args.rsvpDeadline)}`
    : 'anytime';
  lines.push(`Need to make a change ${deadlineCopy}? Update your RSVP here:`);
  lines.push(args.magicLink);
  lines.push('');
  lines.push('Looking forward to it!');
  lines.push(args.coupleNames);

  return lines.join('\n');
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export async function sendRsvpConfirmation(
  // Caller should pass an invitation with its `guests` relation loaded; we
  // use it to translate stored guest IDs back to display names in the recap.
  invitation: Invitation & { guests?: { id: string; name: string }[] },
  response: RsvpResponse,
  opts: { isUpdate: boolean },
): Promise<SendMailResult> {
  if (!invitation.contactEmail) return { ok: false, error: 'No contactEmail on invitation' };

  const site = await getSiteSettings();
  const config = getEmailConfig();
  const coupleNames = `${site.coupleName1} & ${site.coupleName2}`;
  const subject = opts.isUpdate
    ? `RSVP updated — ${coupleNames}'s wedding`
    : `RSVP confirmed — ${coupleNames}'s wedding`;
  const magicLink = `${config.publicSiteUrl ?? ''}/rsvp?code=${invitation.code}`;
  const guestNameById: Record<string, string> = Object.fromEntries(
    (invitation.guests ?? []).map((g) => [g.id, g.name]),
  );

  const body = buildRsvpRecapBody({
    householdName: invitation.householdName,
    attending: response.attending,
    guestCount: response.guestCount,
    attendingGuests: safeJsonParse<string[] | null>(response.attendingGuests, null),
    guestNameById,
    plusOnes: safeJsonParse<{ name: string; meal?: string }[] | null>(response.plusOnes, null),
    guestMeals: safeJsonParse<Record<string, string> | null>(response.guestMeals, null),
    songRequests: response.songRequests,
    dietaryNotes: response.dietaryNotes,
    message: response.message,
    rsvpDeadline: site.rsvpDeadline,
    magicLink,
    coupleNames,
  });

  return sendMail({
    to: invitation.contactEmail,
    subject,
    body,
    fromName: coupleNames,
    replyTo: site.replyToEmail || undefined,
  });
}

export async function renderThemedEmailHtml(plainBody: string): Promise<string> {
  const theme = await getTheme();
  const site = await getSiteSettings();
  const coupleNames = escapeHtml(`${site.coupleName1} & ${site.coupleName2}`);
  const primary = `rgb(${theme.primaryColor})`;
  const secondary = `rgb(${theme.secondaryColor})`;
  const fg = `rgb(${theme.foregroundColor})`;
  const bg = `rgb(${theme.backgroundColor})`;
  const headingFamily = `'${theme.headingFont}', Georgia, serif`;
  const bodyFamily = `'${theme.bodyFont}', Helvetica, Arial, sans-serif`;
  const bodyHtml = plainTextToHtmlBody(plainBody, primary);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background-color: ${bg}; font-family: ${bodyFamily}; color: ${fg};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${bg};">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; padding: 32px;">
        <tr><td>
          <h1 style="margin: 0 0 8px; font-family: ${headingFamily}; color: ${primary}; font-size: 28px; text-align: center; font-weight: normal;">${coupleNames}</h1>
          <hr style="border: none; border-top: 1px solid ${secondary}; margin: 24px 0;">
          <div style="font-size: 16px; line-height: 1.6; color: ${fg};">${bodyHtml}</div>
          <hr style="border: none; border-top: 1px solid ${secondary}; margin: 24px 0;">
          <p style="margin: 0; font-size: 12px; color: ${secondary}; text-align: center;">Sent from the ${coupleNames} wedding site.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
