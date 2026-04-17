# Email features — RSVP confirmations + day-of broadcasts — design

## Goal

Two related email features sharing one infrastructure layer:

1. **RSVP confirmation emails** — sent automatically to the guest after every RSVP submission (initial or edit), with a recap of what they submitted and a magic link to update before the deadline.
2. **Day-of broadcasts** — let the couple send timely email updates to invitations that opted in — "ceremony in 15," "shuttle delayed," "weather pivot — bring layers."

Both use the same opt-in (one optional contact email per invitation, guest-supplied at RSVP time), the same SMTP transport, and the same themed HTML wrapper.

## Non-goals (V1)

- SMS / push notifications. Email only.
- Two-way messaging. Outbound only; replies route to the couple's inbox via `Reply-To`.
- Saved broadcast templates, scheduled sends, retry-failures button. Most weddings author 2–3 broadcasts total and want to send them ad-hoc.
- Targeting filters on broadcasts (by sub-event, by attending status). Sends go to "everyone with a `contactEmail` on file." Filling that field is the opt-in signal.
- Generic transactional email layer for other features (save-the-dates, etc.). The two features in this spec get a small dedicated module; YAGNI on broader generalization.
- One-click unsubscribe link. The existing RSVP magic link doubles as edit/unsub: guest revisits `/rsvp?code=...`, clears the field, resubmits.
- Configurable RSVP confirmation copy. The template is generated from a fixed format using site settings; if a couple wants to edit the wording, that's a future enhancement.
- Embedding custom-uploaded fonts in emails. Email clients can't reliably load arbitrary `@font-face` declarations; we declare the configured font with sensible system fallbacks and accept that some clients will fall back.

## Schema

All changes additive — `npx prisma db push` is safe on existing prod DBs.

### `Invitation` — add one field

```prisma
contactEmail String?  // guest-supplied email for RSVP confirmations + day-of
                      // updates; distinct from the admin-managed `email` column
```

`Invitation.email` (already exists) stays as the couple's internal contact / chase-list field — admin-managed, never written to from the public site. `contactEmail` is a separate channel, owned by the guest, supplied on the RSVP form. Filling it = opt-in. Clearing it = opt-out (no more confirmations or broadcasts).

### `Broadcast` — new model

```prisma
model Broadcast {
  id             String              @id @default(uuid())
  subject        String
  body           String              // plain text — composer is plain-text; the themed HTML wrapper is applied at send time
  sentAt         DateTime            @default(now())
  sentBy         String              // "admin" for now; future-proof for multi-admin
  recipientCount Int                 // denormalized — count at send time
  deliveries     BroadcastDelivery[]
}
```

### `BroadcastDelivery` — new model, one row per (broadcast × invitation)

```prisma
model BroadcastDelivery {
  id           String     @id @default(uuid())
  broadcastId  String
  broadcast    Broadcast  @relation(fields: [broadcastId], references: [id], onDelete: Cascade)
  invitationId String
  invitation   Invitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)
  emailAddress String     // snapshot at send time — if the guest later changes their contactEmail, the historical record stays accurate
  status       String     // "sent" | "failed"
  errorMessage String?
  sentAt       DateTime   @default(now())

  @@index([broadcastId])
  @@unique([broadcastId, invitationId])
}
```

### `SiteSettings` — add one field

```ts
replyToEmail: string;  // where guest replies land; defaults to '' (falls back to SMTP_FROM)
```

### `FeatureSettings` — add two flags

```ts
rsvpConfirmationEmails: boolean;  // default: false — auto-send confirmation on RSVP submit/edit
dayOfBroadcasts: boolean;         // default: false — admin Broadcasts page enabled
```

**Both default false.** This is a deliberate departure from the usual default-on convention for new feature flags. Both features require SMTP env vars to be configured by the deployer; defaulting them to off prevents broken admin pages or silent send failures on fresh installs that haven't wired up email yet. The flags are independent — couples can enable confirmations without broadcasts (or vice versa) depending on how chatty they want the system to be.

## Opt-in flow (guest-facing)

In `src/app/(public)/rsvp/page.tsx`, render one new optional input below the existing fields, gated by either feature flag being on (no point asking for the email if neither feature would use it):

> **Stay in the loop (optional)**
> Want emails from us about your RSVP and day-of updates (ceremony timing, shuttle delays, etc.)? Drop an email here. Leave it blank if you'd rather not hear from us.
>
> `[ email input ]`

Mechanics:

