# Email Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two email features to the wedding site: automatic RSVP confirmations on every submit/edit, and admin-composed day-of broadcasts to opted-in invitations. Both share one optional `contactEmail` field on the invitation, one nodemailer-based SMTP transport, and one themed HTML wrapper that pulls site colors and fonts.

**Architecture:** Extract the broadcast send loop into a service module (`src/lib/broadcasts.ts`) so it's testable without exercising the route handler. The email module (`src/lib/email.ts`) is also pure — pulls config from env, theme from the DB, sends via a singleton pooled nodemailer transport. Two new admin pages, two new feature flags (both default off), one new env var (`PUBLIC_SITE_URL`). Schema is additive so `npx prisma db push` is safe on existing prod DBs.

**Tech Stack:** Next.js 14 App Router (server route handlers), Prisma + SQLite, nodemailer (new dep), vitest (existing test runner).

**Spec:** [`docs/superpowers/specs/2026-04-17-day-of-broadcasts-design.md`](../specs/2026-04-17-day-of-broadcasts-design.md)

---

## Background notes for an engineer new to the codebase

- **Tests** live as siblings to source files: `src/lib/foo.ts` → `src/lib/foo.test.ts`. Vitest is configured for `src/**/*.test.ts(x)` with the `node` environment. Mocking with `vi.spyOn` and `vi.mock` is the established style (see `src/lib/mapUrl.test.ts`).
- **Auth on API routes**: import `isAuthenticated` from `@/lib/auth` and gate writes with `if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });`. GET endpoints often skip auth for read-only data the public also needs (e.g., `/api/features`).
- **Settings**: read via `getSiteSettings()` / `getFeatures()` from `@/lib/settings`, written via `saveSiteSettings()` / `saveFeatures()`. All settings persist as key-value rows in the `Setting` table.
- **Feature flags in admin nav**: items in `src/components/admin/AdminNav.tsx` accept an optional `feature: string` prop that gates visibility via `isItemVisible`. Loading state is fail-open.
- **Prisma client** is a singleton at `@/lib/prisma`. Tests that need to exercise prisma logic should use `vi.mock('@/lib/prisma', ...)`.
- **DB upgrade path**: schema changes are applied with `npx prisma db push` (no migration files). Additive only — never destroy data.

---

## Task 1: Install nodemailer

**Files:**
- Modify: `package.json` (and lockfile)

- [ ] **Step 1: Install nodemailer + types**

Run:
```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

Expected: both packages added to `package.json`, `node_modules/nodemailer` exists.

- [ ] **Step 2: Verify type-check still passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add nodemailer for email sending"
```

---

## Task 2: Schema additions

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `contactEmail` to `Invitation`**

Locate the `Invitation` model. After the `email String?` line, add:

```prisma
  contactEmail    String?  // guest-supplied at RSVP time; opts the invitation into RSVP confirmations + day-of broadcasts
```

Also add two new relations at the bottom of the model (alongside `guests`, `response`, etc.):

```prisma
  broadcastDeliveries BroadcastDelivery[]
```

- [ ] **Step 2: Add `Broadcast` and `BroadcastDelivery` models**

Append to the bottom of `prisma/schema.prisma`:

```prisma
// Day-of broadcast emails — admin composes a message and sends it to every
// invitation with a contactEmail on file.
model Broadcast {
  id             String              @id @default(uuid())
  subject        String
  body           String              // plain text — themed HTML wrapper applied at send time
  sentAt         DateTime            @default(now())
  sentBy         String              // "admin" for now; future-proof for multi-admin
  recipientCount Int                 // denormalized — count at send time
  deliveries     BroadcastDelivery[]
}

model BroadcastDelivery {
  id           String     @id @default(uuid())
  broadcastId  String
  broadcast    Broadcast  @relation(fields: [broadcastId], references: [id], onDelete: Cascade)
  invitationId String
  invitation   Invitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)
  emailAddress String     // snapshot at send time so later edits don't rewrite history
  status       String     // "sent" | "failed"
  errorMessage String?
  sentAt       DateTime   @default(now())

  @@index([broadcastId])
  @@unique([broadcastId, invitationId])
}
```

- [ ] **Step 3: Apply schema and regenerate client**

Run:
```bash
npx prisma db push
npx prisma generate
```

