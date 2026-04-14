'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { FocalPointEditor } from '@/components/admin/FocalPointEditor';
import { Framed } from '@/components/public/Framed';

interface Milestone {
  id: string;
  date: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  focalX: number;
  focalY: number;
  zoom: number;
  order: number;
}

const emptyForm = { date: '', title: '', description: '' };

export default function StoryTimelinePage() {
  const [items, setItems] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [focal, setFocal] = useState({ focalX: 50, focalY: 50, zoom: 1 });
  const [previewUrl, setPreviewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/milestones');
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(imageUrl);
    }
  }, [imageFile, imageUrl]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setImageFile(null);
    setImageUrl('');
    setFocal({ focalX: 50, focalY: 50, zoom: 1 });
    setModalOpen(true);
  };

  const openEdit = (m: Milestone) => {
    setEditing(m);
    setForm({ date: m.date, title: m.title, description: m.description || '' });
    setImageFile(null);
    setImageUrl(m.imageUrl || '');
    setFocal({ focalX: m.focalX, focalY: m.focalY, zoom: m.zoom });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setImageFile(null);
    setImageUrl('');
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return imageUrl || null;
    const fd = new FormData();
    fd.append('file', imageFile);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) return imageUrl || null;
    const data = await res.json();
    return data.url;
  };

  const handleSave = async () => {
    if (!form.date.trim() || !form.title.trim()) return;
    setSaving(true);
    try {
      const uploaded = await uploadImage();
      const body = {
        date: form.date.trim(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        imageUrl: uploaded,
        focalX: focal.focalX,
        focalY: focal.focalY,
        zoom: focal.zoom,
      };
      const url = editing ? `/api/milestones/${editing.id}` : '/api/milestones';
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
    const res = await fetch(`/api/milestones/${id}`, { method: 'DELETE' });
    if (res.ok) await fetchItems();
    setDeleteConfirm(null);
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[idx];
    const b = items[target];
    // Swap order values
    await Promise.all([
      fetch(`/api/milestones/${a.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: b.order }) }),
      fetch(`/api/milestones/${b.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: a.order }) }),
    ]);
    await fetchItems();
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading timeline...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">How We Met Timeline</h1>
          <p className="text-sm text-gray-500 mt-1">Milestones in your relationship, rendered as a visual timeline on the Our Story page.</p>
        </div>
        <Button onClick={openAdd}>Add Milestone</Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">No milestones yet. Click &quot;Add Milestone&quot; to start your story.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((m, i) => (
            <Card key={m.id}>
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="outline" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
                    <Button size="sm" variant="outline" onClick={() => move(i, 1)} disabled={i === items.length - 1}>↓</Button>
                  </div>
                  {m.imageUrl ? (
                    <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                      <Framed src={m.imageUrl} alt={m.title} focalX={m.focalX} focalY={m.focalY} zoom={m.zoom} />
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-lg bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">💍</div>
                  )}
                  <div className="flex-1">
                    <p className="text-sm text-primary font-medium">{m.date}</p>
                    <p className="font-semibold">{m.title}</p>
                    {m.description && <p className="text-sm text-gray-600 mt-1">{m.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(m)}>Edit</Button>
                    {deleteConfirm === m.id ? (
                      <>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(m.id)}>Confirm</Button>
                        <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(m.id)}>Delete</Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader><CardTitle>{editing ? 'Edit Milestone' : 'Add Milestone'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date *</label>
                <Input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="Summer 2019, June 4 2020, etc." />
                <p className="text-xs text-gray-500 mt-1">Display text — free-form, not a strict date.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Title *</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="We met at a concert" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Tell the story..." rows={3} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90"
                />
              </div>
              {previewUrl && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-2">Framing</p>
                  <FocalPointEditor src={previewUrl} value={focal} onChange={setFocal} />
                </div>
              )}
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.date.trim() || !form.title.trim()}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
