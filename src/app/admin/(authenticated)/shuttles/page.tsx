'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

interface Signup {
  id: string;
  invitationId: string;
  guestCount: number;
  invitation: { householdName: string };
}

interface Shuttle {
  id: string;
  name: string;
  departDate: string;
  departTime: string;
  origin: string;
  destination: string;
  capacity: number;
  notes: string | null;
  signups: Signup[];
}

const emptyForm = {
  name: '',
  departDate: '',
  departTime: '',
  origin: '',
  destination: '',
  capacity: '',
  notes: '',
};

export default function ShuttlesPage() {
  const [shuttles, setShuttles] = useState<Shuttle[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Shuttle | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchShuttles = useCallback(async () => {
    try {
      const res = await fetch('/api/shuttles');
      if (res.ok) setShuttles(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchShuttles(); }, [fetchShuttles]);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (s: Shuttle) => {
    setEditing(s);
    setForm({
      name: s.name,
      departDate: s.departDate,
      departTime: s.departTime,
      origin: s.origin,
      destination: s.destination,
      capacity: s.capacity ? String(s.capacity) : '',
      notes: s.notes || '',
    });
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); setForm(emptyForm); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.departDate.trim() || !form.departTime.trim() || !form.origin.trim() || !form.destination.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        departDate: form.departDate.trim(),
        departTime: form.departTime.trim(),
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        capacity: form.capacity ? parseInt(form.capacity, 10) || 0 : 0,
        notes: form.notes.trim() || null,
      };
      const url = editing ? `/api/shuttles/${editing.id}` : '/api/shuttles';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { await fetchShuttles(); closeModal(); }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/shuttles/${id}`, { method: 'DELETE' });
    if (res.ok) await fetchShuttles();
    setDeleteConfirm(null);
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading shuttles...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Shuttles</h1>
          <p className="text-sm text-gray-500 mt-1">Transportation between hotel and venue. Guests sign up on the Transportation page with their invitation code.</p>
        </div>
        <Button onClick={openAdd}>Add Shuttle</Button>
      </div>

      {shuttles.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">No shuttles yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {shuttles.map((s) => {
            const totalSignedUp = s.signups.reduce((sum, x) => sum + x.guestCount, 0);
            return (
              <Card key={s.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{s.name}</CardTitle>
                      <p className="text-sm text-gray-500 mt-1">
                        {s.departDate} at {s.departTime} · {s.origin} → {s.destination}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0 ml-4">
                      <Button size="sm" variant="outline" onClick={() => openEdit(s)}>Edit</Button>
                      {deleteConfirm === s.id ? (
                        <>
                          <Button size="sm" variant="danger" onClick={() => handleDelete(s.id)}>Confirm</Button>
                          <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(s.id)}>Delete</Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">Signed up:</span> {totalSignedUp}
                    {s.capacity > 0 && ` / ${s.capacity}`}
                  </p>
                  {s.notes && <p className="text-sm text-gray-600 whitespace-pre-line">{s.notes}</p>}
                  {s.signups.length > 0 && (
                    <div className="pt-2 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-500 mb-1">Households</p>
                      <ul className="text-sm space-y-0.5">
                        {s.signups.map((sig) => (
                          <li key={sig.id} className="flex justify-between">
                            <span>{sig.invitation.householdName}</span>
                            <span className="text-gray-500">× {sig.guestCount}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader><CardTitle>{editing ? 'Edit Shuttle' : 'Add Shuttle'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Friday hotel → venue" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Date *</label>
                  <Input type="date" value={form.departDate} onChange={(e) => setForm({ ...form, departDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Time *</label>
                  <Input type="time" value={form.departTime} onChange={(e) => setForm({ ...form, departTime: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Origin *</label>
                <Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Hotel name or address" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Destination *</label>
                <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Venue name or address" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Capacity</label>
                <Input
                  type="number"
                  min={0}
                  value={form.capacity}
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                  placeholder="Leave blank for unlimited"
                />
                <p className="text-xs text-gray-500 mt-1">Max number of seats. Leave blank for no limit.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Return trip info, special instructions, etc." />
              </div>
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.departDate.trim() || !form.departTime.trim() || !form.origin.trim() || !form.destination.trim()}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
