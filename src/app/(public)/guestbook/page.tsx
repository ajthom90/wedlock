'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent, Button, Input, Textarea } from '@/components/ui';

export default function GuestBookPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  const fetchEntries = async () => {
    try {
      const res = await fetch('/api/guestbook');
      const data = await res.json();
      setEntries(data.entries || []);
      setEnabled(data.enabled !== false);
    } catch (err) { console.error('Error fetching entries:', err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEntries(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/guestbook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), message: message.trim() }) });
      const data = await res.json();
      if (res.ok) { setSubmitted(true); setPendingApproval(data.pendingApproval || false); setName(''); setMessage(''); if (!data.pendingApproval) fetchEntries(); }
      else setError(data.error || 'Failed to submit message');
    } catch { setError('An error occurred. Please try again.'); }
    finally { setSubmitting(false); }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) return <div className="container mx-auto px-4 py-16 text-center"><p>Loading...</p></div>;
  if (!enabled) return <div className="container mx-auto px-4 py-16 text-center"><h1 className="text-4xl font-heading font-bold text-primary mb-4">Guest Book</h1><p className="text-foreground/70">The guest book is not available at this time.</p></div>;

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-heading font-bold text-center text-primary mb-2">Guest Book</h1>
        <p className="text-center text-foreground/70 mb-12">Leave your well wishes for the happy couple</p>
        {submitted ? (
          <Card className="mb-12 bg-green-50 border-green-200">
            <CardContent className="py-8 text-center">
              <h2 className="text-xl font-bold text-green-800 mb-2">Thank You!</h2>
              <p className="text-green-700">{pendingApproval ? 'Your message has been submitted and is awaiting approval.' : 'Your message has been added to the guest book.'}</p>
              <Button variant="outline" className="mt-4" onClick={() => { setSubmitted(false); setPendingApproval(false); }}>Write Another Message</Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-12">
            <CardContent className="py-8">
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input label="Your Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" required maxLength={100} />
                <Textarea label="Your Message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Share your congratulations and well wishes..." rows={4} required maxLength={2000} />
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <Button type="submit" className="w-full" isLoading={submitting} disabled={!name.trim() || !message.trim()}>Sign Guest Book</Button>
              </form>
            </CardContent>
          </Card>
        )}
        <div className="space-y-6">
          {entries.length === 0 ? <div className="text-center text-foreground/60 py-8"><p>Be the first to sign the guest book!</p></div> : entries.map((entry: any) => (
            <Card key={entry.id}><CardContent className="py-6"><p className="text-foreground/90 whitespace-pre-wrap mb-4">&ldquo;{entry.message}&rdquo;</p><div className="flex justify-between items-center text-sm text-foreground/60"><span className="font-medium">&mdash; {entry.name}</span><span>{formatDate(entry.createdAt)}</span></div></CardContent></Card>
          ))}
        </div>
      </div>
    </div>
  );
}
