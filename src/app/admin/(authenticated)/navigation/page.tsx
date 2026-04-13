'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface NavItem {
  id: string;
  href: string;
  label: string;
  visible: boolean;
  order: number;
}

export default function NavigationPage() {
  const [items, setItems] = useState<NavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/nav');
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (error) {
      console.error('Failed to fetch nav items:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...items];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newItems.length) return;

    // Swap order values
    const tempOrder = newItems[index].order;
    newItems[index] = { ...newItems[index], order: newItems[swapIndex].order };
    newItems[swapIndex] = { ...newItems[swapIndex], order: tempOrder };

    // Swap positions in array
    [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];
    setItems(newItems);
    setSaved(false);
  };

  const updateLabel = (index: number, label: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], label };
    setItems(newItems);
    setSaved(false);
  };

  const toggleVisible = (index: number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], visible: !newItems[index].visible };
    setItems(newItems);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      // Normalize order values to be sequential
      const normalized = items.map((item, i) => ({ ...item, order: i }));
      const res = await fetch('/api/nav', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalized),
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
        setSaved(true);
      }
    } catch (error) {
      console.error('Failed to save nav items:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading navigation...</p></div>;

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
            Reorder, rename, or hide navigation items. Changes apply to the public site menu.
          </p>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  item.visible ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveItem(index, 'up')}
                    disabled={index === 0}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-sm leading-none"
                    title="Move up"
                  >
                    &#9650;
                  </button>
                  <button
                    onClick={() => moveItem(index, 'down')}
                    disabled={index === items.length - 1}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-sm leading-none"
                    title="Move down"
                  >
                    &#9660;
                  </button>
                </div>
                <Input
                  value={item.label}
                  onChange={(e) => updateLabel(index, e.target.value)}
                  className="flex-1 max-w-xs"
                />
                <span className="text-sm text-gray-400 font-mono min-w-[120px]">{item.href}</span>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={item.visible}
                    onChange={() => toggleVisible(index)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-600">Visible</span>
                </label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 justify-end">
        {saved && <span className="text-sm text-green-600">Navigation saved successfully!</span>}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Navigation'}
        </Button>
      </div>
    </div>
  );
}