- One field per invitation, framed as "for the household."
- Pre-fills with the saved `contactEmail` if the guest is editing.
- Empty submission = no opt-in (or removes existing opt-in).
- Validates as email format if non-empty; no validation if empty.
- The `/api/rsvp` POST/PUT handler accepts `contactEmail` in the body, trims it, and stores `null` for empty string.

No separate consent checkbox — the act of filling the field is the consent. Wording on the form makes the dual purpose explicit so guests know what they're signing up for.

## RSVP confirmation flow

After the RSVP submit route saves the `RsvpResponse` row (and writes the `RsvpChangeLog` audit row), if all three of these are true:

- `rsvpConfirmationEmails` flag is on
- SMTP is configured (env vars present)
- `Invitation.contactEmail` is non-null

…then the route fires `sendRsvpConfirmation(invitation, response, { isUpdate })` **fire-and-forget**: the response returns to the guest immediately, and the email send happens in the background. The guest doesn't wait on SMTP latency to see their submit succeed.

`isUpdate` is true if the route was an edit (an existing `RsvpResponse` was overwritten), false on first submission. Drives the subject:

- First submission: `RSVP confirmed — {coupleName1} & {coupleName2}'s wedding`
- Edit: `RSVP updated — {coupleName1} & {coupleName2}'s wedding`

**Body recap** (plain-text version; the themed HTML wrapper is applied separately):

```
Hi {householdName},

Thanks for your RSVP! Here's what we got:

  Attending: {Yes / No}
  {if attending and guestCount > 0:}
  Guests: {guestCount}
  {if per-guest selection on, list of attending guest names}
  {if plus-ones provided, list those}
  {if meal selections present, list per-person meals}

{if dietaryNotes present:}
Dietary notes: {dietaryNotes}

{if songRequests present:}
Song requests: {songRequests}

{if message present:}
Your message: {message}

Need to make a change before {rsvpDeadline-formatted}? Update your RSVP here:
{PUBLIC_SITE_URL}/rsvp?code={invitation.code}

Looking forward to it!
{coupleName1} & {coupleName2}
```

The recap is generated dynamically from the saved `RsvpResponse`, so it always reflects what's currently on file. Sections are conditionally included based on what the guest actually filled in (no empty "Dietary notes:" line if they didn't add any).

**Errors**: if the send fails, the failure is logged to the server console only. There's no DB log of confirmation sends in V1 — the `RsvpChangeLog` already records that the RSVP itself happened, and a missed confirmation isn't worth its own audit table for a one-time event. The guest's submit succeeds regardless.

## Admin UI

### `/admin/email-settings` — System group

Single-screen config + verification page.

- **Status block**: "SMTP configured: ✅ / ❌" computed from env presence. Lists the env vars expected (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `PUBLIC_SITE_URL`). Shows masked values for present ones (`SMTP_PASS` always fully masked).
- **Reply-to email**: editable input bound to `SiteSettings.replyToEmail`. Help text: "Where guest replies to your emails will land."
- **Send test email**: input for an arbitrary recipient address + "Send test" button. POSTs to a server route that builds a hello-world message (using the themed HTML wrapper, so the user can preview their styling before going live) and sends through the configured SMTP. Surfaces the SMTP response (success or transport error) inline. Does NOT create `Broadcast` / `BroadcastDelivery` rows — purely diagnostic.

### `/admin/broadcasts` — Day Of group

Composer on top, history list below. Single page, no sub-routes.

**Composer card**:
- Subject input.
- Body textarea (plain text — the themed HTML wrapper is applied at send time).
- Live recipient summary: "Will send to N invitations who opted in."
- "Send broadcast" button → confirm modal ("Send to N recipients?") → POSTs to `/api/broadcasts`.
- Disabled with inline reason if SMTP isn't configured or recipient count is 0.

**History list** (most recent first):
- Each row: subject, sent timestamp, "X of N delivered" (or "X delivered, Y failed" in red).
- Expand to show full body + per-recipient table (household name, email address as sent, status, error message if any).
- Broadcasts are immutable historical events — no edit / no resend / no delete in V1.

### Sidebar additions

In `src/components/admin/AdminNav.tsx`:
- Add `Email Settings` to the existing System group, gated by **either** `rsvpConfirmationEmails` OR `dayOfBroadcasts` being on (the page is useful as soon as any email feature is enabled).
- Add `Broadcasts` to the existing Day Of group, gated by `dayOfBroadcasts`.

## Send pipeline & themed rendering

