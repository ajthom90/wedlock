'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

interface Gift {
  id: string;
  name: string;
  store: string;
  url: string;
  price: number;
  purchased: boolean;
  purchasedBy: string;
  thankYouSent: boolean;
}

export default function GiftsPage() {
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Gift | null>(null);
  const [name, setName] = useState('');
  const [store, setStore] = useState('');
  const [url, setUrl] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchGifts = useCallback(async () => {
    try {
      const res = await fetch('/api/gifts');
      if (res.ok) {
        const data = await res.json();
        setGifts(data);
      }
    } catch (error) {
      console.error('Failed to fetch gifts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGifts();
  }, [fetchGifts]);

  const openAdd = () => {
    setEditing(null);
    setName('');
    setStore('');
    setUrl('');
    setPrice('');
    setModalOpen(true);
  };

  const openEdit = (gift: Gift) => {
    setEditing(gift);
    setName(gift.name);
    setStore(gift.store || '');
    setUrl(gift.url || '');
    setPrice(gift.price ? String(gift.price) : '');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setName('');
    setStore('');
    setUrl('');
    setPrice('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        name,
        store,
        url,
        price: price ? parseFloat(price) : 0,
      };
      if (editing) {
        const res = await fetch(`/api/gifts/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          await fetchGifts();
          closeModal();
        }
      } else {
        const res = await fetch('/api/gifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          await fetchGifts();
          closeModal();
        }
      }
    } catch (error) {
      console.error('Failed to save gift:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/gifts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchGifts();
      }
    } catch (error) {
      console.error('Failed to delete gift:', error);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const togglePurchased = async (gift: Gift) => {
    try {
      const res = await fetch(`/api/gifts/${gift.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchased: !gift.purchased }),
      });
      if (res.ok) {
        await fetchGifts();
      }
    } catch (error) {
      console.error('Failed to toggle purchased:', error);
    }
  };

  const toggleThankYou = async (gift: Gift) => {
    try {
      const res = await fetch(`/api/gifts/${gift.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thankYouSent: !gift.thankYouSent }),
      });
      if (res.ok) {
        await fetchGifts();
      }
    } catch (error) {
      console.error('Failed to toggle thank you:', error);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading gifts...</p></div>;

  const totalGifts = gifts.length;
  const purchasedCount = gifts.filter((g) => g.purchased).length;
  const thankYouCount = gifts.filter((g) => g.thankYouSent).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Gift Tracker</h1>
        <Button onClick={openAdd}>Add Gift</Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{totalGifts}</p>
            <p className="text-sm text-gray-500">Total Gifts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{purchasedCount}</p>
            <p className="text-sm text-gray-500">Purchased</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{thankYouCount}</p>
            <p className="text-sm text-gray-500">Thank-Yous Sent</p>
          </CardContent>
        </Card>
      </div>

      {gifts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">No gifts tracked yet. Click &quot;Add Gift&quot; to start.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gifts.map((gift) => (
            <Card key={gift.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{gift.name}</CardTitle>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(gift)}>Edit</Button>
                    {deleteConfirm === gift.id ? (
                      <>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(gift.id)}>Confirm</Button>
                        <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(gift.id)}>Delete</Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {gift.store && (
                  <p className="text-sm"><span className="font-medium">Store:</span> {gift.store}</p>
                )}
                {gift.price > 0 && (
                  <p className="text-sm"><span className="font-medium">Price:</span> ${gift.price.toFixed(2)}</p>
                )}
                {gift.url && (
                  <p className="text-sm truncate">
                    <a href={gift.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      View Link
                    </a>
                  </p>
                )}
                <p className="text-sm">
                  <span className="font-medium">Status:</span>{' '}
                  <span className={gift.purchased ? 'text-green-600' : 'text-gray-500'}>
                    {gift.purchased ? 'Purchased' : 'Not purchased'}
                  </span>
                </p>
                {gift.purchased && gift.purchasedBy && (
                  <p className="text-sm"><span className="font-medium">Purchased by:</span> {gift.purchasedBy}</p>
                )}
              </CardContent>
              <CardFooter className="flex gap-4 border-t pt-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gift.purchased}
                    onChange={() => togglePurchased(gift)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Purchased
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gift.thankYouSent}
                    onChange={() => toggleThankYou(gift)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Thank You Sent
                </label>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader>
              <CardTitle>{editing ? 'Edit Gift' : 'Add Gift'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Gift Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. KitchenAid Mixer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Store</label>
                <Input
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                  placeholder="e.g. Amazon, Target"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">URL</label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Price</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </CardContent>
            <div className="flex justify-end gap-2 p-6 pt-0">
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
