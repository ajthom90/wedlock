import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { BUILT_IN_PAGES, ensureBuiltInPage, validateSlug } from '@/lib/page-routing';

// Returns every Page row, seeding any missing built-ins on the way out so the
// admin Pages screen always has a complete list. Existing per-feature admin
// screens that call PUT below with a slug-keyed content blob keep working.
export async function GET() {
  try {
    for (const def of BUILT_IN_PAGES) {
      await ensureBuiltInPage(def.canonicalRoute);
    }
    const pages = await prisma.page.findMany({ orderBy: { title: 'asc' } });
    return NextResponse.json(pages);
  } catch (error) {
    console.error('Error fetching pages:', error);
    return NextResponse.json({ error: 'Failed to fetch pages' }, { status: 500 });
  }
}

// Legacy upsert keyed by slug — used by the Our Story / Details / Travel
// admin pages to save their JSON content blob. Doesn't touch title/slug/etc.
export async function PUT(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { slug, title, content } = await request.json();
    const page = await prisma.page.upsert({
      where: { slug },
      update: { content: JSON.stringify(content) },
      create: { slug, title: title || slug, content: JSON.stringify(content) },
    });
    return NextResponse.json(page);
  } catch (error) {
    console.error('Error saving page:', error);
    return NextResponse.json({ error: 'Failed to save page' }, { status: 500 });
  }
}

// Create a new custom page. Built-ins are created automatically by
// ensureBuiltInPage and can't be POSTed.
export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { title, slug, bodyHtml, addToNav } = await request.json();
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    const slugError = validateSlug(slug);
    if (slugError) return NextResponse.json({ error: slugError }, { status: 400 });

    const existing = await prisma.page.findUnique({ where: { slug } });
    if (existing) return NextResponse.json({ error: 'A page with this URL already exists' }, { status: 409 });

    const page = await prisma.page.create({
      data: {
        slug,
        title: title.trim(),
        content: '',
        bodyHtml: bodyHtml || '',
        canonicalRoute: null,
      },
    });

    if (addToNav) {
      const maxOrder = await prisma.navItem.aggregate({ _max: { order: true } });
      await prisma.navItem.create({
        data: {
          href: `/${slug}`,
          label: title.trim(),
          order: (maxOrder._max.order || 0) + 1,
          visible: true,
        },
      });
    }

    return NextResponse.json(page);
  } catch (error) {
    console.error('Error creating page:', error);
    return NextResponse.json({ error: 'Failed to create page' }, { status: 500 });
  }
}
