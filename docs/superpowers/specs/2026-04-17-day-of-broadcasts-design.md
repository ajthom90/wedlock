# Day-of Broadcasts — design

## Goal

Let the couple send timely email updates to attending guests on (or near) the wedding day — "ceremony in 15," "shuttle delayed," "weather pivot — bring layers." One contact email per **invitation** (not per guest), guest-supplied at RSVP time, completely optional.

## Non-goals (V1)

- SMS / push notifications. Email only.
- Two-way messaging. Outbound broadcasts only; replies route to the couple's inbox via `Reply-To`.
- Saved templates, scheduled sends, retry-failures button. All deferred — most weddings author 2–3 broadcasts total and want to send them ad-hoc.
- Targeting filters (by sub-event, by attending status). Send goes to "everyone with a `broadcastEmail` on file." Filling that field is the opt-in signal.
- Generic email-send infrastructure for other features (RSVP confirmations, save-the-dates). YAGNI; if those come later they can either piggyback on these tables or get their own simple flow.
- HTML composer. Plain-text body in V1.
- One-click unsubscribe link. The existing RSVP magic link doubles as edit/unsub: guest revisits `/rsvp?code=...`, clears the field, resubmits.

## Schema

All changes additive — `npx prisma db push` is safe on existing prod DBs.

### `Invitation` — add one field

```prisma
broadcastEmail String?  // guest-supplied email for day-of updates; distinct
                        // from the admin-managed `email` column
```

`Invitation.email` (already exists) stays as the couple's internal contact / chase-list field. `broadcastEmail` is a separate channel owned by the guest. Filling it = opt-in. Clearing it = opt-out.

### `Broadcast` — new model

```prisma
model Broadcast {
  id             String              @id @default(uuid())
  subject        String
  body           String              // plain text
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
  emailAddress String     // snapshot at send time — if the guest later changes their broadcastEmail, the historical record stays accurate
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

### `FeatureSettings` — add one flag

```ts
dayOfBroadcasts: boolean;  // default: false
```

**Note the default:** this is a deliberate departure from the usual default-on convention for new feature flags. The feature requires SMTP env vars to be configured by the deployer; defaulting it to off prevents broken admin pages from appearing on fresh installs that haven't wired up email yet.

## Opt-in flow (guest-facing)

In `src/app/(public)/rsvp/page.tsx`, render one new optional input below the existing fields, gated by the `dayOfBroadcasts` flag:

> **Day-of updates (optional)**
> Want emails about ceremony timing, shuttle delays, etc.? Drop an email here and we'll keep you in the loop the day of. Leave it blank if you'd rather not.
>
> `[ email input ]`

Mechanics:

- One field per invitation, framed as "for the household."
- Pre-fills with the saved `broadcastEmail` if the guest is editing.
- Empty submission = no opt-in (or removes existing opt-in).
- Validates as email format if non-empty; no validation if empty.
- The `/api/rsvp` POST/PUT handler accepts `broadcastEmail` in the body, trims it, and stores `null` for empty string.

No separate consent checkbox — the act of filling the field is the consent. Wording on the form makes the purpose explicit.

## Admin UI

### `/admin/email-settings` — System group

Single-screen config + verification page.

- **Status block**: "SMTP configured: ✅ / ❌" computed from env presence. Lists the env vars expected (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). Shows masked values for present ones (`SMTP_PASS` always fully masked).
- **Reply-to email**: editable input bound to `SiteSettings.replyToEmail`. Help text: "Where guest replies to your day-of broadcasts will land."
- **Send test email**: input for an arbitrary recipient address + "Send test" button. POSTs to a server route that builds a hello-world message and sends through the configured SMTP. Surfaces the SMTP response (success or transport error) inline. Does NOT create `Broadcast` / `BroadcastDelivery` rows — purely diagnostic.

### `/admin/broadcasts` — Day Of group

Composer on top, history list below. Single page, no sub-routes.

**Composer card**:
- Subject input.
- Body textarea (plain text).
- Live recipient summary: "Will send to N invitations who opted in."
- "Send broadcast" button → confirm modal ("Send to N recipients?") → POSTs to `/api/broadcasts`.
- Disabled with inline reason if SMTP isn't configured or recipient count is 0.

**History list** (most recent first):
- Each row: subject, sent timestamp, "X of N delivered" (or "X delivered, Y failed" in red).
- Expand to show full body + per-recipient table (household name, email address as sent, status, error message if any).
- Broadcasts are immutable historical events — no edit / no resend / no delete in V1.

### Sidebar additions

In `src/components/admin/AdminNav.tsx`:
- Add `Email Settings` to the existing System group.
- Add `Broadcasts` to the existing Day Of group.
- Both gated by the `dayOfBroadcasts` feature flag via the existing `feature` field filter.

## Send pipeline

### `src/lib/email.ts` — new module

Wraps `nodemailer` (de-facto Node SMTP library, well-maintained). Singleton transport built from env on first use.

- `getEmailConfig()` — returns `{ configured: boolean, host?, port?, user?, from? }` for the settings page. Never returns the password value.
- `sendMail({ to, subject, body, replyTo, fromName })` — sends one message. Returns `{ ok: true } | { ok: false, error: string }`. Caller decides what to do with failures.

### `POST /api/broadcasts` — broadcast send route

1. Auth check (admin session — same middleware as other admin routes).
2. Feature-flag guard. If `dayOfBroadcasts` is off, return 404.
3. Validate request body (subject + body non-empty).
4. Load all `Invitation` rows where `broadcastEmail IS NOT NULL`. If zero, return 400 (`{ error: "No recipients opted in" }`).
5. Create the `Broadcast` row first (subject, body, `sentBy: "admin"`, `recipientCount`). Get the ID.
6. Loop recipients **sequentially**. For each:
   - Call `sendMail`.
   - Insert a `BroadcastDelivery` row with snapshotted `emailAddress`, `status`, and any `errorMessage`.
7. Return summary `{ broadcastId, sent, failed }`.

Sequential is intentional: ~150 invitations is the expected scale for this deployment. To keep wall-clock time reasonable, the singleton transport uses **`pool: true, maxConnections: 1`** so the TLS handshake is amortized across the loop instead of repeated per message. Realistic timing on Gmail SMTP with pooling: well under a minute for 150 messages. The admin sees a loading state with explicit "Sending — this may take up to a minute" copy while the request completes; no background job infrastructure needed for V1. If a future deployment hits scales where this becomes painful, the next step is a background queue (out of scope here).

### Failure semantics

- Per-recipient `sendMail` failure: caught, recorded as `status: "failed"` with the error message, loop continues. Partial success is preserved.
- Transport meltdown (SMTP relay unreachable, auth rejected): caught at the route level. Mark all remaining recipients as `failed` with the transport error. Return 500. The `Broadcast` row stays in the DB so the admin sees what was attempted.
- The send route does NOT roll back the `Broadcast` row on any failure — the historical record is the point.

### From / Reply-To assembly

- **From header**: `"{coupleName1} & {coupleName2} <{SMTP_FROM}>"`. Display name from Site Settings; envelope address from env. So the email shows as "Joe & Alex" but routes from the configured sender.
- **Reply-To header**: `SiteSettings.replyToEmail` if set; falls back to `SMTP_FROM` if blank.

### Audit retention

No purge in V1. Wedding is one-off — keep everything forever.

## Deployment configuration

SMTP credentials live in container env vars (set via `docker-compose.yml` `environment:` block, alongside existing `ADMIN_PASSWORD` and `TZ`).

```yaml
environment:
  ADMIN_PASSWORD: ...
  TZ: ...
  SMTP_HOST: smtp.gmail.com
  SMTP_PORT: "587"
  SMTP_USER: you@gmail.com
  SMTP_PASS: <gmail-app-password>
  SMTP_FROM: you@gmail.com
