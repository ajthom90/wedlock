'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

interface Guest {
  id: string;
  name: string;
  isPrimary: boolean;
}

interface RsvpResponse {
  id: string;
  attending: string;
  guestCount: number;
}

interface Invitation {
  id: string;
  code: string;
  householdName: string;
  email: string | null;
  maxGuests: number;
  notes: string | null;
  createdAt: string;
  guests: Guest[];
  response: RsvpResponse | null;
}

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [qrData, setQrData] = useState<{ qrCode: string; rsvpUrl: string; code: string } | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [householdName, setHouseholdName] = useState('');
  const [email, setEmail] = useState('');
  const [maxGuests, setMaxGuests] = useState(2);
  const [notes, setNotes] = useState('');
  const [guestNames, setGuestNames] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);

  const fetchInvitations = useCallback(async () => {
    try {
      const res = await fetch('/api/invitations');
      if (res.ok) {
        const data = await res.json();
        setInvitations(data);
      }
    } catch (error) {
      console.error('Failed to fetch invitations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const resetForm = () => {
    setHouseholdName('');
    setEmail('');
    setMaxGuests(2);
    setNotes('');
    setGuestNames(['']);
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (inv: Invitation) => {
    setEditingId(inv.id);
    setHouseholdName(inv.householdName);
    setEmail(inv.email || '');
    setMaxGuests(inv.maxGuests);
    setNotes(inv.notes || '');
    setGuestNames(inv.guests.length > 0 ? inv.guests.map((g) => g.name) : ['']);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!householdName.trim()) return;
    setSaving(true);
    try {
      const body = {
        householdName: householdName.trim(),
        email: email.trim() || null,
        maxGuests,
        notes: notes.trim() || null,
        guestNames: guestNames.filter((n) => n.trim()),
      };
      const url = editingId ? `/api/invitations/${editingId}` : '/api/invitations';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        setShowModal(false);
        resetForm();
        await fetchInvitations();
      }
    } catch (error) {
      console.error('Failed to save invitation:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/invitations/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteId(null);
        await fetchInvitations();
      }
    } catch (error) {
      console.error('Failed to delete invitation:', error);
    }
  };

  const showQr = async (id: string) => {
    try {
      const res = await fetch(`/api/invitations/${id}/qr`);
      if (res.ok) {
        const data = await res.json();
        setQrData(data);
      }
    } catch (error) {
      console.error('Failed to fetch QR code:', error);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/invitations/pdf');
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'invitation-cards.pdf';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to download PDF:', error);
    } finally {
      setDownloading(false);
    }
  };

  const addGuestName = () => setGuestNames([...guestNames, '']);
  const removeGuestName = (index: number) => setGuestNames(guestNames.filter((_, i) => i !== index));
  const updateGuestName = (index: number, value: string) => {
    const updated = [...guestNames];
    updated[index] = value;
    setGuestNames(updated);
  };

  const filtered = invitations.filter(
    (inv) =>
      inv.householdName.toLowerCase().includes(search.toLowerCase()) ||
      inv.code.toLowerCase().includes(search.toLowerCase()) ||
      inv.guests.some((g) => g.name.toLowerCase().includes(search.toLowerCase()))
  );

  const getStatusBadge = (inv: Invitation) => {
    if (!inv.response) return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">Pending</span>;
    if (inv.response.attending === 'yes')
      return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Attending ({inv.response.guestCount})</span>;
    return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">Declined</span>;
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading invitations...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Invitations</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadPdf} disabled={downloading}>
            {downloading ? 'Generating...' : 'Download PDF'}
          </Button>
          <Button onClick={openCreate}>Create Invitation</Button>
        </div>
      </div>

      <Input placeholder="Search invitations..." value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">No invitations found</CardContent>
          </Card>
        ) : (
          filtered.map((inv) => (
            <Card key={inv.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{inv.householdName}</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">Code: <span className="font-mono font-semibold">{inv.code}</span></p>
                    {inv.email && <p className="text-sm text-gray-500">{inv.email}</p>}
                  </div>
                  {getStatusBadge(inv)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm"><span className="font-medium">Guests ({inv.guests.length}/{inv.maxGuests}):</span>{' '}
                    {inv.guests.map((g) => g.name).join(', ') || 'None'}
                  </p>
                  {inv.notes && <p className="text-sm text-gray-500">Notes: {inv.notes}</p>}
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(inv)}>Edit</Button>
                <Button size="sm" variant="outline" onClick={() => showQr(inv.id)}>QR Code</Button>
                <Button size="sm" variant="danger" onClick={() => setDeleteId(inv.id)}>Delete</Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>{editingId ? 'Edit Invitation' : 'Create Invitation'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Household Name *</label>
                <Input value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder="The Smith Family" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="smith@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Guests</label>
                <Input type="number" min={1} max={20} value={maxGuests} onChange={(e) => setMaxGuests(parseInt(e.target.value) || 1)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Guest Names</label>
                <div className="space-y-2">
                  {guestNames.map((name, i) => (
                    <div key={i} className="flex gap-2">
                      <Input value={name} onChange={(e) => updateGuestName(i, e.target.value)} placeholder={`Guest ${i + 1}`} />
                      {guestNames.length > 1 && (
                        <Button size="sm" variant="danger" onClick={() => removeGuestName(i)}>Remove</Button>
                      )}
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={addGuestName}>Add Guest</Button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !householdName.trim()}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* QR Code Modal */}
      {qrData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>QR Code</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <img src={qrData.qrCode} alt="QR Code" className="mx-auto" />
              <p className="text-sm text-gray-500">Code: <span className="font-mono font-semibold">{qrData.code}</span></p>
              <p className="text-xs text-gray-400 break-all">{qrData.rsvpUrl}</p>
            </CardContent>
            <CardFooter className="justify-end">
              <Button variant="outline" onClick={() => setQrData(null)}>Close</Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Confirm Delete</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Are you sure you want to delete this invitation? This action cannot be undone.</p>
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete}>Delete</Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
