import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthenticated } from '@/lib/auth';
import { validateSlug } from '@/lib/page-routing';

// Update title / slug / visibility / bodyHtml for an existing page (built-in
// or custom). Slug changes also rewrite NavItem hrefs that point at the old
// URL, so the menu stays consistent without manual fixup.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const existing = await prisma.page.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

    const { title, slug, visible, bodyHtml } = await request.json();

    const updates: { title?: string; slug?: string; visible?: boolean; bodyHtml?: string } = {};
    if (typeof title === 'string') {
      if (!title.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
      updates.title = title.trim();
    }
    let oldSlug: string | null = null;
    if (typeof slug === 'string' && slug !== existing.slug) {
      const err = validateSlug(slug);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      const conflict = await prisma.page.findUnique({ where: { slug } });
      if (conflict && conflict.id !== id) {
        return NextResponse.json({ error: 'A page with this URL already exists' }, { status: 409 });
      }
      updates.slug = slug;
      oldSlug = existing.slug;
    }
    if (typeof visible === 'boolean') updates.visible = visible;
    if (typeof bodyHtml === 'string' && existing.canonicalRoute === null) {
      // bodyHtml is only meaningful for custom pages.
      updates.bodyHtml = bodyHtml;
    }

    const updated = await prisma.page.update({ where: { id }, data: updates });

    // Rewrite NavItems that pointed at the old URL so the menu still works.
    if (oldSlug) {
      await prisma.navItem.updateMany({
        where: { href: `/${oldSlug}` },
        data: { href: `/${slug}` },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating page:', error);
    return NextResponse.json({ error: 'Failed to update page' }, { status: 500 });
  }
}

// Delete a custom page. Built-ins are protected — deleting them would break
// the public route that still exists at canonicalRoute.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const existing = await prisma.page.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    if (existing.canonicalRoute) {
      return NextResponse.json({ error: "Built-in pages can't be deleted — toggle visibility off instead." }, { status: 400 });
    }
    await prisma.navItem.deleteMany({ where: { href: `/${existing.slug}` } });
    await prisma.page.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting page:', error);
    return NextResponse.json({ error: 'Failed to delete page' }, { status: 500 });
  }
}
