import prisma from './prisma';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'admin_session';

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
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return { success: true };
}

export async function isAuthenticated(): Promise<boolean> {
  const cookie = (await cookies()).get(COOKIE_NAME);
  return !!cookie?.value;
}

export async function logout() {
  (await cookies()).delete(COOKIE_NAME);
}