### `src/lib/email.ts` — new module

Wraps `nodemailer` (de-facto Node SMTP library, well-maintained). Singleton transport built from env on first use, with `pool: true, maxConnections: 1` so the TLS handshake is amortized across consecutive sends instead of repeated per message.

Exports:

- `getEmailConfig()` — returns `{ configured: boolean, host?, port?, user?, from?, publicSiteUrl? }` for the settings page. Never returns the password value.
- `sendMail({ to, subject, body, replyTo, fromName })` — sends ONE message. Internally:
  1. Calls `renderThemedEmailHtml(body)` to build the HTML version.
  2. Sends multipart/alternative with both the themed HTML AND the original plain-text `body` as the fallback part.
  3. Returns `{ ok: true } | { ok: false, error: string }`. Caller decides what to do with failures.
- `renderThemedEmailHtml(plainBody)` — internal helper:
  1. Loads `ThemeSettings` (colors + font names) and `SiteSettings` (couple names) at render time.
  2. Converts plain-text body: HTML-escape, `\n` → `<br>`, autolink bare URLs.
  3. Wraps in a table-based layout with all CSS inlined (the only thing email clients reliably support):
     - Header: couple names in `headingFont` (with `Georgia, serif` fallback) and `primaryColor`.
     - Body: converted text in `bodyFont` (with `Helvetica, Arial, sans-serif` fallback) and `foregroundColor`, on `backgroundColor`.
     - Hairline dividers in `secondaryColor`. Footer: small "Sent from the {couple} wedding site" in muted text.
  4. Returns the full HTML string.
- `sendRsvpConfirmation(invitation, response, { isUpdate })` — generates the subject + recap body described above, then calls `sendMail`. Reads `PUBLIC_SITE_URL` to construct the magic link.

### `POST /api/broadcasts` — broadcast send route

1. Auth check (admin session — same middleware as other admin routes).
2. Feature-flag guard. If `dayOfBroadcasts` is off, return 404.
3. Validate request body (subject + body non-empty).
4. Load all `Invitation` rows where `contactEmail IS NOT NULL`. If zero, return 400 (`{ error: "No recipients opted in" }`).
5. Create the `Broadcast` row first (subject, body, `sentBy: "admin"`, `recipientCount`). Get the ID.
6. Loop recipients **sequentially**. For each:
   - Call `sendMail`.
   - Insert a `BroadcastDelivery` row with snapshotted `emailAddress`, `status`, and any `errorMessage`.
7. Return summary `{ broadcastId, sent, failed }`.

Sequential is intentional: ~150 invitations is the expected scale for this deployment. With pooling, total wall-clock time is well under a minute on Gmail SMTP. The admin sees a loading state with explicit "Sending — this may take up to a minute" copy while the request completes; no background job infrastructure needed for V1. If a future deployment hits scales where this becomes painful, the next step is a background queue (out of scope here).

### Failure semantics

- Per-recipient `sendMail` failure (broadcast): caught, recorded as `status: "failed"` with the error message, loop continues. Partial success is preserved.
- Transport meltdown (SMTP relay unreachable, auth rejected): caught at the route level. Mark all remaining recipients as `failed` with the transport error. Return 500. The `Broadcast` row stays in the DB so the admin sees what was attempted.
- The send route does NOT roll back the `Broadcast` row on any failure — the historical record is the point.
- RSVP confirmation send failure: logged to server console, not surfaced to the guest. The RSVP itself was already saved successfully.

### From / Reply-To assembly

- **From header**: `"{coupleName1} & {coupleName2} <{SMTP_FROM}>"`. Display name from Site Settings; envelope address from env. So the email shows as "Joe & Alex" but routes from the configured sender.
- **Reply-To header**: `SiteSettings.replyToEmail` if set; falls back to `SMTP_FROM` if blank.

### Audit retention

No purge in V1. Wedding is one-off — keep everything forever.

## Deployment configuration

SMTP credentials and the public site URL live in container env vars (set via `docker-compose.yml` `environment:` block, alongside existing `ADMIN_PASSWORD` and `TZ`).

```yaml
environment:
  ADMIN_PASSWORD: ...
  TZ: ...
  SMTP_HOST: smtp.gmail.com
  SMTP_PORT: "587"
  SMTP_USER: you@gmail.com
  SMTP_PASS: <gmail-app-password>
  SMTP_FROM: you@gmail.com
  PUBLIC_SITE_URL: https://wedding.example.com
```