Expected: "Your database is now in sync with your Prisma schema." and "Generated Prisma Client" output, no errors.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (The new types are now available via `@prisma/client`.)

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "Add contactEmail field, Broadcast and BroadcastDelivery models"
```

---

## Task 3: Settings + feature flags wiring

**Files:**
- Modify: `src/lib/settings.ts`
- Modify: `src/app/admin/(authenticated)/features/page.tsx`

- [ ] **Step 1: Add `replyToEmail` to `SiteSettings`**

In `src/lib/settings.ts`, add to the `SiteSettings` interface (after `weddingPartyLeftSide`):

```ts
  replyToEmail: string;
```

Add to `defaultSite`:

```ts
  replyToEmail: '',
```

The existing string-passthrough branch in `getSiteSettings` (the final `else` clause) handles this field with no further changes needed.

- [ ] **Step 2: Add the two feature flags**

In the `FeatureSettings` interface, add these two fields. Put them in a new section grouped with the public modules block — labeled comment-wise to make the default-false rationale visible to future readers:

```ts
  // Email features — both default OFF because they require SMTP env vars.
  rsvpConfirmationEmails: boolean;
  dayOfBroadcasts: boolean;
```

Add to `defaultFeatures` (the same comment placement):

```ts
  rsvpConfirmationEmails: false,
  dayOfBroadcasts: false,
```

- [ ] **Step 3: Mirror the new flags in the features admin page**

In `src/app/admin/(authenticated)/features/page.tsx`, update the local `FeatureSettings` interface and `DEFAULTS` object to include both new flags (matching exactly what's in `src/lib/settings.ts`).

Then add a new `ToggleDescriptor` section near the existing `ADMIN_TOOLS` group (read the file to find the right insertion point — there's likely a `RENDER_GROUPS` array near the bottom of the file). Add:

```ts
const EMAIL_FEATURES: ToggleDescriptor[] = [
  { key: 'rsvpConfirmationEmails', label: 'RSVP confirmation emails',
    description: 'Send each guest a confirmation email after every RSVP submit/edit, with a recap and a magic link to update before the deadline. Requires SMTP env vars to be configured.' },
  { key: 'dayOfBroadcasts', label: 'Day-of broadcasts',
    description: 'Enable the Broadcasts admin page so you can send timely email updates to invitations that opted in (e.g., shuttle delays, ceremony timing). Requires SMTP env vars to be configured.' },
];
```

Add a corresponding render group entry. The exact wiring will be obvious from the surrounding code — match the pattern of the existing groups.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts src/app/admin/\(authenticated\)/features/page.tsx
git commit -m "Add replyToEmail setting and two email feature flags"
```

---

## Task 4: Email module — `getEmailConfig` and themed HTML renderer

**Files:**
- Create: `src/lib/email.ts`
- Create: `src/lib/email.test.ts`

This task builds the two pure-ish functions first; transport and senders come in later tasks.

- [ ] **Step 1: Write failing tests for `getEmailConfig`**

Create `src/lib/email.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/email.test.ts`
Expected: FAIL — module `./email` doesn't exist yet.

- [ ] **Step 3: Implement `getEmailConfig`**

Create `src/lib/email.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/email.test.ts`
Expected: 4 passed (the `getEmailConfig` describe block).

- [ ] **Step 5: Write failing tests for `renderThemedEmailHtml`**

Append to `src/lib/email.test.ts`:

```ts
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
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/lib/email.test.ts`
Expected: the `renderThemedEmailHtml` describe block FAILs (function not exported).

- [ ] **Step 7: Implement `renderThemedEmailHtml`**

Append to `src/lib/email.ts`:

```ts
import { getTheme, getSiteSettings } from './settings';

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
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/lib/email.test.ts`
Expected: all tests pass (10 total at this point).

- [ ] **Step 9: Commit**

```bash
git add src/lib/email.ts src/lib/email.test.ts
git commit -m "Add email config reader and themed HTML wrapper"
```

---

## Task 5: Email module — `sendMail` with mocked transport

**Files:**
- Modify: `src/lib/email.ts`
- Modify: `src/lib/email.test.ts`

- [ ] **Step 1: Write failing tests for `sendMail`**

Append to `src/lib/email.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/email.test.ts`
Expected: the `sendMail` describe block FAILs (function not exported).

- [ ] **Step 3: Implement `sendMail`**

Append to `src/lib/email.ts`:

```ts
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
```

