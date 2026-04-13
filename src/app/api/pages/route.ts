import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';

export async function GET() {
  try {
    const pages = await prisma.page.findMany({ orderBy: { slug: 'asc' } });
    return NextResponse.json(pages);
  } catch (error) {
    console.error('Error fetching pages:', error);
    return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { slug, title, content } = await request.json();
    const page = await prisma.page.upsert({ where: { slug }, update: { title, content: JSON.stringify(content) }, create: { slug, title, content: JSON.stringify(content) } });
    return NextResponse.json(page);
  } catch (error) {
    console.error('Error saving page:', error);
    return NextResponse.json({ error: 'Failed to save page' }, { status: 500 });
  }
}
