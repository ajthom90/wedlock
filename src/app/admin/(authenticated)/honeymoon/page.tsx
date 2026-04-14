'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

interface Pledge {
  id: string;
  guestName: string;
  amount: number;
  message: string | null;
  receivedAt: string | null;
  createdAt: string;
}

interface Item {
  id: string;
  name: string;
  description: string | null;
  goalAmount: number;
  imageUrl: string | null;
  pledges: Pledge[];
  order: number;
}

const emptyForm = { name: '', description: '', goalAmount: '', imageUrl: '' };

export default function HoneymoonPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/honeymoon');
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setImageFile(null); setModalOpen(true); };
  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description || '',
      goalAmount: item.goalAmount ? String(item.goalAmount) : '',
      imageUrl: item.imageUrl || '',
    });
    setImageFile(null);
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); setForm(emptyForm); setImageFile(null); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      let finalImageUrl = form.imageUrl || null;
      if (imageFile) {
        const fd = new FormData();
        fd.append('file', imageFile);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (res.ok) {
          const data = await res.json();
          finalImageUrl = data.url;
        }
      }
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        goalAmount: form.goalAmount ? parseFloat(form.goalAmount) : 0,
        imageUrl: finalImageUrl,
      };
      const url = editing ? `/api/honeymoon/${editing.id}` : '/api/honeymoon';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { await fetchItems(); closeModal(); }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/honeymoon/${id}`, { method: 'DELETE' });
    if (res.ok) await fetchItems();
    setDeleteConfirm(null);
  };

  const togglePledgeReceived = async (pledge: Pledge) => {
    await fetch(`/api/honeymoon/pledge/${pledge.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ received: !pledge.receivedAt }),
    });
    await fetchItems();
  };

  const deletePledge = async (id: string) => {
    await fetch(`/api/honeymoon/pledge/${id}`, { method: 'DELETE' });
    await fetchItems();
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Honeymoon Fund</h1>
          <p className="text-sm text-gray-500 mt-1">Experiences guests can pledge toward. Pledges are recorded; you mark them received when the cash/gift arrives.</p>
        </div>
        <Button onClick={openAdd}>Add Item</Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            No honeymoon items yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {items.map((item) => {
            const pledged = item.pledges.reduce((sum, p) => sum + p.amount, 0);
            const received = item.pledges.filter((p) => p.receivedAt).reduce((sum, p) => sum + p.amount, 0);
            const progress = item.goalAmount > 0 ? Math.min(100, (pledged / item.goalAmount) * 100) : 0;
            return (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex gap-4 items-start">
                    {item.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.name} className="w-24 h-24 object-cover rounded-lg flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <CardTitle className="text-lg">{item.name}</CardTitle>
                      {item.description && <p className="text-sm text-gray-600 mt-1">{item.description}</p>}
                      <div className="mt-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">
                            ${pledged.toFixed(2)}
                            {item.goalAmount > 0 && <span className="text-gray-400"> of ${item.goalAmount.toFixed(2)}</span>}
                          </span>
                          <span className="text-gray-500">${received.toFixed(2)} received</span>
                        </div>
                        {item.goalAmount > 0 && (
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
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
                </CardHeader>
                {item.pledges.length > 0 && (
                  <CardContent>
                    <p className="text-sm font-medium text-gray-500 mb-2">Pledges</p>
                    <div className="divide-y divide-gray-100">
                      {item.pledges.map((p) => (
                        <div key={p.id} className="py-2 flex items-center gap-3">
                          <label className="flex items-center gap-2 shrink-0">
                            <input
                              type="checkbox"
                              checked={!!p.receivedAt}
                              onChange={() => togglePledgeReceived(p)}
                              className="h-4 w-4 rounded border-gray-300"
                              title={p.receivedAt ? 'Received' : 'Pledged'}
                            />
                          </label>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{p.guestName} <span className="text-gray-500">· ${p.amount.toFixed(2)}</span></p>
                            {p.message && <p className="text-xs text-gray-600 italic">&ldquo;{p.message}&rdquo;</p>}
                            <p className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleDateString()}</p>
                          </div>
                          <Button size="sm" variant="danger" onClick={() => deletePledge(p.id)}>Remove</Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader><CardTitle>{editing ? 'Edit Item' : 'Add Item'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sunset dinner in Santorini" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Tell guests why this experience matters." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Goal amount ($)</label>
                <Input type="number" min={0} step="0.01" value={form.goalAmount} onChange={(e) => setForm({ ...form, goalAmount: e.target.value })} placeholder="0 = no goal, just accept pledges" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90"
                />
                {form.imageUrl && !imageFile && (
                  <p className="text-xs text-gray-400 mt-1">Current: {form.imageUrl}</p>
                )}
              </div>
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
