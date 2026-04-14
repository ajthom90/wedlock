'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

interface Vendor {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  order: number;
}

const emptyForm = { name: '', role: '', phone: '', email: '', website: '', notes: '' };

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchVendors = useCallback(async () => {
    try {
      const res = await fetch('/api/vendors');
      if (res.ok) setVendors(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const update = (key: keyof typeof emptyForm, value: string) => setForm({ ...form, [key]: value });

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (v: Vendor) => {
    setEditing(v);
    setForm({
      name: v.name,
      role: v.role,
      phone: v.phone || '',
      email: v.email || '',
      website: v.website || '',
      notes: v.notes || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.role.trim()) return;
    setSaving(true);
    try {
      const url = editing ? `/api/vendors/${editing.id}` : '/api/vendors';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        await fetchVendors();
        closeModal();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/vendors/${id}`, { method: 'DELETE' });
      if (res.ok) await fetchVendors();
    } finally {
      setDeleteConfirm(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading vendors...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Vendors</h1>
          <p className="text-sm text-gray-500 mt-1">Private directory of photographers, DJs, florists, and anyone else working the wedding.</p>
        </div>
        <Button onClick={openAdd}>Add Vendor</Button>
      </div>

      {vendors.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            No vendors yet. Click &quot;Add Vendor&quot; to start.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vendors.map((v) => (
            <Card key={v.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{v.name}</CardTitle>
                    <p className="text-sm text-primary font-medium">{v.role}</p>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(v)}>Edit</Button>
                    {deleteConfirm === v.id ? (
                      <>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(v.id)}>Confirm</Button>
                        <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(v.id)}>Delete</Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {v.phone && (
                  <p>
                    <span className="font-medium text-gray-500">Phone: </span>
                    <a href={`tel:${v.phone}`} className="text-blue-600 hover:underline">{v.phone}</a>
                  </p>
                )}
                {v.email && (
                  <p>
                    <span className="font-medium text-gray-500">Email: </span>
                    <a href={`mailto:${v.email}`} className="text-blue-600 hover:underline">{v.email}</a>
                  </p>
                )}
                {v.website && (
                  <p>
                    <span className="font-medium text-gray-500">Website: </span>
                    <a href={v.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                      {v.website}
                    </a>
                  </p>
                )}
                {v.notes && (
                  <p className="text-gray-700 whitespace-pre-line pt-2 border-t border-gray-100">{v.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>{editing ? 'Edit Vendor' : 'Add Vendor'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <Input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Vendor or business name" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Role *</label>
                <Input value={form.role} onChange={(e) => update('role', e.target.value)} placeholder="Photographer, DJ, Florist, etc." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="(555) 555-5555" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Website</label>
                <Input value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Contract date, special notes, contract link, etc." />
              </div>
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.role.trim()}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
