'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { RichTextEditor } from '@/components/admin/RichTextEditor';

interface PageRow {
  id: string;
  slug: string;
  title: string;
  content: string;
  bodyHtml: string | null;
  canonicalRoute: string | null;
  visible: boolean;
}

interface Features {
  customPages?: boolean;
}

// Built-ins flagged here support having their URL changed by the admin.
// Keep in sync with BUILT_IN_PAGES in src/lib/page-routing.ts and
// BUILTIN_DISPATCH in src/app/(public)/[slug]/page.tsx.
const RENAME_SUPPORTED = new Set(['our-story', 'details', 'travel', 'faq']);

// Maps a built-in canonicalRoute to the existing per-feature admin page that
// owns its body content. The Pages screen sends people there for body edits.
const BODY_EDITOR_LINK: Record<string, { href: string; label: string }> = {
  'our-story': { href: '/admin/content', label: 'Edit story content' },
  details: { href: '/admin/details', label: 'Edit events & dress code' },
  travel: { href: '/admin/content', label: 'Edit travel info & hotels' },
  faq: { href: '/admin/faq', label: 'Edit questions' },
  'wedding-party': { href: '/admin/wedding-party', label: 'Edit wedding party' },
  registry: { href: '/admin/gifts', label: 'Edit gifts & registry' },
};

export default function PagesAdmin() {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [features, setFeatures] = useState<Features>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [pagesRes, featuresRes] = await Promise.all([fetch('/api/pages'), fetch('/api/features')]);
      if (pagesRes.ok) setPages(await pagesRes.json());
      if (featuresRes.ok) setFeatures(await featuresRes.json());
    } catch (e) {
      console.error('Failed to load pages:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const builtIns = pages.filter((p) => p.canonicalRoute !== null);
  const customs = pages.filter((p) => p.canonicalRoute === null);

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading pages...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-3xl font-bold">Pages</h1>
        {features.customPages !== false && (
          <Button onClick={() => { setShowCreate(true); setError(null); }}>+ New custom page</Button>
        )}
      </div>

      <p className="text-sm text-gray-600">
        Edit each page&apos;s public title and URL. Custom pages also let you edit the body here. To
        change a page&apos;s contents (events, hotels, FAQ entries, etc.), use the linked editor.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Built-in pages</h2>
        {builtIns.map((page) => (
          <PageRowCard
            key={page.id}
            page={page}
            renameSupported={page.canonicalRoute ? RENAME_SUPPORTED.has(page.canonicalRoute) : false}
            bodyEditor={page.canonicalRoute ? BODY_EDITOR_LINK[page.canonicalRoute] : undefined}
            isEditing={editingId === page.id}
            onEdit={() => { setEditingId(page.id); setError(null); }}
            onClose={() => setEditingId(null)}
            onSaved={async () => { setEditingId(null); await fetchAll(); }}
            onError={setError}
          />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Custom pages</h2>
        {customs.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-gray-500 text-sm">No custom pages yet.</CardContent></Card>
        ) : (
          customs.map((page) => (
            <PageRowCard
              key={page.id}
              page={page}
              renameSupported
              isEditing={editingId === page.id}
              onEdit={() => { setEditingId(page.id); setError(null); }}
              onClose={() => setEditingId(null)}
              onSaved={async () => { setEditingId(null); await fetchAll(); }}
              onError={setError}
            />
          ))
        )}
      </section>

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow">
          {error}
          <button onClick={() => setError(null)} className="ml-3 font-bold">×</button>
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => { setShowCreate(false); await fetchAll(); }}
          onError={setError}
        />
      )}
    </div>
  );
}

function PageRowCard({
  page,
  renameSupported,
  bodyEditor,
  isEditing,
  onEdit,
  onClose,
  onSaved,
  onError,
}: {
  page: PageRow;
  renameSupported: boolean;
  bodyEditor?: { href: string; label: string };
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [visible, setVisible] = useState(page.visible);
  const [bodyHtml, setBodyHtml] = useState(page.bodyHtml || '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isEditing) {
      setTitle(page.title);
      setSlug(page.slug);
      setVisible(page.visible);
      setBodyHtml(page.bodyHtml || '');
      setConfirmDelete(false);
    }
  }, [isEditing, page]);

  const isCustom = page.canonicalRoute === null;

  const save = async () => {
    setSaving(true);
    try {
      const body: { title: string; slug?: string; visible: boolean; bodyHtml?: string } = { title, visible };
      if (renameSupported && slug !== page.slug) body.slug = slug;
      if (isCustom) body.bodyHtml = bodyHtml;
      const res = await fetch(`/api/pages/${page.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        onError(err.error || 'Failed to save page');
        return;
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/pages/${page.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        onError(err.error || 'Failed to delete page');
        return;
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <Card>
        <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{page.title}</span>
              {!page.visible && <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">Hidden</span>}
            </div>
            <p className="text-sm text-gray-500 font-mono">/{page.slug}</p>
          </div>
          <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Edit page</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Page title" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">URL slug</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-mono">/</span>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-page"
              disabled={!renameSupported}
            />
          </div>
          {!renameSupported ? (
            <p className="text-xs text-gray-500 mt-1">
              URL changes aren&apos;t supported for this page yet — only Our Story, Details, Travel, and FAQ are renameable in this version.
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, and dashes only. Old URL will redirect to the new one.</p>
          )}
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="h-4 w-4" />
          <span className="text-sm">Visible (uncheck to hide the page; visitors will get a 404)</span>
        </label>
        {isCustom ? (
          <div>
            <label className="block text-sm font-medium mb-1">Body</label>
            <RichTextEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Page contents…" minHeight="300px" />
          </div>
        ) : bodyEditor ? (
          <p className="text-sm">
            <Link href={bodyEditor.href} className="text-primary hover:underline">
              {bodyEditor.label} →
            </Link>
          </p>
        ) : (
          <p className="text-xs text-gray-500">This page&apos;s body is generated from other admin pages.</p>
        )}
      </CardContent>
      <CardFooter className="gap-2 justify-end flex-wrap">
        {isCustom && (
          confirmDelete ? (
            <>
              <Button size="sm" variant="danger" onClick={remove} disabled={saving}>Confirm delete</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} disabled={saving}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)} disabled={saving}>Delete page</Button>
          )
        )}
        <Button variant="outline" onClick={onClose} disabled={saving}>Close</Button>
        <Button onClick={save} disabled={saving || !title.trim() || (renameSupported && !slug.trim())}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </CardFooter>
    </Card>
  );
}

function CreateModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [addToNav, setAddToNav] = useState(true);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, slug, bodyHtml, addToNav }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        onError(err.error || 'Failed to create page');
        return;
      }
      await onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>New custom page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Things to do in Chicago" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">URL slug</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 font-mono">/</span>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="things-to-do" />
            </div>
            <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, and dashes only.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Body</label>
            <RichTextEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Page contents…" minHeight="300px" />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={addToNav} onChange={(e) => setAddToNav(e.target.checked)} className="h-4 w-4" />
            <span className="text-sm">Add to the public navigation menu</span>
          </label>
        </CardContent>
        <CardFooter className="gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={create} disabled={saving || !title.trim() || !slug.trim()}>
            {saving ? 'Creating...' : 'Create page'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
