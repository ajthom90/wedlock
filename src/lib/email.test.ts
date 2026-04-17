import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getEmailConfig, renderThemedEmailHtml } from './email';

describe('getEmailConfig', () => {
  const ORIGINAL_ENV = { ...process.env };
  beforeEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
    delete process.env.PUBLIC_SITE_URL;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns configured: false when any required SMTP var is missing', () => {
    expect(getEmailConfig().configured).toBe(false);

    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'a@b.com';
    process.env.SMTP_FROM = 'a@b.com';
    // SMTP_PASS still missing
    expect(getEmailConfig().configured).toBe(false);
  });

  it('returns configured: true when all five SMTP vars are set', () => {
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'a@b.com';
    process.env.SMTP_PASS = 'secret';
    process.env.SMTP_FROM = 'a@b.com';
    expect(getEmailConfig().configured).toBe(true);
  });

  it('never includes the SMTP_PASS value in the returned object', () => {
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'a@b.com';
    process.env.SMTP_PASS = 'super-secret-password';
    process.env.SMTP_FROM = 'a@b.com';
    const config = getEmailConfig();
    expect(JSON.stringify(config)).not.toContain('super-secret-password');
  });

  it('reports publicSiteUrl from env', () => {
    process.env.PUBLIC_SITE_URL = 'https://wedding.example.com';
    expect(getEmailConfig().publicSiteUrl).toBe('https://wedding.example.com');
  });
});

import prisma from './prisma';

describe('renderThemedEmailHtml', () => {
  beforeEach(() => {
    vi.spyOn(prisma.setting, 'findMany').mockResolvedValue([
      { id: '1', key: 'theme.primaryColor', value: '139 90 43' },
      { id: '2', key: 'theme.secondaryColor', value: '180 148 115' },
      { id: '3', key: 'theme.headingFont', value: 'Playfair Display' },
      { id: '4', key: 'theme.bodyFont', value: 'Lato' },
      { id: '5', key: 'site.coupleName1', value: 'Joe' },
      { id: '6', key: 'site.coupleName2', value: 'Alex' },
    ] as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inlines configured theme colors as CSS', async () => {
    const html = await renderThemedEmailHtml('Hello!');
    expect(html).toContain('rgb(139 90 43)');      // primaryColor on heading
    expect(html).toContain('rgb(180 148 115)');    // secondaryColor on dividers
  });

  it('declares configured fonts with system fallbacks', async () => {
    const html = await renderThemedEmailHtml('Hello!');
    expect(html).toMatch(/font-family:\s*'Playfair Display',\s*Georgia,\s*serif/);
    expect(html).toMatch(/font-family:\s*'Lato',\s*Helvetica,\s*Arial,\s*sans-serif/);
  });

  it('renders couple names in the header', async () => {
    const html = await renderThemedEmailHtml('Hello!');
    expect(html).toContain('Joe &amp; Alex');
  });

  it('HTML-escapes user input', async () => {
    const html = await renderThemedEmailHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('converts newlines to <br>', async () => {
    const html = await renderThemedEmailHtml('line one\nline two');
    expect(html).toContain('line one<br>line two');
  });

  it('autolinks bare URLs', async () => {
    const html = await renderThemedEmailHtml('Visit https://example.com today');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('>https://example.com</a>');
  });
});

import { sendMail, _resetEmailTransportForTests } from './email';
import nodemailer from 'nodemailer';

describe('sendMail', () => {
  const sendMailMock = vi.fn();
  beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'sender@test';
    process.env.SMTP_PASS = 'secret';
    process.env.SMTP_FROM = 'sender@test';
    _resetEmailTransportForTests();
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: 'fake' });
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: sendMailMock,
      verify: vi.fn().mockResolvedValue(true),
    } as any);
    // theme + site settings mocks (re-using the prisma mock pattern from earlier tests)
    vi.spyOn(prisma.setting, 'findMany').mockResolvedValue([
      { id: '1', key: 'site.coupleName1', value: 'Joe' },
      { id: '2', key: 'site.coupleName2', value: 'Alex' },
    ] as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends multipart/alternative with both html and text', async () => {
    const result = await sendMail({ to: 'guest@test', subject: 'hi', body: 'hello world' });
    expect(result.ok).toBe(true);
    expect(sendMailMock).toHaveBeenCalledOnce();
    const envelope = sendMailMock.mock.calls[0][0];
    expect(envelope.to).toBe('guest@test');
    expect(envelope.subject).toBe('hi');
    expect(envelope.text).toBe('hello world');
    expect(envelope.html).toContain('hello world');
    expect(envelope.html).toContain('<!DOCTYPE html>');
  });

  it('uses configured fromName as the From display name', async () => {
    await sendMail({ to: 'g@t', subject: 's', body: 'b', fromName: 'Joe & Alex' });
    const envelope = sendMailMock.mock.calls[0][0];
    expect(envelope.from).toBe('"Joe & Alex" <sender@test>');
  });

  it('uses replyTo when provided, otherwise no Reply-To header', async () => {
    await sendMail({ to: 'g@t', subject: 's', body: 'b', replyTo: 'couple@example.com' });
    expect(sendMailMock.mock.calls[0][0].replyTo).toBe('couple@example.com');

    sendMailMock.mockClear();
    await sendMail({ to: 'g@t', subject: 's', body: 'b' });
    expect(sendMailMock.mock.calls[0][0].replyTo).toBeUndefined();
  });

  it('returns { ok: false, error } when transport throws', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP down'));
    const result = await sendMail({ to: 'g@t', subject: 's', body: 'b' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('SMTP down');
  });
});

