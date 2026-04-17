'use client';
import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, Button, Input, Textarea } from '@/components/ui';

type Guest = { id: string; name: string; isPrimary: boolean };
type PlusOne = { name: string; meal: string };
type RsvpChoice = { name: string; description?: string };

function RSVPForm() {
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get('code') || '';
  const [code, setCode] = useState(codeFromUrl);
  const [invitation, setInvitation] = useState<any>(null);
  const [rsvpOptions, setRsvpOptions] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [features, setFeatures] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attending, setAttending] = useState('');
  const [guestCount, setGuestCount] = useState(0);
  const [attendingGuests, setAttendingGuests] = useState<string[]>([]);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [guestMeals, setGuestMeals] = useState<Record<string, string>>({});
  const [songRequests, setSongRequests] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [message, setMessage] = useState('');
  const [address, setAddress] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  // Validation errors live separately from submit errors so "pick at least one
  // guest" doesn't disappear the moment the network error clears and vice-versa.
  const [validationError, setValidationError] = useState('');
  const [missingMeals, setMissingMeals] = useState<string[]>([]);
  const [plusOnes, setPlusOnes] = useState<PlusOne[]>([]);
  const [missingPlusOneMeals, setMissingPlusOneMeals] = useState<number[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

  const lookupInvitation = async (c: string) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/rsvp?code=${encodeURIComponent(c)}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Invitation not found'); return; }
      setInvitation(data.invitation); setRsvpOptions(data.rsvpOptions || []); setSettings(data.settings || {}); setFeatures(data.features || {});
      setAddress(data.invitation.address || '');
      setContactEmail(data.invitation.contactEmail || '');
      const slotCount = data.invitation.plusOnesAllowed || 0;
      const emptySlots = Array.from({ length: slotCount }, () => ({ name: '', meal: '' }));
      if (data.invitation.response) {
        const r = data.invitation.response;
        setAttending(r.attending); setGuestCount(r.guestCount); setMessage(r.message || ''); setSongRequests(r.songRequests || ''); setDietaryNotes(r.dietaryNotes || '');
        try { setResponses(JSON.parse(r.responses || '{}')); } catch { setResponses({}); }
        try { setGuestMeals(JSON.parse(r.guestMeals || '{}')); } catch { setGuestMeals({}); }
        try { setAttendingGuests(JSON.parse(r.attendingGuests || '[]')); } catch { setAttendingGuests([]); }
        try {
          const loaded: PlusOne[] = JSON.parse(r.plusOnes || '[]');
          setPlusOnes(emptySlots.map((slot, i) => loaded[i] ? { name: loaded[i].name || '', meal: loaded[i].meal || '' } : slot));
        } catch { setPlusOnes(emptySlots); }
      } else {
        setPlusOnes(emptySlots);
      }
    } catch { setError('An error occurred. Please try again.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (codeFromUrl) lookupInvitation(codeFromUrl); }, [codeFromUrl]);

  // Two-step submit: clicking "Submit RSVP" validates then opens a confirmation
  // modal. Only the modal's Confirm button actually POSTs. Accepting while
  // marking zero attendees is rejected — that's almost always a user mistake
  // (they meant to decline).
  // Clicking Decline clears every attendance-specific field so a stale list of
  // checkboxes/meal choices from a prior accept doesn't ride along into the
  // submission. Dietary/song/message/address are kept — they're informational.
  const declineRsvp = () => {
    setAttending('no');
    setAttendingGuests([]); setGuestMeals({}); setResponses({});
    setMissingMeals([]); setMissingPlusOneMeals([]);
    setPlusOnes((prev) => prev.map(() => ({ name: '', meal: '' })));
    setValidationError('');
  };

  const updatePlusOne = (idx: number, patch: Partial<PlusOne>) =>
    setPlusOnes((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault(); setValidationError('');
    if (attending === 'yes') {
      const namedPlusOnes = plusOnes.filter((p) => p.name.trim());
      const count = features.perGuestSelection
        ? attendingGuests.length + namedPlusOnes.length
        : guestCount;
      if (count < 1) {
        setValidationError(features.perGuestSelection
          ? 'Please select at least one person who is attending, or choose Regretfully Decline.'
          : 'Please enter at least one guest, or choose Regretfully Decline.');
        return;
      }
      const mealOpt = rsvpOptions.find((o: any) => o.type === 'meal');
      if (features.perGuestSelection && mealOpt?.required) {
        const missing = attendingGuests.filter((id) => !guestMeals[id]);
        const missingPlus = plusOnes.map((p, i) => (p.name.trim() && !p.meal ? i : -1)).filter((i) => i >= 0);
        if (missing.length > 0 || missingPlus.length > 0) {
          const regularNames = missing.map((id) => invitation.guests.find((g: any) => g.id === id)?.name || id);
          const plusNames = missingPlus.map((i) => plusOnes[i].name.trim());
          setValidationError(`Please select a meal choice for: ${[...regularNames, ...plusNames].join(', ')}.`);
          setMissingMeals(missing); setMissingPlusOneMeals(missingPlus);
          return;
        }
      }
      setMissingMeals([]); setMissingPlusOneMeals([]);
    }
    setShowConfirm(true);
  };

  const confirmSubmit = async () => {
    setSubmitting(true); setSubmitError('');
    try {
      const namedPlusOnes = plusOnes.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), meal: p.meal }));
      const totalAttending = features.perGuestSelection ? attendingGuests.length + namedPlusOnes.length : guestCount;
      const res = await fetch('/api/rsvp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: invitation.code, attending, guestCount: attending === 'yes' ? totalAttending : 0, responses: attending === 'yes' ? responses : {}, guestMeals: attending === 'yes' && features.perGuestSelection ? guestMeals : undefined, attendingGuests: attending === 'yes' && features.perGuestSelection ? attendingGuests : undefined, plusOnes: attending === 'yes' ? namedPlusOnes : [], songRequests: features.songRequests ? songRequests : undefined, dietaryNotes: features.dietaryNotes ? dietaryNotes : undefined, message, address: address.trim() || undefined, contactEmail }) });
      const data = await res.json();
      if (res.ok) { setShowConfirm(false); setSubmitted(true); }
      else setSubmitError(data.error || 'Failed to submit RSVP');
    } catch { setSubmitError('An error occurred. Please try again.'); }
    finally { setSubmitting(false); }
  };

  const isDeadlinePassed = () => { if (!settings.rsvpDeadline || !settings.rsvpCloseAfterDeadline) return false; const d = new Date(settings.rsvpDeadline); d.setHours(23,59,59,999); return new Date() > d; };
  const toggleGuest = (id: string) => setAttendingGuests(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);

  if (submitted) return <div className="container mx-auto px-4 py-16"><div className="max-w-xl mx-auto text-center"><h1 className="text-4xl font-heading font-bold text-primary mb-4">Thank You!</h1><p className="text-foreground/70 mb-8">{attending === 'yes' ? "We can't wait to celebrate with you!" : 'We will miss you! Thank you for letting us know.'}</p><Button onClick={() => { setSubmitted(false); lookupInvitation(invitation.code); }}>Update Response</Button></div></div>;

  if (!invitation) return (
    <div className="container mx-auto px-4 py-16"><div className="max-w-md mx-auto"><h1 className="text-4xl font-heading font-bold text-center text-primary mb-8">RSVP</h1><Card><CardContent className="py-8"><form onSubmit={(e) => { e.preventDefault(); if (code.trim()) lookupInvitation(code.trim()); }} className="space-y-4"><Input label="Invitation Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter your invitation code" required />{error && <p className="text-red-600 text-sm">{error}</p>}<Button type="submit" className="w-full" isLoading={loading}>Find Invitation</Button></form></CardContent></Card></div></div>
  );

  if (isDeadlinePassed()) return <div className="container mx-auto px-4 py-16 text-center"><h1 className="text-4xl font-heading font-bold text-primary mb-4">RSVP Closed</h1><p className="text-foreground/70">The RSVP deadline has passed. Please contact us directly if you need to make changes.</p></div>;

  const mealOption = rsvpOptions.find((o: any) => o.type === 'meal');

  return (
    <div className="container mx-auto px-4 py-16"><div className="max-w-xl mx-auto">
      <h1 className="text-4xl font-heading font-bold text-center text-primary mb-2">RSVP</h1>
      <p className="text-center text-foreground/70 mb-8">{/^the\s/i.test(invitation.householdName) ? '' : 'The '}{invitation.householdName} Household</p>
      <Card><CardContent className="py-8"><form onSubmit={handleReview} className="space-y-6">
        <div><p className="font-medium mb-3">Will you be attending?</p><div className="flex gap-4"><Button type="button" variant={attending === 'yes' ? 'primary' : 'outline'} onClick={() => setAttending('yes')}>Joyfully Accept</Button><Button type="button" variant={attending === 'no' ? 'primary' : 'outline'} onClick={declineRsvp}>Regretfully Decline</Button></div></div>
        {attending === 'yes' && (<>
          {mealOption && mealOption.choices.some((c: RsvpChoice) => c.description) && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
              <p className="font-medium mb-2">Dinner menu</p>
              <ul className="space-y-2">
                {mealOption.choices.map((c: RsvpChoice) => (
                  <li key={c.name} className="text-sm">
                    <span className="font-medium">{c.name}</span>
                    {c.description && <span className="text-foreground/70"> — {c.description}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {features.perGuestSelection && invitation.guests?.length > 0 ? (
            <div><p className="font-medium mb-3">Who will be attending?</p><div className="space-y-2">{invitation.guests.map((guest: any) => (
              <label key={guest.id} className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={attendingGuests.includes(guest.id)} onChange={() => toggleGuest(guest.id)} className="h-4 w-4" />
                <span>{guest.name}</span>
                {mealOption && attendingGuests.includes(guest.id) && <select className={`ml-auto border rounded px-2 py-1 text-sm ${missingMeals.includes(guest.id) ? 'border-red-500 ring-2 ring-red-500' : ''}`} value={guestMeals[guest.id] || ''} onChange={(e) => { setGuestMeals({...guestMeals, [guest.id]: e.target.value}); if (e.target.value) setMissingMeals(prev => prev.filter(id => id !== guest.id)); }}><option value="">Select meal...</option>{mealOption.choices.map((c: RsvpChoice) => <option key={c.name} value={c.name}>{c.name}</option>)}</select>}
              </label>
            ))}</div></div>
          ) : <Input label="Number of Guests" type="number" min={1} max={invitation.maxGuests} value={guestCount || ''} onChange={(e) => setGuestCount(parseInt(e.target.value) || 0)} />}
          {features.perGuestSelection && invitation.plusOnesAllowed > 0 && (
            <div>
              <p className="font-medium mb-1">Additional guests (up to {invitation.plusOnesAllowed})</p>
              <p className="text-sm text-foreground/60 mb-3">Enter a name for each extra guest you&apos;d like to bring. Leave blank if unused.</p>
              <div className="space-y-2">
                {plusOnes.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 border rounded-md">
                    <Input
                      value={p.name}
                      onChange={(e) => {
                        const v = e.target.value;
                        updatePlusOne(i, { name: v });
                        if (!v.trim()) setMissingPlusOneMeals((prev) => prev.filter((x) => x !== i));
                      }}
                      placeholder={`Extra guest ${i + 1} name`}
                    />
                    {mealOption && p.name.trim() && (
                      <select
                        className={`border rounded px-2 py-1 text-sm ${missingPlusOneMeals.includes(i) ? 'border-red-500 ring-2 ring-red-500' : ''}`}
                        value={p.meal}
                        onChange={(e) => {
                          updatePlusOne(i, { meal: e.target.value });
                          if (e.target.value) setMissingPlusOneMeals((prev) => prev.filter((x) => x !== i));
                        }}
                      >
                        <option value="">Select meal...</option>
                        {mealOption.choices.map((c: RsvpChoice) => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {rsvpOptions.filter((o: any) => o.type !== 'meal').map((option: any) => (
            <div key={option.id}>
              <p className="font-medium mb-2">{option.label}{option.required && ' *'}</p>
              {option.type === 'textarea' ? (
                <Textarea
                  value={responses[option.id] || ''}
                  onChange={(e) => setResponses({ ...responses, [option.id]: e.target.value })}
                  required={option.required}
                  rows={4}
                  placeholder="Type your answer…"
                />
              ) : (
                <select
                  className="w-full border rounded-md px-3 py-2"
                  value={responses[option.id] || ''}
                  onChange={(e) => setResponses({ ...responses, [option.id]: e.target.value })}
                  required={option.required}
                >
                  <option value="">Select...</option>
                  {option.choices.map((c: RsvpChoice) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              )}
            </div>
          ))}
          {features.dietaryNotes && <Textarea label="Dietary Restrictions or Allergies" value={dietaryNotes} onChange={(e) => setDietaryNotes(e.target.value)} placeholder="Let us know about any dietary needs..." rows={2} />}
          {features.songRequests && <Textarea label="Song Requests" value={songRequests} onChange={(e) => setSongRequests(e.target.value)} placeholder="Any songs you'd like to hear?" rows={2} />}
        </>)}
        {attending && features.rsvpAddress !== false && <Textarea label="Mailing address (optional — for save-the-dates and thank-you cards)" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Springfield, IL 62704" rows={2} />}
        {attending && (features.rsvpConfirmationEmails || features.dayOfBroadcasts) && (
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Stay in the loop (optional)</label>
            <p className="text-xs text-gray-600 mb-2">
              Want emails from us about your RSVP and day-of updates (ceremony timing, shuttle delays, etc.)?
              Drop an email here. Leave it blank if you&apos;d rather not hear from us.
            </p>
            <Input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        )}
        {attending && <Textarea label="Message for the Couple (optional)" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Share your thoughts..." rows={3} />}
        {validationError && <p className="text-red-600 text-sm">{validationError}</p>}
        {attending && <Button type="submit" className="w-full">{invitation.response ? 'Update RSVP' : 'Submit RSVP'}</Button>}
      </form></CardContent></Card>

      {showConfirm && <ConfirmModal
        invitation={invitation}
        attending={attending}
        guestCount={guestCount}
        attendingGuests={attendingGuests}
        guestMeals={guestMeals}
        plusOnes={plusOnes.filter((p) => p.name.trim())}
        perGuestSelection={features.perGuestSelection}
        submitting={submitting}
        submitError={submitError}
        onCancel={() => { setShowConfirm(false); setSubmitError(''); }}
        onConfirm={confirmSubmit}
      />}
    </div></div>
  );
}

function ConfirmModal({ invitation, attending, guestCount, attendingGuests, guestMeals, plusOnes, perGuestSelection, submitting, submitError, onCancel, onConfirm }: {
  invitation: { guests: Guest[]; response: unknown };
  attending: string;
  guestCount: number;
  attendingGuests: string[];
  guestMeals: Record<string, string>;
  plusOnes: PlusOne[];
  perGuestSelection: boolean;
  submitting: boolean;
  submitError: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const attendingSet = new Set(attendingGuests);
  const yes = invitation.guests.filter((g) => attendingSet.has(g.id));
  const no = invitation.guests.filter((g) => !attendingSet.has(g.id));
  const decliningAll = attending === 'no';
  const totalYes = yes.length + plusOnes.length;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-6 space-y-4">
          <h2 className="text-2xl font-heading font-semibold text-center">Confirm your RSVP</h2>
          <p className="text-center text-sm text-foreground/70">Please review your response before submitting.</p>
          {decliningAll ? (
            <div>
              <p className="text-sm font-medium text-foreground/80 mb-1">Regretfully declining</p>
              <p className="text-sm text-foreground/60">{invitation.guests.map((g) => g.name).join(', ') || 'Entire household'}</p>
            </div>
          ) : perGuestSelection ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-green-700 mb-1">Attending ({totalYes})</p>
                {totalYes > 0 ? (
                  <ul className="text-sm text-foreground/80 list-disc pl-5">
                    {yes.map((g) => <li key={g.id}>{g.name}{guestMeals[g.id] && <span className="text-foreground/60"> — {guestMeals[g.id]}</span>}</li>)}
                    {plusOnes.map((p, i) => <li key={`plus-${i}`}>{p.name}{p.meal && <span className="text-foreground/60"> — {p.meal}</span>} <span className="text-xs text-foreground/50">(plus-one)</span></li>)}
                  </ul>
                ) : <p className="text-sm text-foreground/50 italic">None selected</p>}
              </div>
              {no.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-red-700 mb-1">Not attending ({no.length})</p>
                  <ul className="text-sm text-foreground/80 list-disc pl-5">
                    {no.map((g) => <li key={g.id}>{g.name}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-green-700 mb-1">Attending</p>
              <p className="text-sm text-foreground/80">{guestCount} {guestCount === 1 ? 'guest' : 'guests'}</p>
            </div>
          )}
          {submitError && <p className="text-red-600 text-sm text-center">{submitError}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={submitting}>Go back</Button>
            <Button type="button" className="flex-1" onClick={onConfirm} isLoading={submitting}>Confirm &amp; submit</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RSVPPage() {
  return <Suspense fallback={<div className="container mx-auto px-4 py-16 text-center"><p>Loading...</p></div>}><RSVPForm /></Suspense>;
}
