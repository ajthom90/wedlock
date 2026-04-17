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
  plusOnes: string | null;
  songRequests: string | null;
  dietaryNotes: string | null;
  message: string | null;
  submittedAt: string;
}

interface ChangeLog {
  id: string;
  source: string; // "guest" | "admin"
  details: string; // JSON snapshot
  createdAt: string;
}

interface Invitation {
  id: string;
  code: string;
  householdName: string;
  email: string | null;
  mailingAddress1: string | null;
  mailingAddress2: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingPostalCode: string | null;
  contactEmail: string | null;
  maxGuests: number;
  plusOnesAllowed: number;
  guests: Guest[];
  response: RsvpResponse | null;
  changeLogs?: ChangeLog[];
}

interface RsvpOption {
  id: string;
  type: string;           // "meal" drives per-guest meal UI; others are household-level
  label: string;
  choices: { name: string; description?: string }[];
  required: boolean;
  order: number;
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
  const [editAttendingGuests, setEditAttendingGuests] = useState<string[]>([]);
  const [editGuestMeals, setEditGuestMeals] = useState<Record<string, string>>({});
  const [editPlusOnes, setEditPlusOnes] = useState<{ name: string; meal: string }[]>([]);
  const [editResponses, setEditResponses] = useState<Record<string, string>>({});
  const [editMailingAddress1, setEditMailingAddress1] = useState('');
  const [editMailingAddress2, setEditMailingAddress2] = useState('');
  const [editMailingCity, setEditMailingCity] = useState('');
  const [editMailingState, setEditMailingState] = useState('');
  const [editMailingPostalCode, setEditMailingPostalCode] = useState('');
  const [editContactEmail, setEditContactEmail] = useState('');
  const [rsvpOptions, setRsvpOptions] = useState<RsvpOption[]>([]);
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