```

`docker-compose.example.yml` updated to include these as commented-out examples with a brief note about Gmail app passwords (16-char passwords, generated at <https://myaccount.google.com/apppasswords>, require 2FA on the account).

`.env.example` is **not** the right place for these — that file is for the bump-script's local Docker registry config, not runtime env. Keep these concerns separate.

## Testing

### Unit tests (`vitest`)

- `src/lib/email.ts`:
  - `getEmailConfig` returns `configured: false` when any required env var is missing.
  - Mask logic never returns the `SMTP_PASS` value.
  - `sendMail` calls the mocked transport with the expected envelope (`from`, `to`, `replyTo`, `subject`, `text`).
- `POST /api/broadcasts`:
  - Happy path: creates `Broadcast` + N `BroadcastDelivery` rows with `status: "sent"`; summary counts match.
  - Partial-failure: one mocked send rejects → that delivery row is `failed` with the error; others succeed; summary `{ sent: N-1, failed: 1 }`.
  - Empty recipients: returns 400, no `Broadcast` row created.
  - Feature-flag off: returns 404.
- RSVP route regression:
  - `broadcastEmail: ""` normalizes to `null` in the DB.
  - `broadcastEmail: "guest@example.com"` persists.
  - All other RSVP fields unaffected.

### Manual smoke test before shipping

1. Configure SMTP env vars locally (Mailtrap or any SMTP sandbox is fine; Gmail app password also works).
2. `npx prisma db push` to apply schema.
3. Flip `dayOfBroadcasts` on at `/admin/features`.
4. RSVP through the public form, fill `broadcastEmail`, confirm it persists via admin RSVPs page.
5. Hit `/admin/email-settings`, send a test email to yourself. Verify: From-name renders as "Couple1 & Couple2", Reply-To routes to the couple's address.
6. Hit `/admin/broadcasts`, compose a message, send. Verify delivery log row appears + email actually arrives.
7. Force a failure: edit a test invitation's `broadcastEmail` to a known-bad address, re-send, verify the partial-failure UI rendering and that the error message surfaces.

### CI guardrails (per CLAUDE.md)

- `npx tsc --noEmit`
- `npx vitest run`

## Rollout

- Schema is purely additive — `npx prisma db push` is safe on existing TrueNAS prod DB.
- Feature flag default is `false`, so new admin pages stay hidden on installs until explicitly enabled.
- Single Docker version bump after merge (`./scripts/docker.sh bump-minor`).
- Update `docker-compose.example.yml` with the new SMTP env-var examples in the same release.
