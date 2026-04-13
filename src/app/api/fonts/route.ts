import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    const fonts = await prisma.customFont.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(fonts);
  } catch (error) {
    console.error('Error fetching fonts:', error);
    return NextResponse.json({ error: 'Failed to fetch fonts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { name, family, filename, format } = await request.json();
    if (!name || !family || !filename || !format) return NextResponse.json({ error: 'Missing required fields: name, family, filename, format' }, { status: 400 });
    if (await prisma.customFont.findUnique({ where: { name } })) return NextResponse.json({ error: 'A font with this name already exists' }, { status: 400 });
    const font = await prisma.customFont.create({ data: { name, family, filename, format } });
    return NextResponse.json(font, { status: 201 });
  } catch (error) {
    console.error('Error creating font:', error);
    return NextResponse.json({ error: 'Failed to create font' }, { status: 500 });
  }
}
