'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

interface GuestBookEntry {
  id: string;
  name: string;
  message: string;
  approved: boolean;
  createdAt: string;
}

export default function GuestbookAdminPage() {
  const [entries, setEntries] = useState<GuestBookEntry[]>([]);
  const [mode, setMode] = useState<string>('off');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/guestbook/admin');
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setMode(data.mode || 'off');
      }
    } catch (error) {
      console.error('Failed to fetch guest book entries:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleApproval = async (id: string, approved: boolean) => {
    try {
      const res = await fetch(`/api/guestbook/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      if (res.ok) {
        setEntries(entries.map((e) => (e.id === id ? { ...e, approved } : e)));
      }
    } catch (error) {
      console.error('Failed to update entry:', error);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/guestbook/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setEntries(entries.filter((e) => e.id !== deleteId));
        setDeleteId(null);
      }
    } catch (error) {
      console.error('Failed to delete entry:', error);
    }
  };

  const filtered = entries.filter((e) => {
    if (filter === 'pending') return !e.approved;
    if (filter === 'approved') return e.approved;
    return true;
  });

  const pendingCount = entries.filter((e) => !e.approved).length;

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading guest book...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Guest Book</h1>
          <p className="text-sm text-gray-500 mt-1">
            Mode: <span className="font-medium capitalize">{mode}</span>
            {mode === 'off' && ' - Guest book is disabled'}
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="px-3 py-1 text-sm rounded-full bg-yellow-100 text-yellow-800">
            {pendingCount} pending
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={filter === 'all' ? 'primary' : 'outline'}
          onClick={() => setFilter('all')}
        >
          All ({entries.length})
        </Button>
        <Button
          size="sm"
          variant={filter === 'pending' ? 'primary' : 'outline'}
          onClick={() => setFilter('pending')}
        >
          Pending ({pendingCount})
        </Button>
        <Button
          size="sm"
          variant={filter === 'approved' ? 'primary' : 'outline'}
          onClick={() => setFilter('approved')}
        >
          Approved ({entries.filter((e) => e.approved).length})
        </Button>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">No guest book entries found</CardContent>
          </Card>
        ) : (
          filtered.map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{entry.name}</CardTitle>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {entry.approved ? (
                    <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Approved</span>
                  ) : (
                    <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">Pending</span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.message}</p>
              </CardContent>
              <CardFooter className="gap-2">
                {entry.approved ? (
                  <Button size="sm" variant="outline" onClick={() => handleApproval(entry.id, false)}>
                    Unapprove
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => handleApproval(entry.id, true)}>
                    Approve
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={() => setDeleteId(entry.id)}>Delete</Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Confirm Delete</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Are you sure you want to delete this guest book entry? This cannot be undone.</p>
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
