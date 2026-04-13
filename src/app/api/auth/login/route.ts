import { NextResponse } from 'next/server';
import { initAdmin, login } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await initAdmin();
    const { password } = await request.json();
    if (!password) return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    const result = await login(password);
    if (result.success) return NextResponse.json({ success: true });
    return NextResponse.json({ error: result.error }, { status: 401 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'An error occurred during login' }, { status: 500 });
  }
}