  // Fetch RSVP options once so the edit modal can render the same fields
  // the public form does (per-guest meal selects, custom household-level
  // questions). `choices` comes back as a JSON string — parse it here.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/rsvp-options');
        if (!res.ok) return;
        const raw = (await res.json()) as Array<Omit<RsvpOption, 'choices'> & { choices: string }>;
        setRsvpOptions(raw.map((o) => {
          let choices: RsvpOption['choices'] = [];
          try { choices = JSON.parse(o.choices); } catch { /* keep empty */ }
          return { ...o, choices };
        }));
      } catch { /* silent */ }
    })();
  }, []);

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

    // Mailing address and contactEmail live on the invitation and persist across
    // RSVP changes, so seed them whether or not a response exists yet.
    setEditMailingAddress1(inv.mailingAddress1 || '');
    setEditMailingAddress2(inv.mailingAddress2 || '');
    setEditMailingCity(inv.mailingCity || '');
    setEditMailingState(inv.mailingState || '');
    setEditMailingPostalCode(inv.mailingPostalCode || '');
    setEditContactEmail(inv.contactEmail || '');

    // Prefill plus-one slots up to the invitation's allowance; the first N
    // slots are seeded from any existing response.
    const plusOneSlots = Array.from(
      { length: inv.plusOnesAllowed || 0 },
      () => ({ name: '', meal: '' }),
    );

    const safeParse = <T,>(raw: string | null | undefined, fallback: T): T => {
      if (!raw) return fallback;
      try { return JSON.parse(raw) as T; } catch { return fallback; }
    };

    if (inv.response) {
      setEditAttending(inv.response.attending);
      setEditGuestCount(inv.response.guestCount);
      setEditMessage(inv.response.message || '');
      setEditSongRequests(inv.response.songRequests || '');
      setEditDietaryNotes(inv.response.dietaryNotes || '');
      setEditAttendingGuests(safeParse<string[]>(inv.response.attendingGuests, []));
      setEditGuestMeals(safeParse<Record<string, string>>(inv.response.guestMeals, {}));
      const loadedPluses = safeParse<{ name: string; meal: string }[]>(inv.response.plusOnes, []);
      setEditPlusOnes(plusOneSlots.map((slot, i) => loadedPluses[i] ? { name: loadedPluses[i].name || '', meal: loadedPluses[i].meal || '' } : slot));
      setEditResponses(safeParse<Record<string, string>>(inv.response.responses, {}));
    } else {
      setEditAttending('yes');
      setEditGuestCount(inv.guests.length || 1);
      setEditMessage('');
      setEditSongRequests('');
      setEditDietaryNotes('');
      setEditAttendingGuests([]);
      setEditGuestMeals({});
      setEditPlusOnes(plusOneSlots);
      setEditResponses({});
    }
  };

  const toggleEditAttendingGuest = (id: string) => {
    setEditAttendingGuests((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]);
  };

  const updateEditPlusOne = (index: number, patch: Partial<{ name: string; meal: string }>) => {
    setEditPlusOnes((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const handleSaveResponse = async () => {
    if (!selectedInvitation) return;
    setSaving(true);
    try {
      // Derive guestCount from the per-guest selections when accepting, so
      // the stored count always matches the actual attendee roster. When
      // declining, force it to zero so stale counts don't linger in reports.
      const namedPlusOnes = editPlusOnes.filter((p) => p.name.trim());
      const computedGuestCount = editAttending === 'yes'
        ? editAttendingGuests.length + namedPlusOnes.length
        : 0;

      const body = {
        attending: editAttending,
        guestCount: computedGuestCount,
        message: editMessage.trim() || null,
        songRequests: editSongRequests.trim() || null,
        dietaryNotes: editDietaryNotes.trim() || null,
        responses: editResponses,
        guestMeals: Object.keys(editGuestMeals).length > 0 ? editGuestMeals : null,
        attendingGuests: editAttendingGuests.length > 0 ? editAttendingGuests : null,
        plusOnes: namedPlusOnes.map((p) => ({ name: p.name.trim(), meal: p.meal || '' })),
        // Invitation-level fields (persisted by the PUT route to the Invitation, not RsvpResponse).
        mailingAddress1: editMailingAddress1.trim() || null,
        mailingAddress2: editMailingAddress2.trim() || null,
        mailingCity: editMailingCity.trim() || null,
        mailingState: editMailingState.trim() || null,
        mailingPostalCode: editMailingPostalCode.trim() || null,
        contactEmail: editContactEmail.trim() || null,
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
    // One row per attendee (primary guests + plus-ones) so the caterer /
    // seating chart / name-card workflows all get a complete roster with
    // per-person meal choices. Households that haven't responded or declined
    // still get a single row to make pending/declined visible.
    const headers = ['Household', 'Code', 'Email', 'Status', 'Guest Count', 'Attendee', 'Attendee Type', 'Meal', 'Message', 'Song Requests', 'Dietary Notes', 'Submitted At'];
    const rows: string[][] = [];
    for (const inv of invitations) {
      const baseCols = [
        inv.householdName,
        inv.code,
        inv.email || '',
        inv.response ? inv.response.attending : 'pending',
        inv.response ? inv.response.guestCount.toString() : '',
      ];
      const tailCols = [
        inv.response?.message || '',
        inv.response?.songRequests || '',
        inv.response?.dietaryNotes || '',
        inv.response?.submittedAt || '',
      ];

      const parse = <T,>(raw: string | null | undefined, fallback: T): T => {
        if (!raw) return fallback;
        try { return JSON.parse(raw) as T; } catch { return fallback; }
      };
      const attendingIds = parse<string[]>(inv.response?.attendingGuests, []);
      const guestMeals = parse<Record<string, string>>(inv.response?.guestMeals, {});
      const plusOnes = parse<{ name: string; meal?: string }[]>(inv.response?.plusOnes, []);
      const guestsById = new Map(inv.guests.map((g) => [g.id, g.name]));

      // No response yet — single placeholder row so the household still shows.
      if (!inv.response) {
        rows.push([...baseCols, '', '', '', ...tailCols]);
        continue;
      }

      // Declined — one row with empty attendee fields; the Status column carries the signal.
      if (inv.response.attending !== 'yes') {
        rows.push([...baseCols, '', '', '', ...tailCols]);
        continue;
      }

      // Attending — one row per attending primary guest, then one per plus-one.
      for (const id of attendingIds) {
        const name = guestsById.get(id) ?? id;
        rows.push([...baseCols, name, 'primary', guestMeals[id] || '', ...tailCols]);
      }
      for (const p of plusOnes) {
        if (!p?.name) continue;
        rows.push([...baseCols, p.name, 'plus-one', p.meal || '', ...tailCols]);
      }
      // Attending household with zero attendees recorded — still emit one row so the
      // invitation doesn't drop out of the export entirely.
      if (attendingIds.length === 0 && plusOnes.length === 0) {
        rows.push([...baseCols, '', '', '', ...tailCols]);
      }
    }
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
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>{selectedInvitation.householdName} - RSVP Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedInvitation.response ? (
                <p className="text-gray-500">No response submitted yet.</p>
              ) : editingResponse ? (
                (() => {
                  const mealOption = rsvpOptions.find((o) => o.type === 'meal');
                  const householdOptions = rsvpOptions.filter((o) => o.type !== 'meal');
                  const attendingSet = new Set(editAttendingGuests);
                  const namedPlusCount = editPlusOnes.filter((p) => p.name.trim()).length;
                  const derivedCount = editAttending === 'yes' ? editAttendingGuests.length + namedPlusCount : 0;
                  return (
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

                      {editAttending === 'yes' && selectedInvitation.guests.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2">Who will be attending?</p>
                          <div className="space-y-2">
                            {selectedInvitation.guests.map((g) => (
                              <label key={g.id} className="flex items-center gap-3 p-2 border rounded-md">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={attendingSet.has(g.id)}
                                  onChange={() => toggleEditAttendingGuest(g.id)}
                                />
                                <span className="flex-1 text-sm">{g.name}</span>
                                {mealOption && attendingSet.has(g.id) && (
                                  <select
                                    className="text-sm border border-gray-300 rounded px-2 py-1"
                                    value={editGuestMeals[g.id] || ''}
                                    onChange={(e) => setEditGuestMeals({ ...editGuestMeals, [g.id]: e.target.value })}
                                  >
                                    <option value="">{mealOption.label}…</option>
                                    {mealOption.choices.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                                  </select>
                                )}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {editAttending === 'yes' && selectedInvitation.plusOnesAllowed > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2">
                            Plus-ones <span className="text-xs text-gray-500">(up to {selectedInvitation.plusOnesAllowed})</span>
                          </p>
                          <div className="space-y-2">
                            {editPlusOnes.map((p, i) => (
                              <div key={i} className="flex gap-2">
                                <Input
                                  placeholder={`Plus-one ${i + 1} name`}
                                  value={p.name}
                                  onChange={(e) => updateEditPlusOne(i, { name: e.target.value })}
                                />
                                {mealOption && p.name.trim() && (
                                  <select
                                    className="text-sm border border-gray-300 rounded px-2 py-1"
                                    value={p.meal}
                                    onChange={(e) => updateEditPlusOne(i, { meal: e.target.value })}
                                  >
                                    <option value="">{mealOption.label}…</option>
                                    {mealOption.choices.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                                  </select>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {editAttending === 'yes' && householdOptions.length > 0 && (
                        <div className="space-y-3">
                          {householdOptions.map((opt) => (
                            <div key={opt.id}>
                              <label className="block text-sm font-medium mb-1">{opt.label}{opt.required && ' *'}</label>
                              {opt.type === 'textarea' ? (
                                <Textarea
                                  rows={3}
                                  value={editResponses[opt.id] || ''}
                                  onChange={(e) => setEditResponses({ ...editResponses, [opt.id]: e.target.value })}
                                />
                              ) : (
                                <select
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                  value={editResponses[opt.id] || ''}
                                  onChange={(e) => setEditResponses({ ...editResponses, [opt.id]: e.target.value })}
                                >
                                  <option value="">Select…</option>
                                  {opt.choices.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                                </select>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Fallback guest-count input for deployments not using per-guest checkboxes */}
                      {editAttending === 'yes' && selectedInvitation.guests.length === 0 && (
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
                      )}

                      <div className="space-y-2">
                        <label className="block text-sm font-medium">Mailing Address</label>
                        <Input placeholder="Address line 1" value={editMailingAddress1} onChange={(e) => setEditMailingAddress1(e.target.value)} />
                        <Input placeholder="Address line 2" value={editMailingAddress2} onChange={(e) => setEditMailingAddress2(e.target.value)} />
                        <div className="grid grid-cols-3 gap-2">
                          <Input className="col-span-2" placeholder="City" value={editMailingCity} onChange={(e) => setEditMailingCity(e.target.value)} />
                          <Input placeholder="State" value={editMailingState} onChange={(e) => setEditMailingState(e.target.value)} />
                        </div>
                        <Input placeholder="Postal code" value={editMailingPostalCode} onChange={(e) => setEditMailingPostalCode(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Contact Email (for RSVP confirmation & day-of updates)</label>
                        <Input type="email" value={editContactEmail} onChange={(e) => setEditContactEmail(e.target.value)} placeholder="guest@example.com" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Song Requests</label>
                        <Input value={editSongRequests} onChange={(e) => setEditSongRequests(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Dietary Notes</label>
                        <Textarea rows={2} value={editDietaryNotes} onChange={(e) => setEditDietaryNotes(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Message for the Couple</label>
                        <Textarea rows={3} value={editMessage} onChange={(e) => setEditMessage(e.target.value)} />
                      </div>

                      {editAttending === 'yes' && selectedInvitation.guests.length > 0 && (
                        <p className="text-xs text-gray-500">
                          Total attending: {derivedCount} {derivedCount === 1 ? 'guest' : 'guests'} (computed from selections above).
                        </p>
                      )}
                    </>
                  );
                })()
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
                      <p>{parseList(selectedInvitation.response.attendingGuests)
                        .map((id) => selectedInvitation.guests.find((g) => g.id === id)?.name || id)
                        .join(', ')}</p>
                    </div>
                  )}
                  {(() => {
                    let pluses: { name: string; meal: string }[] = [];
                    try { pluses = JSON.parse(selectedInvitation.response.plusOnes || '[]'); } catch {}
                    return pluses.length > 0 ? (
                      <div>
                        <p className="text-sm font-medium text-gray-500">Plus-ones</p>
                        {pluses.map((p, i) => (
                          <p key={i} className="text-sm">{p.name}{p.meal && <span className="text-gray-500"> — {p.meal}</span>}</p>
                        ))}
                      </div>
                    ) : null;
                  })()}
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
                      {Object.entries(parseJson(selectedInvitation.response.guestMeals)).map(([guestId, meal]) => (
                        <p key={guestId} className="text-sm"><span className="font-medium">{selectedInvitation.guests.find((g) => g.id === guestId)?.name || guestId}:</span> {meal}</p>
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
                  {(selectedInvitation.mailingAddress1 || selectedInvitation.mailingCity || selectedInvitation.mailingPostalCode) && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Mailing Address</p>
                      <p className="text-sm whitespace-pre-line">
                        {[selectedInvitation.mailingAddress1, selectedInvitation.mailingAddress2].filter(Boolean).join('\n')}
                        {(selectedInvitation.mailingAddress1 || selectedInvitation.mailingAddress2) && '\n'}
                        {[selectedInvitation.mailingCity, selectedInvitation.mailingState].filter(Boolean).join(', ')}
                        {selectedInvitation.mailingPostalCode ? ` ${selectedInvitation.mailingPostalCode}` : ''}
                      </p>
                    </div>
                  )}
                  {selectedInvitation.contactEmail && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">Contact Email (for RSVP confirmation & day-of updates)</p>
                      <p className="text-sm">{selectedInvitation.contactEmail}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-500">Submitted</p>
                    <p className="text-sm">{new Date(selectedInvitation.response.submittedAt).toLocaleString()}</p>
                  </div>
                  {selectedInvitation.changeLogs && selectedInvitation.changeLogs.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-2">Change history</p>
                      <ul className="space-y-2 text-xs border-l-2 border-gray-200 pl-3">
                        {selectedInvitation.changeLogs.map((log) => {
                          const d = parseJson(log.details) as Record<string, unknown>;
                          const attending = d.attending === 'yes' ? 'Attending' : d.attending === 'no' ? 'Declined' : '—';
                          const count = typeof d.guestCount === 'number' ? d.guestCount : 0;
                          // attendingGuests stores guest IDs — resolve to names against the current guest list.
                          const ids = Array.isArray(d.attendingGuests) ? (d.attendingGuests as string[]) : null;
                          const names = ids ? ids.map((id) => selectedInvitation.guests.find((g) => g.id === id)?.name || id) : null;
                          return (
                            <li key={log.id} className="space-y-0.5">
                              <p className="font-medium text-gray-700">
                                {new Date(log.createdAt).toLocaleString()} · <span className="text-gray-400">by {log.source}</span>
                              </p>
                              <p className="text-gray-600">
                                {attending}
                                {d.attending === 'yes' && ` · ${count} guest${count === 1 ? '' : 's'}`}
                                {names && names.length > 0 && ` · ${names.join(', ')}`}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
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
