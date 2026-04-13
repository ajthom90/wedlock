'use client';
import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, Button, Input, Textarea } from '@/components/ui';

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
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const lookupInvitation = async (c: string) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/rsvp?code=${encodeURIComponent(c)}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Invitation not found'); return; }
      setInvitation(data.invitation); setRsvpOptions(data.rsvpOptions || []); setSettings(data.settings || {}); setFeatures(data.features || {});
      if (data.invitation.response) {
        const r = data.invitation.response;
        setAttending(r.attending); setGuestCount(r.guestCount); setMessage(r.message || ''); setSongRequests(r.songRequests || ''); setDietaryNotes(r.dietaryNotes || '');
        try { setResponses(JSON.parse(r.responses || '{}')); } catch { setResponses({}); }
        try { setGuestMeals(JSON.parse(r.guestMeals || '{}')); } catch { setGuestMeals({}); }
        try { setAttendingGuests(JSON.parse(r.attendingGuests || '[]')); } catch { setAttendingGuests([]); }
      }
    } catch { setError('An error occurred. Please try again.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (codeFromUrl) lookupInvitation(codeFromUrl); }, [codeFromUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setSubmitError('');
    try {
      const res = await fetch('/api/rsvp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: invitation.code, attending, guestCount: attending === 'yes' ? (features.perGuestSelection ? attendingGuests.length : guestCount) : 0, responses, guestMeals: features.perGuestSelection ? guestMeals : undefined, attendingGuests: features.perGuestSelection ? attendingGuests : undefined, songRequests: features.songRequests ? songRequests : undefined, dietaryNotes: features.dietaryNotes ? dietaryNotes : undefined, message }) });
      const data = await res.json();
      if (res.ok) setSubmitted(true); else setSubmitError(data.error || 'Failed to submit RSVP');
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
      <p className="text-center text-foreground/70 mb-8">The {invitation.householdName} Household</p>
      <Card><CardContent className="py-8"><form onSubmit={handleSubmit} className="space-y-6">
        <div><p className="font-medium mb-3">Will you be attending?</p><div className="flex gap-4"><Button type="button" variant={attending === 'yes' ? 'primary' : 'outline'} onClick={() => setAttending('yes')}>Joyfully Accept</Button><Button type="button" variant={attending === 'no' ? 'primary' : 'outline'} onClick={() => setAttending('no')}>Regretfully Decline</Button></div></div>
        {attending === 'yes' && (<>
          {features.perGuestSelection && invitation.guests?.length > 0 ? (
            <div><p className="font-medium mb-3">Who will be attending?</p><div className="space-y-2">{invitation.guests.map((guest: any) => (
              <label key={guest.id} className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={attendingGuests.includes(guest.id)} onChange={() => toggleGuest(guest.id)} className="h-4 w-4" />
                <span>{guest.name}</span>
                {mealOption && attendingGuests.includes(guest.id) && <select className="ml-auto border rounded px-2 py-1 text-sm" value={guestMeals[guest.id] || ''} onChange={(e) => setGuestMeals({...guestMeals, [guest.id]: e.target.value})}><option value="">Select meal...</option>{mealOption.choices.map((c: string) => <option key={c} value={c}>{c}</option>)}</select>}
              </label>
            ))}</div></div>
          ) : <Input label="Number of Guests" type="number" min={1} max={invitation.maxGuests} value={guestCount || ''} onChange={(e) => setGuestCount(parseInt(e.target.value) || 0)} />}
          {rsvpOptions.filter((o: any) => o.type !== 'meal').map((option: any) => (<div key={option.id}><p className="font-medium mb-2">{option.label}</p><select className="w-full border rounded-md px-3 py-2" value={responses[option.id] || ''} onChange={(e) => setResponses({...responses, [option.id]: e.target.value})} required={option.required}><option value="">Select...</option>{option.choices.map((c: string) => <option key={c} value={c}>{c}</option>)}</select></div>))}
          {features.dietaryNotes && <Textarea label="Dietary Restrictions or Allergies" value={dietaryNotes} onChange={(e) => setDietaryNotes(e.target.value)} placeholder="Let us know about any dietary needs..." rows={2} />}
          {features.songRequests && <Textarea label="Song Requests" value={songRequests} onChange={(e) => setSongRequests(e.target.value)} placeholder="Any songs you'd like to hear?" rows={2} />}
        </>)}
        {attending && <Textarea label="Message for the Couple (optional)" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Share your thoughts..." rows={3} />}
        {submitError && <p className="text-red-600 text-sm">{submitError}</p>}
        {attending && <Button type="submit" className="w-full" isLoading={submitting}>{invitation.response ? 'Update RSVP' : 'Submit RSVP'}</Button>}
      </form></CardContent></Card>
    </div></div>
  );
}

export default function RSVPPage() {
  return <Suspense fallback={<div className="container mx-auto px-4 py-16 text-center"><p>Loading...</p></div>}><RSVPForm /></Suspense>;
}
