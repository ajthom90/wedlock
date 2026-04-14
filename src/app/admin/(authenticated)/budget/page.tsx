'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

interface BudgetItem {
  id: string;
  category: string;
  description: string;
  estimated: number;
  actual: number;
  paid: boolean;
  notes: string | null;
  order: number;
}

const emptyForm = {
  category: '',
  description: '',
  estimated: '',
  actual: '',
  paid: false,
  notes: '',
};

const PRESET_CATEGORIES = [
  'Venue',
  'Catering',
  'Photography',
  'Videography',
  'Flowers',
  'Music',
  'Attire',
  'Rings',
  'Stationery',
  'Decor',
  'Transportation',
  'Favors',
  'Honeymoon',
  'Other',
];

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function BudgetPage() {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/budget');
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (item: BudgetItem) => {
    setEditing(item);
    setForm({
      category: item.category,
      description: item.description,
      estimated: item.estimated ? String(item.estimated) : '',
      actual: item.actual ? String(item.actual) : '',
      paid: item.paid,
      notes: item.notes || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.category.trim() || !form.description.trim()) return;
    setSaving(true);
    try {
      const body = {
        category: form.category.trim(),
        description: form.description.trim(),
        estimated: form.estimated ? parseFloat(form.estimated) : 0,
        actual: form.actual ? parseFloat(form.actual) : 0,
        paid: form.paid,
        notes: form.notes.trim() || null,
      };
      const url = editing ? `/api/budget/${editing.id}` : '/api/budget';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await fetchItems();
        closeModal();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/budget/${id}`, { method: 'DELETE' });
      if (res.ok) await fetchItems();
    } finally {
      setDeleteConfirm(null);
    }
  };

  const togglePaid = async (item: BudgetItem) => {
    await fetch(`/api/budget/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: !item.paid }),
    });
    await fetchItems();
  };

  // Group items by category for the table view
  const grouped = items.reduce<Record<string, BudgetItem[]>>((acc, item) => {
    (acc[item.category] = acc[item.category] || []).push(item);
    return acc;
  }, {});

  // Summary totals — use max(estimated, actual) to compute "committed"
  const totalEstimated = items.reduce((sum, i) => sum + i.estimated, 0);
  const totalActual = items.reduce((sum, i) => sum + i.actual, 0);
  const totalPaid = items.filter((i) => i.paid).reduce((sum, i) => sum + i.actual, 0);
  const totalUnpaid = totalActual - totalPaid;

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading budget...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Budget</h1>
          <p className="text-sm text-gray-500 mt-1">Private expense log. Track estimated vs actual and what&apos;s been paid.</p>
        </div>
        <Button onClick={openAdd}>Add Item</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xl font-bold">{fmt(totalEstimated)}</p>
            <p className="text-sm text-gray-500">Estimated</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xl font-bold">{fmt(totalActual)}</p>
            <p className="text-sm text-gray-500">Actual</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xl font-bold text-green-600">{fmt(totalPaid)}</p>
            <p className="text-sm text-gray-500">Paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xl font-bold text-amber-600">{fmt(totalUnpaid)}</p>
            <p className="text-sm text-gray-500">Unpaid</p>
          </CardContent>
        </Card>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            No budget items yet. Click &quot;Add Item&quot; to start.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.keys(grouped).sort().map((category) => {
            const catItems = grouped[category];
            const catEstimated = catItems.reduce((sum, i) => sum + i.estimated, 0);
            const catActual = catItems.reduce((sum, i) => sum + i.actual, 0);
            return (
              <Card key={category}>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>{category}</CardTitle>
                    <p className="text-sm text-gray-500">
                      {fmt(catActual)} <span className="text-gray-400">of</span> {fmt(catEstimated)}
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-gray-100">
                    {catItems.map((item) => (
                      <div key={item.id} className="py-3 flex items-center gap-4">
                        <label className="flex items-center gap-2 shrink-0">
                          <input
                            type="checkbox"
                            checked={item.paid}
                            onChange={() => togglePaid(item)}
                            className="h-4 w-4 rounded border-gray-300"
                            title={item.paid ? 'Paid' : 'Unpaid'}
                          />
                        </label>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium ${item.paid ? 'text-gray-500 line-through' : ''}`}>{item.description}</p>
                          {item.notes && <p className="text-xs text-gray-500 mt-0.5">{item.notes}</p>}
                        </div>
                        <div className="text-right shrink-0 w-28">
                          <p className="text-sm font-medium">{fmt(item.actual || item.estimated)}</p>
                          {item.estimated > 0 && item.actual > 0 && item.estimated !== item.actual && (
                            <p className="text-xs text-gray-400">est {fmt(item.estimated)}</p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button>
                          {deleteConfirm === item.id ? (
                            <>
                              <Button size="sm" variant="danger" onClick={() => handleDelete(item.id)}>Confirm</Button>
                              <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                            </>
                          ) : (
                            <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(item.id)}>Delete</Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>{editing ? 'Edit Item' : 'Add Item'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Category *</label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. Venue, Catering"
                  list="budget-categories"
                />
                <datalist id="budget-categories">
                  {PRESET_CATEGORIES.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description *</label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What is this line item?"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Estimated ($)</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.estimated}
                    onChange={(e) => setForm({ ...form, estimated: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Actual ($)</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.actual}
                    onChange={(e) => setForm({ ...form, actual: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.paid}
                  onChange={(e) => setForm({ ...form, paid: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm">Paid</span>
              </label>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Vendor, due date, contract reference, etc."
                />
              </div>
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.category.trim() || !form.description.trim()}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
