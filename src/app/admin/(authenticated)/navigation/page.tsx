'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface NavItem {
  id: string;
  href: string | null;
  label: string;
  visible: boolean;
  order: number;
  parentId: string | null;
}

export default function NavigationPage() {
  const [items, setItems] = useState<NavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addFor, setAddFor] = useState<{ parentId: string | null } | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/nav');
      if (res.ok) setItems(await res.json());
    } catch (error) {
      console.error('Failed to fetch nav items:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const topLevel = items.filter((i) => !i.parentId).sort((a, b) => a.order - b.order);
  const childrenOf = (id: string) =>
    items.filter((i) => i.parentId === id).sort((a, b) => a.order - b.order);

  const updateItem = (id: string, patch: Partial<NavItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    setSaved(false);
  };

  const moveItem = (id: string, direction: 'up' | 'down') => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const siblings = items
      .filter((i) => i.parentId === item.parentId)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((i) => i.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];
    setItems((prev) =>
      prev.map((i) => {
        if (i.id === item.id) return { ...i, order: other.order };
        if (i.id === other.id) return { ...i, order: item.order };
        return i;
      }),
    );
    setSaved(false);
  };

  const deleteItem = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const hasKids = items.some((i) => i.parentId === id);
    const msg = hasKids
      ? `Delete "${item.label}" and its child items?`
      : `Delete "${item.label}"?`;
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/nav/${id}`, { method: 'DELETE' });
      if (res.ok) fetchItems();
    } catch (error) {
      console.error('Failed to delete nav item:', error);
    }
  };

  const addItem = async (label: string, href: string, parentId: string | null) => {
    try {
      const res = await fetch('/api/nav', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, href: href.trim() || null, parentId }),
      });
      if (res.ok) {
        await fetchItems();
        setAddFor(null);
      }
    } catch (error) {
      console.error('Failed to add nav item:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      // Normalize order: top-level items first (in their order), each
      // followed by its children (in their order). Global sequential order
      // keeps the field sensible even though rendering groups by parent.
      const normalized: NavItem[] = [];
      let order = 0;
      for (const parent of topLevel) {
        normalized.push({ ...parent, order: order++ });
        for (const child of childrenOf(parent.id)) {
          normalized.push({ ...child, order: order++ });
        }
      }
      const res = await fetch('/api/nav', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalized),
      });
      if (res.ok) {
        setItems(await res.json());
        setSaved(true);
      }
    } catch (error) {
      console.error('Failed to save nav items:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading navigation...</p></div>;

  const renderRow = (item: NavItem, depth: number) => {
    const siblings = items
      .filter((i) => i.parentId === item.parentId)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((i) => i.id === item.id);
    const isFirst = idx === 0;
    const isLast = idx === siblings.length - 1;
    const hasKids = items.some((i) => i.parentId === item.id);

    return (
      <div
        key={item.id}
        className={`flex flex-wrap items-center gap-2 p-3 rounded-lg border ${
          item.visible ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
        }`}
        style={{ marginLeft: depth * 24 }}
      >
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => moveItem(item.id, 'up')}
            disabled={isFirst}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-sm leading-none"
            title="Move up"
          >▲</button>
          <button
            type="button"
            onClick={() => moveItem(item.id, 'down')}
            disabled={isLast}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-sm leading-none"
            title="Move down"
          >▼</button>
        </div>
        <Input
          value={item.label}
          onChange={(e) => updateItem(item.id, { label: e.target.value })}
          className="flex-1 min-w-[140px]"
          placeholder="Label"
        />
        <Input
          value={item.href || ''}
          onChange={(e) => updateItem(item.id, { href: e.target.value || null })}
          className="flex-1 min-w-[140px] text-sm font-mono"
          placeholder={depth === 0 ? '/path or blank for dropdown' : '/path'}
        />
        <select
          value={item.parentId || ''}
          onChange={(e) => updateItem(item.id, { parentId: e.target.value || null })}
          className="text-sm border rounded px-2 py-2 max-w-[140px]"
          title="Parent"
          disabled={hasKids && depth === 0}
        >
          <option value="">(Top-level)</option>
          {topLevel
            .filter((p) => p.id !== item.id)
            .map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
        </select>
        {depth === 0 && (
          <button
            type="button"
            onClick={() => setAddFor({ parentId: item.id })}
            className="text-xs text-primary hover:underline px-2"
            title="Add a child item under this one"
          >+ child</button>
        )}
        <label className="flex items-center gap-1 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={item.visible}
            onChange={() => updateItem(item.id, { visible: !item.visible })}
            className="h-4 w-4"
          />
          <span className="text-gray-600">Visible</span>
        </label>
        <button
          type="button"
          onClick={() => deleteItem(item.id)}
          className="text-red-500 hover:text-red-700 text-lg px-2 leading-none"
          title="Delete"
        >×</button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Navigation Menu</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Menu Items</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Reorder, rename, hide, or nest navigation items. A top-level item with no link becomes a dropdown header containing its children — handy when the top bar is getting crowded. Changes apply to the public site menu after you save.
          </p>
          <div className="space-y-2">
            {topLevel.map((parent) => (
              <div key={parent.id} className="space-y-2">
                {renderRow(parent, 0)}
                {childrenOf(parent.id).map((child) => renderRow(child, 1))}
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Button type="button" variant="outline" onClick={() => setAddFor({ parentId: null })}>
              + Add menu item
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 justify-end">
        {saved && <span className="text-sm text-green-600">Navigation saved successfully!</span>}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Navigation'}
        </Button>
      </div>

      {addFor && (
        <AddItemModal
          initialParentId={addFor.parentId}
          parents={topLevel}
          onClose={() => setAddFor(null)}
          onSubmit={addItem}
        />
      )}
    </div>
  );
}

function AddItemModal({
  initialParentId,
  parents,
  onClose,
  onSubmit,
}: {
  initialParentId: string | null;
  parents: NavItem[];
  onClose: () => void;
  onSubmit: (label: string, href: string, parentId: string | null) => void;
}) {
  const [label, setLabel] = useState('');
  const [href, setHref] = useState('');
  const [parentId, setParentId] = useState<string | null>(initialParentId);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">Add Menu Item</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim()) onSubmit(label.trim(), href, parentId);
          }}
          className="space-y-4"
        >
          <Input
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="About Us"
            autoFocus
            required
          />
          <Input
            label="Link (leave blank for a dropdown heading)"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="/about"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parent</label>
            <select
              value={parentId || ''}
              onChange={(e) => setParentId(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">(Top-level)</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Add</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
