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