import { sendRsvpConfirmation } from './email';

describe('sendRsvpConfirmation', () => {
  const sendMailMock = vi.fn();
  beforeEach(() => {
    process.env.SMTP_HOST = 'smtp.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'sender@test';
    process.env.SMTP_PASS = 'secret';
    process.env.SMTP_FROM = 'sender@test';
    process.env.PUBLIC_SITE_URL = 'https://wedding.example.com';
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: 'fake' });
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: sendMailMock,
      verify: vi.fn().mockResolvedValue(true),
    } as any);
    vi.spyOn(prisma.setting, 'findMany').mockResolvedValue([
      { id: '1', key: 'site.coupleName1', value: 'Joe' },
      { id: '2', key: 'site.coupleName2', value: 'Alex' },
      { id: '3', key: 'site.rsvpDeadline', value: '2026-08-01' },
      { id: '4', key: 'site.replyToEmail', value: 'joeandalex@example.com' },
    ] as any);
    _resetEmailTransportForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseInvitation = {
    id: 'inv-1',
    code: 'ABC123',
    householdName: 'The Smiths',
    contactEmail: 'smiths@test',
  };
  const baseResponse = {
    attending: 'yes',
    guestCount: 2,
    attendingGuests: JSON.stringify(['Alice Smith', 'Bob Smith']),
    guestMeals: null,
    plusOnes: null,
    songRequests: null,
    dietaryNotes: null,
    message: null,
  };

  it('uses "RSVP confirmed" subject on first submission', async () => {
    await sendRsvpConfirmation(baseInvitation as any, baseResponse as any, { isUpdate: false });
    expect(sendMailMock.mock.calls[0][0].subject).toContain('RSVP confirmed');
  });

  it('uses "RSVP updated" subject on edit', async () => {
    await sendRsvpConfirmation(baseInvitation as any, baseResponse as any, { isUpdate: true });
    expect(sendMailMock.mock.calls[0][0].subject).toContain('RSVP updated');
  });

  it('includes the magic link with PUBLIC_SITE_URL and invitation code', async () => {
    await sendRsvpConfirmation(baseInvitation as any, baseResponse as any, { isUpdate: false });
    const text: string = sendMailMock.mock.calls[0][0].text;
    expect(text).toContain('https://wedding.example.com/rsvp?code=ABC123');
  });

  it('renders attending status, guest count, and attending names', async () => {
    await sendRsvpConfirmation(baseInvitation as any, baseResponse as any, { isUpdate: false });
    const text: string = sendMailMock.mock.calls[0][0].text;
    expect(text).toContain('Attending: Yes');
    expect(text).toContain('Guests: 2');
    expect(text).toContain('Alice Smith');
    expect(text).toContain('Bob Smith');
  });

  it('renders "Attending: No" when declined', async () => {
    await sendRsvpConfirmation(baseInvitation as any, { ...baseResponse, attending: 'no', guestCount: 0 } as any, { isUpdate: false });
    const text: string = sendMailMock.mock.calls[0][0].text;
    expect(text).toContain('Attending: No');
    expect(text).not.toContain('Guests: 0');  // no recap of guest list when declining
  });

  it('omits optional sections when their fields are null', async () => {
    await sendRsvpConfirmation(baseInvitation as any, baseResponse as any, { isUpdate: false });
    const text: string = sendMailMock.mock.calls[0][0].text;
    expect(text).not.toContain('Dietary notes:');
    expect(text).not.toContain('Song requests:');
    expect(text).not.toContain('Your message:');
  });

  it('includes optional sections when their fields are present', async () => {
    const response = { ...baseResponse, dietaryNotes: 'no peanuts', songRequests: 'Disco Inferno', message: 'Cannot wait!' };
    await sendRsvpConfirmation(baseInvitation as any, response as any, { isUpdate: false });
    const text: string = sendMailMock.mock.calls[0][0].text;
    expect(text).toContain('Dietary notes: no peanuts');
    expect(text).toContain('Song requests: Disco Inferno');
    expect(text).toContain('Your message: Cannot wait!');
  });

  it('uses replyToEmail as the Reply-To header', async () => {
    await sendRsvpConfirmation(baseInvitation as any, baseResponse as any, { isUpdate: false });
    expect(sendMailMock.mock.calls[0][0].replyTo).toBe('joeandalex@example.com');
  });

  it('uses couple names as the From display name', async () => {
    await sendRsvpConfirmation(baseInvitation as any, baseResponse as any, { isUpdate: false });
    expect(sendMailMock.mock.calls[0][0].from).toBe('"Joe & Alex" <sender@test>');
  });
});
