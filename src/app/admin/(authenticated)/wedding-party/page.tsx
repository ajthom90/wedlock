'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { FocalPointEditor } from '@/components/admin/FocalPointEditor';
import { Framed } from '@/components/public/Framed';

interface WeddingPartyMember {
  id: string;
  name: string;
  role: string;
  side: string;
  description: string | null;
  imageUrl: string | null;
  order: number;
  focalX: number;
  focalY: number;
  zoom: number;
}

export default function WeddingPartyPage() {
  const [members, setMembers] = useState<WeddingPartyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [side, setSide] = useState('bride');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [focal, setFocal] = useState({ focalX: 50, focalY: 50, zoom: 1 });
  const [saving, setSaving] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/wedding-party');
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch (error) {
      console.error('Failed to fetch wedding party:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const resetForm = () => {
    setName('');
    setRole('');
    setSide('bride');
    setDescription('');
    setImageFile(null);
    setImageUrl('');
    setFocal({ focalX: 50, focalY: 50, zoom: 1 });
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (member: WeddingPartyMember) => {
    setEditingId(member.id);
    setName(member.name);
    setRole(member.role);
    setSide(member.side);
    setDescription(member.description || '');
    setImageUrl(member.imageUrl || '');
    setImageFile(null);
    setFocal({ focalX: member.focalX, focalY: member.focalY, zoom: member.zoom });
    setShowModal(true);
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return imageUrl || null;
    const formData = new FormData();
    formData.append('file', imageFile);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        return data.url;
      }
    } catch (error) {
      console.error('Failed to upload image:', error);
    }
    return imageUrl || null;
  };

  const handleSave = async () => {
    if (!name.trim() || !role.trim()) return;
    setSaving(true);
    try {
      const uploadedUrl = await uploadImage();
      const body = {
        name: name.trim(),
        role: role.trim(),
        side,
        description: description.trim() || null,
        imageUrl: uploadedUrl,
        order: editingId ? members.find((m) => m.id === editingId)?.order || 0 : members.length,
        focalX: focal.focalX,
        focalY: focal.focalY,
        zoom: focal.zoom,
      };
      const url = editingId ? `/api/wedding-party/${editingId}` : '/api/wedding-party';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        setShowModal(false);
        resetForm();
        await fetchMembers();
      }
    } catch (error) {
      console.error('Failed to save member:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/wedding-party/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteId(null);
        await fetchMembers();
      }
    } catch (error) {
      console.error('Failed to delete member:', error);
    }
  };

  const sorted = [...members].sort((a, b) => a.order - b.order);

  // Shows the user the uploaded image immediately for focal-point editing, even
  // before they click Save. Local files become blob URLs for the editor preview.
  const [previewUrl, setPreviewUrl] = useState<string>('');
  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(imageUrl);
    }
  }, [imageFile, imageUrl]);

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading wedding party...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Wedding Party</h1>
        <Button onClick={openCreate}>Add Member</Button>
      </div>

      <div className="space-y-3">
        {sorted.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">No wedding party members yet</CardContent>
          </Card>
        ) : (
          sorted.map((member) => (
            <Card key={member.id}>
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  {member.imageUrl ? (
                    <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-gray-100">
                      <Framed
                        src={member.imageUrl}
                        alt={member.name}
                        focalX={member.focalX}
                        focalY={member.focalY}
                        zoom={member.zoom}
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">👤</div>
                  )}
                  <div className="flex-1">
                    <p className="font-semibold">{member.name}</p>
                    <p className="text-sm text-gray-600">{member.role}</p>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 capitalize">
                      {member.side}
                    </span>
                    {member.description && (
                      <p className="text-sm text-gray-500 mt-1">{member.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(member)}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => setDeleteId(member.id)}>Delete</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>{editingId ? 'Edit Member' : 'Add Member'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Role *</label>
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g., Best Man, Maid of Honor" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Side</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={side}
                  onChange={(e) => setSide(e.target.value)}
                >
                  <option value="bride">Bride</option>
                  <option value="groom">Groom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A short bio..." />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90"
                />
                <p className="text-xs text-gray-500 mt-1">JPG, PNG, GIF, WebP, or HEIC — up to 10 MB.</p>
              </div>

              {previewUrl && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-2">Framing</p>
                  <p className="text-xs text-gray-500 mb-3">Center the face in the circle for the best result.</p>
                  <FocalPointEditor src={previewUrl} value={focal} onChange={setFocal} />
                </div>
              )}
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !name.trim() || !role.trim()}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Confirm Delete</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Are you sure you want to remove this member from the wedding party?</p>
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
