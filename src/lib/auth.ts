import prisma from './prisma';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'admin_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

// Only a hash of the session token touches the DB, so a leaked database copy
// (the SQLite file is a plain bind-mounted file) can't be replayed as a cookie.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function initAdmin() {
  const envPassword = process.env.ADMIN_PASSWORD;
  const existing = await prisma.adminAuth.findFirst();
  if (existing) {
    if (envPassword) {
      const hash = await bcrypt.hash(envPassword, 12);
      await prisma.adminAuth.update({
        where: { id: existing.id },
        data: { passwordHash: hash, loginAttempts: 0, lockedUntil: null },
      });
    }
  } else {
    const hash = await bcrypt.hash(envPassword || 'changeme', 12);
    await prisma.adminAuth.create({ data: { passwordHash: hash } });
  }
}

async function isLocked(): Promise<boolean> {
  const auth = await prisma.adminAuth.findFirst();
  return !!auth && !!(auth.lockedUntil && auth.lockedUntil > new Date());
}

async function getRemainingLockTime(): Promise<number> {
  const auth = await prisma.adminAuth.findFirst();
  if (!auth?.lockedUntil) return 0;
  const remaining = auth.lockedUntil.getTime() - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export async function login(password: string): Promise<{ success: boolean; error?: string }> {
  const auth = await prisma.adminAuth.findFirst();
  if (!auth) { await initAdmin(); return login(password); }

  if (await isLocked()) {
    const remaining = await getRemainingLockTime();
    return { success: false, error: `Account locked. Try again in ${Math.ceil(remaining / 60)} minutes.` };
  }

  if (!(await bcrypt.compare(password, auth.passwordHash))) {
    const attempts = auth.loginAttempts + 1;
    const updateData: any = { loginAttempts: attempts };
    if (attempts >= 5) updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    await prisma.adminAuth.update({ where: { id: auth.id }, data: updateData });
    const remaining = 5 - attempts;
    return remaining > 0
      ? { success: false, error: `Invalid password. ${remaining} attempts remaining.` }
      : { success: false, error: 'Account locked for 15 minutes due to too many failed attempts.' };
  }

  await prisma.adminAuth.update({ where: { id: auth.id }, data: { loginAttempts: 0, lockedUntil: null } });
  const token = crypto.randomUUID() + '-' + Date.now().toString(36);
  await prisma.adminSession.create({
    data: {
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
    },
  });
  // Opportunistic cleanup so abandoned sessions don't accumulate forever.
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  });
  return { success: true };
}

export async function isAuthenticated(): Promise<boolean> {
  const cookie = (await cookies()).get(COOKIE_NAME);
  if (!cookie?.value) return false;
  const session = await prisma.adminSession.findUnique({ where: { tokenHash: hashToken(cookie.value) } });
  return !!session && session.expiresAt > new Date();
}

export async function logout() {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME);
  if (cookie?.value) {
    await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(cookie.value) } });
  }
  store.delete(COOKIE_NAME);
}
