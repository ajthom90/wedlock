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
  responses: string;
  guestMeals: string | null;
  attendingGuests: string | null;
  songRequests: string | null;
  dietaryNotes: string | null;
  message: string | null;
  submittedAt: string;
}

interface Invitation {
  id: string;
  code: string;
  householdName: string;
  email: string | null;
  maxGuests: number;
  guests: Guest[];
  response: RsvpResponse | null;
}

export default function RsvpsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'attending' | 'declined' | 'pending'>('all');
  const [selectedInvitation, setSelectedInvitation] = useState<Invitation | null>(null);
  const [editingResponse, setEditingResponse] = useState(false);
  const [editAttending, setEditAttending] = useState('');
  const [editGuestCount, setEditGuestCount] = useState(1);
  const [editMessage, setEditMessage] = useState('');
  const [editSongRequests, setEditSongRequests] = useState('');
  const [editDietaryNotes, setEditDietaryNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [dietaryCopied, setDietaryCopied] = useState(false);
  const [emailsCopied, setEmailsCopied] = useState(false);
  const [showPending, setShowPending] = useState(false);

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

  const filtered = invitations.filter((inv) => {
    if (filter === 'all') return true;
    if (filter === 'attending') return inv.response?.attending === 'yes';
    if (filter === 'declined') return inv.response?.attending === 'no';
    if (filter === 'pending') return !inv.response;
    return true;
  });

  const stats = {
    total: invitations.length,
    attending: invitations.filter((inv) => inv.response?.attending === 'yes').length,
    declined: invitations.filter((inv) => inv.response?.attending === 'no').length,
    pending: invitations.filter((inv) => !inv.response).length,
    totalGuests: invitations
      .filter((inv) => inv.response?.attending === 'yes')
      .reduce((sum, inv) => sum + (inv.response?.guestCount || 0), 0),
  };

  const openDetail = (inv: Invitation) => {
    setSelectedInvitation(inv);
    setEditingResponse(false);
    if (inv.response) {
      setEditAttending(inv.response.attending);
      setEditGuestCount(inv.response.guestCount);
      setEditMessage(inv.response.message || '');
      setEditSongRequests(inv.response.songRequests || '');
      setEditDietaryNotes(inv.response.dietaryNotes || '');
    }
  };

  const handleSaveResponse = async () => {
    if (!selectedInvitation) return;
    setSaving(true);
    try {
      const body = {
        attending: editAttending,
        guestCount: editGuestCount,
        message: editMessage.trim() || null,
        songRequests: editSongRequests.trim() || null,
        dietaryNotes: editDietaryNotes.trim() || null,
        responses: selectedInvitation.response?.responses ? JSON.parse(selectedInvitation.response.responses) : {},
        guestMeals: selectedInvitation.response?.guestMeals ? JSON.parse(selectedInvitation.response.guestMeals) : null,
        attendingGuests: selectedInvitation.response?.attendingGuests ? JSON.parse(selectedInvitation.response.attendingGuests) : null,
      };
      const res = await fetch(`/api/rsvp/${selectedInvitation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditingResponse(false);
        setSelectedInvitation(null);
        await fetchInvitations();
      }
    } catch (error) {
      console.error('Failed to save response:', error);
    } finally {
      setSaving(false);
    }
  };

  const copyDietarySummary = async () => {
    // One-line-per-guest rollup of every dietary restriction captured in the
    // RSVP flow. Formatted for the caterer.
    const lines = invitations
      .filter((inv) => inv.response?.dietaryNotes?.trim())
      .map((inv) => `${inv.householdName}: ${inv.response!.dietaryNotes!.trim()}`);
    if (lines.length === 0) {
      alert('No dietary notes to copy yet.');
      return;
    }
    await navigator.clipboard.writeText(lines.join('\n'));
    setDietaryCopied(true);
    setTimeout(() => setDietaryCopied(false), 2000);
  };

  const copyPendingEmails = async () => {
    const emails = invitations
      .filter((inv) => !inv.response && inv.email)
      .map((inv) => inv.email as string);
    if (emails.length === 0) {
      alert('No pending invitations have an email on file.');
      return;
    }
    await navigator.clipboard.writeText(emails.join(', '));
    setEmailsCopied(true);
    setTimeout(() => setEmailsCopied(false), 2000);
  };

  const exportCsv = () => {
    const headers = ['Household', 'Code', 'Email', 'Status', 'Guest Count', 'Guests', 'Message', 'Song Requests', 'Dietary Notes', 'Submitted At'];
    const rows = invitations.map((inv) => [
      inv.householdName,
      inv.code,
      inv.email || '',
      inv.response ? inv.response.attending : 'pending',
      inv.response ? inv.response.guestCount.toString() : '',
      inv.guests.map((g) => g.name).join('; '),
      inv.response?.message || '',
      inv.response?.songRequests || '',
      inv.response?.dietaryNotes || '',
      inv.response?.submittedAt || '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rsvp-responses.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseJson = (str: string | null): Record<string, string> => {
    if (!str) return {};
    try {
      return JSON.parse(str);
    } catch {
      return {};
    }
  };

  const parseList = (str: string | null): string[] => {
    if (!str) return [];
    try {
      return JSON.parse(str);
    } catch {
      return [];
    }
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading RSVPs...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-3xl font-bold">RSVPs</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copyDietarySummary}>
            {dietaryCopied ? 'Copied ✓' : 'Copy dietary summary'}
          </Button>
          <Button variant="outline" onClick={copyPendingEmails}>
            {emailsCopied ? 'Copied ✓' : 'Copy pending emails'}
          </Button>
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer" onClick={() => setFilter('all')}>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-sm text-gray-500">Total</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilter('attending')}>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.attending}</p>
            <p className="text-sm text-gray-500">Attending ({stats.totalGuests} guests)</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilter('declined')}>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.declined}</p>
            <p className="text-sm text-gray-500">Declined</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilter('pending')}>
          <CardContent className="py-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-sm text-gray-500">Pending</p>
          </CardContent>
        </Card>
      </div>

      {filter !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            Filtering: <span className="font-medium capitalize">{filter}</span>
          </span>
          <Button size="sm" variant="ghost" onClick={() => setFilter('all')}>Clear</Button>
        </div>
      )}

      {stats.pending > 0 && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowPending((s) => !s)}>
            <div className="flex justify-between items-center">
              <CardTitle className="text-base">
                Not yet responded ({stats.pending})
              </CardTitle>
              <span className="text-sm text-gray-500">{showPending ? '▲ Hide' : '▼ Show'}</span>
            </div>
          </CardHeader>
          {showPending && (
            <CardContent>
              <ul className="text-sm space-y-1">
                {invitations
                  .filter((inv) => !inv.response)
                  .map((inv) => (
                    <li key={inv.id} className="flex justify-between gap-4">
                      <span className="font-medium">{inv.householdName}</span>
                      <span className="text-gray-500">{inv.email || <em className="text-gray-400">no email on file</em>}</span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">No RSVPs found</CardContent>
          </Card>
        ) : (
          filtered.map((inv) => (
            <Card key={inv.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openDetail(inv)}>
              <CardContent className="py-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{inv.householdName}</p>
                    <p className="text-sm text-gray-500">{inv.guests.map((g) => g.name).join(', ')}</p>
                  </div>
                  <div className="text-right">
                    {!inv.response && <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">Pending</span>}
                    {inv.response?.attending === 'yes' && (
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                        Attending ({inv.response.guestCount})
                      </span>
                    )}
                    {inv.response?.attending === 'no' && (
                      <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">Declined</span>
                    )}
                    {inv.response?.submittedAt && (
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(inv.response.submittedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Detail/Edit Modal */}
      {selectedInvitation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>{selectedInvitation.householdName} - RSVP Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedInvitation.response ? (
                <p className="text-gray-500">No response submitted yet.</p>
              ) : editingResponse ? (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Attending</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      value={editAttending}
                      onChange={(e) => setEditAttending(e.target.value)}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Guest Count</label>
                    <Input
                      type="number"
                      min={1}
                      max={selectedInvitation.maxGuests}
                      value={editGuestCount}
                      onChange={(e) => setEditGuestCount(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Message</label>
                    <Textarea value={editMessage} onChange={(e) => setEditMessage(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Song Requests</label>
                    <Input value={editSongRequests} onChange={(e) => setEditSongRequests(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Dietary Notes</label>
                    <Input value={editDietaryNotes} onChange={(e) => setEditDietaryNotes(e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Status</p>
                      <p className="capitalize">{selectedInvitation.response.attending === 'yes' ? 'Attending' : 'Declined'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Guest Count</p>
                      <p>{selectedInvitation.response.guestCount}</p>
                    </div>
                  </div>
                  {selectedInvitation.response.attendingGuests && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Attending Guests</p>
                      <p>{parseList(selectedInvitation.response.attendingGuests).join(', ')}</p>
                    </div>
                  )}
                  {Object.keys(parseJson(selectedInvitation.response.responses)).length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">Responses</p>
                      {Object.entries(parseJson(selectedInvitation.response.responses)).map(([key, value]) => (
                        <p key={key} className="text-sm"><span className="font-medium">{key}:</span> {value}</p>
                      ))}
                    </div>
                  )}
                  {Object.keys(parseJson(selectedInvitation.response.guestMeals)).length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">Meal Choices</p>
                      {Object.entries(parseJson(selectedInvitation.response.guestMeals)).map(([guest, meal]) => (
                        <p key={guest} className="text-sm"><span className="font-medium">{guest}:</span> {meal}</p>
                      ))}
                    </div>
                  )}
                  {selectedInvitation.response.songRequests && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Song Requests</p>
                      <p className="text-sm">{selectedInvitation.response.songRequests}</p>
                    </div>
                  )}
                  {selectedInvitation.response.dietaryNotes && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Dietary Notes</p>
                      <p className="text-sm">{selectedInvitation.response.dietaryNotes}</p>
                    </div>
                  )}
                  {selectedInvitation.response.message && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Message</p>
                      <p className="text-sm">{selectedInvitation.response.message}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-500">Submitted</p>
                    <p className="text-sm">{new Date(selectedInvitation.response.submittedAt).toLocaleString()}</p>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              {selectedInvitation.response && !editingResponse && (
                <Button variant="outline" onClick={() => setEditingResponse(true)}>Edit</Button>
              )}
              {editingResponse && (
                <>
                  <Button variant="outline" onClick={() => setEditingResponse(false)}>Cancel Edit</Button>
                  <Button onClick={handleSaveResponse} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={() => setSelectedInvitation(null)}>Close</Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