Gmail-specific: `SMTP_PASS` must be a 16-character app password (generated at <https://myaccount.google.com/apppasswords>, requires 2FA on the account). Regular account passwords won't work. Gmail SMTP daily limit is 500 recipients across all messages, well above wedding-scale.

`PUBLIC_SITE_URL` is the externally-reachable origin of the public site (no trailing slash) — used to construct the `?code=` magic link in RSVP confirmation emails. Required when `rsvpConfirmationEmails` is on; the email-settings page surfaces a warning if it's missing while the flag is enabled.

`docker-compose.example.yml` updated to include these as commented-out examples with the Gmail-specific notes above.

`.env.example` is **not** the right place for these — that file is for the bump-script's local Docker registry config, not runtime env. Keep these concerns separate.

## Testing

### Unit tests (`vitest`)

- `src/lib/email.ts`:
  - `getEmailConfig` returns `configured: false` when any required env var is missing.
  - Mask logic never returns the `SMTP_PASS` value.
  - `sendMail` calls the mocked transport with the expected envelope (`from`, `to`, `replyTo`, `subject`, `text`, `html`) — verifies multipart/alternative shape.
  - `renderThemedEmailHtml`:
    - Inlines configured colors and fonts in the output.
    - HTML-escapes user input (e.g., `<script>` in body becomes `&lt;script&gt;`).
    - Converts `\n` to `<br>`.
    - Autolinks bare URLs.
    - Falls back to system fonts in `font-family` declarations.
  - `sendRsvpConfirmation`:
    - Subject reflects `isUpdate` flag.
    - Body recap includes attending status + guest count + magic link + deadline.
    - Optional sections (dietary, songs, message) appear only when present.
    - Magic link uses `PUBLIC_SITE_URL` + invitation code.
- `POST /api/broadcasts`:
  - Happy path: creates `Broadcast` + N `BroadcastDelivery` rows with `status: "sent"`; summary counts match.
  - Partial-failure: one mocked send rejects → that delivery row is `failed` with the error; others succeed; summary `{ sent: N-1, failed: 1 }`.
  - Empty recipients: returns 400, no `Broadcast` row created.
  - Feature-flag off: returns 404.
- RSVP submit route:
  - `contactEmail: ""` normalizes to `null` in the DB.
  - `contactEmail: "guest@example.com"` persists.
  - All other RSVP fields unaffected.
  - Confirmation send is invoked with `isUpdate: false` on first submission, `isUpdate: true` on edit.
  - Confirmation send is NOT invoked when `rsvpConfirmationEmails` flag is off, when SMTP is unconfigured, or when `contactEmail` is null.
  - Confirmation send failure does NOT cause the RSVP route to return an error (fire-and-forget contract).

### Manual smoke test before shipping

1. Configure SMTP env vars locally (Mailtrap or any SMTP sandbox is fine; Gmail app password also works). Set `PUBLIC_SITE_URL` to your local URL.
2. `npx prisma db push` to apply schema.
3. Flip both `rsvpConfirmationEmails` and `dayOfBroadcasts` on at `/admin/features`.
4. Hit `/admin/email-settings`, send a test email to yourself. Verify: From-name renders as "Couple1 & Couple2", Reply-To routes to the couple's address, themed HTML wrapper renders with the configured colors and fonts (check on at least Gmail web + iOS Mail to see real-world variance — Outlook is welcome but not required).
5. RSVP through the public form, fill `contactEmail`, submit. Confirm: confirmation email arrives, recap matches what was submitted, magic link works.
6. Edit the RSVP through the magic link. Confirm: a second email arrives with "RSVP updated" subject and refreshed recap.
7. Hit `/admin/broadcasts`, compose a message, send. Verify delivery log row appears + email actually arrives + themed wrapper renders.
8. Force a broadcast failure: edit a test invitation's `contactEmail` to a known-bad address, re-send the broadcast, verify the partial-failure UI rendering and that the error message surfaces.

### CI guardrails (per CLAUDE.md)

- `npx tsc --noEmit`
- `npx vitest run`

## Rollout

- Schema is purely additive — `npx prisma db push` is safe on existing TrueNAS prod DB.
- Both feature flags default to `false`, so new admin pages stay hidden and confirmations don't auto-send on installs until explicitly enabled.
- Single Docker version bump after merge (`./scripts/docker.sh bump-minor`).
- Update `docker-compose.example.yml` with the new SMTP + `PUBLIC_SITE_URL` env-var examples in the same release.
