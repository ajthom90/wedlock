import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const font = await prisma.customFont.findUnique({ where: { id } });
    if (!font) return NextResponse.json({ error: 'Font not found' }, { status: 404 });
    const filePath = path.join('/data/uploads', font.filename);
    if (existsSync(filePath)) await unlink(filePath);
    await prisma.customFont.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting font:', error);
    return NextResponse.json({ error: 'Failed to delete font' }, { status: 500 });
  }
}