(The test file you already wrote in Step 1 imports `_resetEmailTransportForTests` and calls it in `beforeEach` — it only compiles now that the export exists.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/email.test.ts`
Expected: all tests pass (14 total).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email.ts src/lib/email.test.ts
git commit -m "Add sendMail with pooled nodemailer transport"
```

---

## Task 6: Email module — `sendRsvpConfirmation`

**Files:**
- Modify: `src/lib/email.ts`
- Modify: `src/lib/email.test.ts`

- [ ] **Step 1: Write failing tests for `sendRsvpConfirmation`**

Append to `src/lib/email.test.ts`. We mock `sendMail` indirectly by spying on the module's nodemailer transport (already set up in Task 5's beforeEach pattern), and assert on the captured envelope.

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/email.test.ts`
Expected: the `sendRsvpConfirmation` block FAILs.

- [ ] **Step 3: Implement `sendRsvpConfirmation`**

Append to `src/lib/email.ts`:

```ts
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
  attendingGuests: string[] | null;
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
  lines.push(`Hi ${args.householdName},`);
  lines.push('');
  lines.push("Thanks for your RSVP! Here's what we got:");
  lines.push('');
  lines.push(`  Attending: ${args.attending === 'yes' ? 'Yes' : 'No'}`);

  if (args.attending === 'yes' && args.guestCount > 0) {
    lines.push(`  Guests: ${args.guestCount}`);
    if (args.attendingGuests && args.attendingGuests.length) {
      for (const name of args.attendingGuests) {
        const meal = args.guestMeals?.[name];
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
  invitation: Invitation,
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

  const body = buildRsvpRecapBody({
    householdName: invitation.householdName,
    attending: response.attending,
    guestCount: response.guestCount,
    attendingGuests: safeJsonParse<string[] | null>(response.attendingGuests, null),
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/email.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email.ts src/lib/email.test.ts
git commit -m "Add sendRsvpConfirmation with recap body"
```

---

## Task 7: Broadcasts service module

**Files:**
- Create: `src/lib/broadcasts.ts`
- Create: `src/lib/broadcasts.test.ts`

This module wraps the broadcast send logic so the route handler stays thin and the logic is testable with mocked prisma + mocked email.

- [ ] **Step 1: Write failing tests for `sendBroadcast`**

Create `src/lib/broadcasts.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendBroadcast } from './broadcasts';
import prisma from './prisma';
import * as emailModule from './email';

describe('sendBroadcast', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(prisma.setting, 'findMany').mockResolvedValue([
      { id: '1', key: 'site.coupleName1', value: 'Joe' },
      { id: '2', key: 'site.coupleName2', value: 'Alex' },
      { id: '3', key: 'site.replyToEmail', value: 'couple@example.com' },
    ] as any);
  });

  it('returns 0 / 0 and creates no Broadcast row when no recipients have contactEmail', async () => {
    vi.spyOn(prisma.invitation, 'findMany').mockResolvedValue([] as any);
    const createSpy = vi.spyOn(prisma.broadcast, 'create');
    const result = await sendBroadcast({ subject: 's', body: 'b' });
    expect(result).toEqual({ ok: false, error: 'No recipients opted in' });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('creates one BroadcastDelivery per recipient on success', async () => {
    vi.spyOn(prisma.invitation, 'findMany').mockResolvedValue([
      { id: 'inv-1', householdName: 'A', contactEmail: 'a@test' },
      { id: 'inv-2', householdName: 'B', contactEmail: 'b@test' },
    ] as any);
    const broadcastCreate = vi.spyOn(prisma.broadcast, 'create').mockResolvedValue({ id: 'bc-1' } as any);
    const deliveryCreate = vi.spyOn(prisma.broadcastDelivery, 'create').mockResolvedValue({} as any);
    const sendSpy = vi.spyOn(emailModule, 'sendMail').mockResolvedValue({ ok: true });

    const result = await sendBroadcast({ subject: 'Test', body: 'Hi' });
    expect(result).toEqual({ ok: true, broadcastId: 'bc-1', sent: 2, failed: 0 });
    expect(broadcastCreate).toHaveBeenCalledOnce();
    expect(broadcastCreate.mock.calls[0][0].data.recipientCount).toBe(2);
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(deliveryCreate).toHaveBeenCalledTimes(2);
    const statuses = deliveryCreate.mock.calls.map((c) => (c[0] as any).data.status);
    expect(statuses).toEqual(['sent', 'sent']);
  });

  it('records per-recipient failure without aborting the loop', async () => {
    vi.spyOn(prisma.invitation, 'findMany').mockResolvedValue([
      { id: 'inv-1', householdName: 'A', contactEmail: 'a@test' },
      { id: 'inv-2', householdName: 'B', contactEmail: 'b@test' },
      { id: 'inv-3', householdName: 'C', contactEmail: 'c@test' },
    ] as any);
    vi.spyOn(prisma.broadcast, 'create').mockResolvedValue({ id: 'bc-1' } as any);
    const deliveryCreate = vi.spyOn(prisma.broadcastDelivery, 'create').mockResolvedValue({} as any);
    vi.spyOn(emailModule, 'sendMail')
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'bounced' })
      .mockResolvedValueOnce({ ok: true });

    const result = await sendBroadcast({ subject: 's', body: 'b' });
    expect(result).toEqual({ ok: true, broadcastId: 'bc-1', sent: 2, failed: 1 });
    const statuses = deliveryCreate.mock.calls.map((c) => (c[0] as any).data.status);
    const errors = deliveryCreate.mock.calls.map((c) => (c[0] as any).data.errorMessage);
    expect(statuses).toEqual(['sent', 'failed', 'sent']);
    expect(errors[1]).toBe('bounced');
  });

  it('snapshots the email address into BroadcastDelivery.emailAddress', async () => {
    vi.spyOn(prisma.invitation, 'findMany').mockResolvedValue([
      { id: 'inv-1', householdName: 'A', contactEmail: 'a@test' },
    ] as any);
    vi.spyOn(prisma.broadcast, 'create').mockResolvedValue({ id: 'bc-1' } as any);
    const deliveryCreate = vi.spyOn(prisma.broadcastDelivery, 'create').mockResolvedValue({} as any);
    vi.spyOn(emailModule, 'sendMail').mockResolvedValue({ ok: true });

    await sendBroadcast({ subject: 's', body: 'b' });
    expect((deliveryCreate.mock.calls[0][0] as any).data.emailAddress).toBe('a@test');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/broadcasts.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `sendBroadcast`**

Create `src/lib/broadcasts.ts`:

```ts
import prisma from './prisma';
import { sendMail } from './email';
import { getSiteSettings } from './settings';

export type SendBroadcastResult =
  | { ok: true; broadcastId: string; sent: number; failed: number }
  | { ok: false; error: string };

export async function sendBroadcast(args: { subject: string; body: string }): Promise<SendBroadcastResult> {
  const recipients = await prisma.invitation.findMany({
    where: { contactEmail: { not: null } },
    select: { id: true, householdName: true, contactEmail: true },
  });
  if (recipients.length === 0) return { ok: false, error: 'No recipients opted in' };

  const site = await getSiteSettings();
  const fromName = `${site.coupleName1} & ${site.coupleName2}`;
  const replyTo = site.replyToEmail || undefined;

  const broadcast = await prisma.broadcast.create({
    data: {
      subject: args.subject,
      body: args.body,
      sentBy: 'admin',
      recipientCount: recipients.length,
    },
  });

  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    const email = r.contactEmail!;
    const result = await sendMail({
      to: email,
      subject: args.subject,
      body: args.body,
      fromName,
      replyTo,
    });
    await prisma.broadcastDelivery.create({
      data: {
        broadcastId: broadcast.id,
        invitationId: r.id,
        emailAddress: email,
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.ok ? null : result.error,
      },
    });
    if (result.ok) sent++; else failed++;
  }

  return { ok: true, broadcastId: broadcast.id, sent, failed };
}

export async function listBroadcasts() {
  return prisma.broadcast.findMany({
    orderBy: { sentAt: 'desc' },
    include: {
      deliveries: { select: { status: true } },
    },
  });
}

export async function getBroadcast(id: string) {
  return prisma.broadcast.findUnique({
    where: { id },
    include: {
      deliveries: {
        include: { invitation: { select: { householdName: true } } },
        orderBy: { sentAt: 'asc' },
      },
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/broadcasts.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/broadcasts.ts src/lib/broadcasts.test.ts
git commit -m "Add broadcasts service module"
```

---

## Task 8: Email Settings — admin API routes

**Files:**
- Create: `src/app/api/email-settings/status/route.ts`
- Create: `src/app/api/email-settings/test/route.ts`

- [ ] **Step 1: Create the status endpoint**

Create `src/app/api/email-settings/status/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getEmailConfig } from '@/lib/email';

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(getEmailConfig());
}
```

- [ ] **Step 2: Create the test-send endpoint**

Create `src/app/api/email-settings/test/route.ts`:

```ts
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
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/email-settings
git commit -m "Add email-settings API routes (status + test send)"
```

---

## Task 9: Email Settings — admin page

**Files:**
- Create: `src/app/admin/(authenticated)/email-settings/page.tsx`

Match the visual style of an existing admin page (e.g., `src/app/admin/(authenticated)/settings/page.tsx`). Use the same UI primitives (`Card`, `Button`, `Input`).

- [ ] **Step 1: Implement the page**

Create `src/app/admin/(authenticated)/email-settings/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface EmailStatus {
  configured: boolean;
  host?: string;
  port?: string;
  user?: string;
  from?: string;
  publicSiteUrl?: string;
}

export default function EmailSettingsPage() {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [replyTo, setReplyTo] = useState('');
  const [savingReply, setSavingReply] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [statusRes, settingsRes] = await Promise.all([
        fetch('/api/email-settings/status'),
        fetch('/api/settings'),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setReplyTo(s.replyToEmail || '');
      }
    })();
  }, []);

  const saveReplyTo = async () => {
    setSavingReply(true);
    setReplyMessage('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyToEmail: replyTo.trim() }),
      });
      setReplyMessage(res.ok ? 'Saved' : 'Save failed');
    } finally {
      setSavingReply(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/email-settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const data = await res.json();
      if (res.ok) setTestResult({ ok: true, message: 'Test email sent — check your inbox' });
      else setTestResult({ ok: false, message: data.error || 'Send failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Email Settings</h1>

      <Card>
        <CardHeader><CardTitle>SMTP configuration</CardTitle></CardHeader>
        <CardContent>
          {status ? (
            <div className="space-y-1 text-sm">
              <p>Status: {status.configured ? '✅ Configured' : '❌ Not configured — set SMTP_* env vars in your container'}</p>
              <p>Host: <span className="font-mono">{status.host || '—'}</span></p>
              <p>Port: <span className="font-mono">{status.port || '—'}</span></p>
              <p>User: <span className="font-mono">{status.user || '—'}</span></p>
              <p>From: <span className="font-mono">{status.from || '—'}</span></p>
              <p>Password: <span className="font-mono">••••••••</span> <span className="text-xs text-gray-500">(always masked)</span></p>
              <p>Public site URL: <span className="font-mono">{status.publicSiteUrl || '—'}</span> {!status.publicSiteUrl && <span className="text-red-600 text-xs">(required for RSVP confirmation magic links)</span>}</p>
            </div>
          ) : <p className="text-sm text-gray-500">Loading…</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Reply-to address</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">Where guest replies to your wedding emails will land.</p>
          <Input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="couple@example.com" />
          <div className="flex items-center gap-3">
            <Button onClick={saveReplyTo} disabled={savingReply}>{savingReply ? 'Saving…' : 'Save'}</Button>
            {replyMessage && <span className="text-sm">{replyMessage}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Send a test email</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">Verify your SMTP setup before relying on it. The test email uses the same themed wrapper as broadcasts and confirmations.</p>
          <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
          <div className="flex items-center gap-3">
            <Button onClick={sendTest} disabled={testing || !status?.configured || !testTo.trim()}>{testing ? 'Sending…' : 'Send test'}</Button>
            {testResult && <span className={`text-sm ${testResult.ok ? 'text-green-700' : 'text-red-700'}`}>{testResult.message}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `Card` / `CardHeader` import paths differ, adjust to match other admin pages.)

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/\(authenticated\)/email-settings
git commit -m "Add Email Settings admin page"
```

---

## Task 10: Broadcasts API + admin page

**Files:**
- Create: `src/app/api/broadcasts/route.ts`
- Create: `src/app/api/broadcasts/[id]/route.ts`
- Create: `src/app/admin/(authenticated)/broadcasts/page.tsx`

- [ ] **Step 1: Create the broadcast API routes**

Create `src/app/api/broadcasts/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getFeatures } from '@/lib/settings';
import { listBroadcasts, sendBroadcast } from '@/lib/broadcasts';

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const features = await getFeatures();
  if (!features.dayOfBroadcasts) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const broadcasts = await listBroadcasts();
  return NextResponse.json(broadcasts.map((b) => ({
    id: b.id,
    subject: b.subject,
    sentAt: b.sentAt,
    recipientCount: b.recipientCount,
    sentCount: b.deliveries.filter((d) => d.status === 'sent').length,
    failedCount: b.deliveries.filter((d) => d.status === 'failed').length,
  })));
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const features = await getFeatures();
  if (!features.dayOfBroadcasts) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { subject, body } = await request.json();
  if (typeof subject !== 'string' || !subject.trim() || typeof body !== 'string' || !body.trim()) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 });
  }
  const result = await sendBroadcast({ subject: subject.trim(), body: body.trim() });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
```

Create `src/app/api/broadcasts/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getBroadcast } from '@/lib/broadcasts';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const broadcast = await getBroadcast(params.id);
  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(broadcast);
}
```

- [ ] **Step 2: Create the admin page**

Create `src/app/admin/(authenticated)/broadcasts/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface BroadcastSummary {
  id: string;
  subject: string;
  sentAt: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
}

interface BroadcastDetail {
  id: string;
  subject: string;
  body: string;
  sentAt: string;
  deliveries: Array<{
    id: string;
    emailAddress: string;
    status: string;
    errorMessage: string | null;
    invitation: { householdName: string };
  }>;
}

export default function BroadcastsPage() {
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);
  const [history, setHistory] = useState<BroadcastSummary[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<BroadcastDetail | null>(null);

  const refresh = async () => {
    const [statusRes, recipientsRes, historyRes] = await Promise.all([
      fetch('/api/email-settings/status'),
      fetch('/api/invitations?contactEmailOnly=true'), // see step 3 note
      fetch('/api/broadcasts'),
    ]);
    if (statusRes.ok) setSmtpConfigured((await statusRes.json()).configured);
    if (recipientsRes.ok) {
      const list = await recipientsRes.json();
      setRecipientCount(Array.isArray(list) ? list.filter((i: any) => i.contactEmail).length : 0);
    }
    if (historyRes.ok) setHistory(await historyRes.json());
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!expanded) { setDetail(null); return; }
    fetch(`/api/broadcasts/${expanded}`).then((r) => r.ok ? r.json() : null).then(setDetail);
  }, [expanded]);

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Send failed');
        return;
      }
      setSubject('');
      setBody('');
      setConfirming(false);
      await refresh();
    } finally {
      setSending(false);
    }
  };

  const canSend = smtpConfigured && recipientCount > 0 && subject.trim() && body.trim();

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Broadcasts</h1>

      <Card>
        <CardHeader><CardTitle>Compose</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!smtpConfigured && <p className="text-sm text-red-700">SMTP is not configured — see Email Settings.</p>}
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea placeholder="Message body (plain text)" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="text-sm text-gray-600">Will send to {recipientCount} invitation{recipientCount === 1 ? '' : 's'} with a contact email on file.</p>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button disabled={!canSend} onClick={() => setConfirming(true)}>Send broadcast</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">No broadcasts sent yet.</p>
          ) : (
            <ul className="divide-y">
              {history.map((b) => (
                <li key={b.id} className="py-3">
                  <button className="text-left w-full" onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{b.subject}</span>
                      <span className="text-xs text-gray-500">{new Date(b.sentAt).toLocaleString()}</span>
                    </div>
                    <div className="text-sm">
                      {b.failedCount > 0
                        ? <span className="text-red-700">{b.sentCount} delivered, {b.failedCount} failed</span>
                        : <span>{b.sentCount} of {b.recipientCount} delivered</span>}
                    </div>
                  </button>
                  {expanded === b.id && detail && (
                    <div className="mt-3 pl-4 border-l-2 border-gray-200 space-y-3">
                      <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">{detail.body}</pre>
                      <table className="text-sm w-full">
                        <thead><tr className="text-left text-gray-500"><th>Household</th><th>Email</th><th>Status</th><th>Error</th></tr></thead>
                        <tbody>
                          {detail.deliveries.map((d) => (
                            <tr key={d.id} className="border-t">
                              <td>{d.invitation.householdName}</td>
                              <td className="font-mono text-xs">{d.emailAddress}</td>
                              <td className={d.status === 'failed' ? 'text-red-700' : ''}>{d.status}</td>
                              <td className="text-xs text-red-700">{d.errorMessage || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {confirming && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={() => setConfirming(false)}>
          <Card className="max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader><CardTitle>Send broadcast?</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">This will send to {recipientCount} recipient{recipientCount === 1 ? '' : 's'}. Sending may take up to a minute.</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
                <Button onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify recipient-count source**

The composer needs the count of invitations with `contactEmail` set. The page above fetches `/api/invitations` and filters client-side. Verify the existing `/api/invitations` endpoint returns `contactEmail` in its response (it should, since it returns the full Invitation row). If it doesn't, add a small dedicated endpoint `/api/broadcasts/recipient-count` that returns `{ count: number }`. Use whichever requires the least change.

Run: `grep -n "invitations" src/app/api/invitations/route.ts` to inspect what's returned.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/broadcasts src/app/admin/\(authenticated\)/broadcasts
git commit -m "Add Broadcasts admin page and API"
```

---

## Task 11: AdminNav additions

**Files:**
- Modify: `src/components/admin/AdminNav.tsx`

- [ ] **Step 1: Add Email Settings to the System group**

In the `navGroups` array, find the `System` group entry. Add the new item before the existing `Features` entry (or wherever it reads naturally) — gate it so it appears when **either** email feature is on. Since the existing `feature` prop only takes a single string, we'll use `dayOfBroadcasts` as the gate; the page is still accessible via direct URL when only confirmations are on, but the sidebar entry shows when broadcasts are enabled. (For "either flag" gating, see Step 2.)

Actually, to support either-flag gating cleanly, extend the `NavItem` interface and `isItemVisible`:

```ts
interface NavItem {
  href: string;
  label: string;
  icon: string;
  feature?: string;
  // OR-list of feature flags; if any are on, item is visible. Mutually
  // exclusive with `feature`.
  anyFeature?: string[];
}
```

In `isItemVisible`:

```ts
function isItemVisible(item: NavItem, features: Record<string, unknown>): boolean {
  if (item.anyFeature) {
    return item.anyFeature.some((f) => {
      const val = features[f];
      if (val === undefined || val === null) return true;
      if (typeof val === 'string') return val !== 'off';
      return !!val;
    });
  }
  if (!item.feature) return true;
  const val = features[item.feature];
  if (val === undefined || val === null) return true;
  if (typeof val === 'string') return val !== 'off';
  return !!val;
}
```

Then add the Email Settings item:

```ts
{ href: '/admin/email-settings', label: 'Email Settings', icon: '✉️', anyFeature: ['rsvpConfirmationEmails', 'dayOfBroadcasts'] },
```

- [ ] **Step 2: Add Broadcasts to the Day Of group**

In the `Day Of` group, append:

```ts
{ href: '/admin/broadcasts', label: 'Broadcasts', icon: '📣', feature: 'dayOfBroadcasts' },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AdminNav.tsx
git commit -m "Add Email Settings and Broadcasts to admin sidebar"
```

---

## Task 12: RSVP form + route — `contactEmail` integration

**Files:**
- Modify: `src/app/api/rsvp/route.ts`
- Modify: `src/app/(public)/rsvp/page.tsx`

- [ ] **Step 1: Update the RSVP route to accept `contactEmail`**

In `src/app/api/rsvp/route.ts`:

In the `GET` handler, add `rsvpConfirmationEmails` and `dayOfBroadcasts` to the `features` block in the response so the form knows whether to show the input:

```ts
features: {
  perGuestSelection: features.perGuestSelection,
  songRequests: features.songRequests,
  dietaryNotes: features.dietaryNotes,
  rsvpAddress: features.rsvpAddress,
  rsvpConfirmationEmails: features.rsvpConfirmationEmails,
  dayOfBroadcasts: features.dayOfBroadcasts,
},
```

In the `POST` handler, destructure `contactEmail` from the body:

```ts
const { code, attending, guestCount, responses, guestMeals, message, attendingGuests, plusOnes, songRequests, dietaryNotes, address, contactEmail } = await request.json();
```

After the existing `address` persistence block (around line 58), add:

```ts
// Persist contactEmail on the invitation. Empty string clears the opt-in.
if (typeof contactEmail === 'string') {
  const trimmed = contactEmail.trim();
  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { contactEmail: trimmed || null },
  });
}
```

After the response is created/updated (both branches), but before returning, fire the confirmation email:

```ts
// Fire-and-forget RSVP confirmation. Errors are logged, not surfaced —
// the guest's RSVP succeeded regardless.
const featuresForEmail = await getFeatures();
if (featuresForEmail.rsvpConfirmationEmails && getEmailConfig().configured) {
  // Reload the invitation to pick up the just-saved contactEmail.
  const fresh = await prisma.invitation.findUnique({ where: { id: invitation.id } });
  if (fresh?.contactEmail) {
    sendRsvpConfirmation(fresh, response, { isUpdate: !!existing })
      .catch((err) => console.error('RSVP confirmation send failed:', err));
  }
}
```

Add the imports at the top:

```ts
import { getFeatures } from '@/lib/settings';
import { getEmailConfig, sendRsvpConfirmation } from '@/lib/email';
```

(Note: `getFeatures` is already imported on the existing route — verify and don't double-import.)

- [ ] **Step 2: Update the RSVP form to render the contactEmail input**

In `src/app/(public)/rsvp/page.tsx`:

Add state for `contactEmail`:

```tsx
const [contactEmail, setContactEmail] = useState('');
```

In the existing `lookupInvitation` handler (around line 47 where address is initialized), add:

```ts
setContactEmail(data.invitation.contactEmail || '');
```

Find the form section where `address` is rendered (search for "address" in the JSX). Render the new input next to it, only when one of the email flags is on:

```tsx
{(features.rsvpConfirmationEmails || features.dayOfBroadcasts) && (
  <div className="mt-4">
    <label className="block text-sm font-medium mb-1">Stay in the loop (optional)</label>
    <p className="text-xs text-gray-600 mb-2">
      Want emails from us about your RSVP and day-of updates (ceremony timing, shuttle delays, etc.)?
      Drop an email here. Leave it blank if you'd rather not hear from us.
    </p>
    <Input
      type="email"
      value={contactEmail}
      onChange={(e) => setContactEmail(e.target.value)}
      placeholder="you@example.com"
    />
  </div>
)}
```

In the submit handler (the function that POSTs to `/api/rsvp`), include `contactEmail` in the body:

```ts
body: JSON.stringify({
  // ...existing fields,
  contactEmail,
}),
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/rsvp/route.ts src/app/\(public\)/rsvp/page.tsx
git commit -m "Wire contactEmail through RSVP form + route + confirmation send"
```

---

## Task 13: Final verification

**Files:** none modified — this is a verification pass.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server: `npm run dev`

Walk through the spec's smoke-test checklist (transcribed here for the engineer's convenience):

1. Set SMTP env vars locally — Mailtrap or any SMTP sandbox is fine; Gmail app password also works. Set `PUBLIC_SITE_URL` to your local URL (e.g., `http://localhost:3000`).
2. Verify the schema is applied: `npx prisma db push` should report "in sync."
3. At `/admin/features`, flip both `rsvpConfirmationEmails` and `dayOfBroadcasts` on.
4. At `/admin/email-settings`: verify SMTP status shows ✅. Save a reply-to address. Send a test email to yourself. Check it arrives, the From-name is "{couple1} & {couple2}", the Reply-To is what you set, and the themed wrapper renders with site colors and fonts. Verify in at least Gmail web + iOS Mail (real-world variance test); Outlook welcome but not required.
5. RSVP through the public form at `/rsvp?code={any-existing-invitation-code}`. Fill `contactEmail`. Submit. Confirm: the confirmation email arrives, the recap matches what you submitted, the magic link works.
6. Edit the RSVP through the magic link. Confirm: a second email arrives with "RSVP updated" subject and refreshed recap.
7. At `/admin/broadcasts`: compose a message, send it. Confirm: delivery log row appears in History, expanded view shows the per-recipient breakdown, the actual email arrives with the themed wrapper.
8. Force a broadcast failure: edit a test invitation's `contactEmail` (via admin or direct DB) to a known-invalid address (e.g., `not-a-real-domain-7y3hg9.invalid@example.com`). Re-send the broadcast. Verify the failure shows in the per-recipient table with an error message in red.

- [ ] **Step 4: If smoke test passes, mark plan complete**

There's nothing more to commit at this stage — all the changes are already in. The next thing the user (Andrew) will do separately is bump the Docker image version (`./scripts/docker.sh bump-minor`) and update their actual `docker-compose.yml` to include the new SMTP + `PUBLIC_SITE_URL` env vars (the example file in the repo already shows the shape).

---

## Notes on test scope

The route handlers themselves (`/api/broadcasts`, `/api/rsvp`) are not unit-tested — instead, the logic they wrap is tested in `src/lib/broadcasts.ts` and `src/lib/email.ts`. The route handlers are ~10 lines of glue: parse the request, call the service, return the response. This mirrors the existing project pattern (no test files exist for any route in `src/app/api/`). If route-level integration tests become valuable later, an in-memory SQLite test setup with a fresh prisma client per test would be the natural extension — out of scope for this plan.

The RSVP route's confirmation-send hook is also not unit-tested directly; it's verified via the manual smoke test in Task 13. The risk is small (the hook is two lines wrapping a function that is itself thoroughly tested) and the cost of integration-testing the route would be disproportionate.
