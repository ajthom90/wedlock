'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Textarea } from '@/components/ui';

interface BroadcastSummary {
  id: string;
  subject: string;
  sentAt: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
}

interface BroadcastDetail {
  id: string;
  subject: string;
  body: string;
  sentAt: string;
  deliveries: Array<{
    id: string;
    emailAddress: string;
    status: string;
    errorMessage: string | null;
    invitation: { householdName: string };
  }>;
}

export default function BroadcastsPage() {
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);
  const [history, setHistory] = useState<BroadcastSummary[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<BroadcastDetail | null>(null);

  const refresh = async () => {
    // /api/invitations returns the full row including contactEmail; filter client-side.
    const [statusRes, recipientsRes, historyRes] = await Promise.all([
      fetch('/api/email-settings/status'),
      fetch('/api/invitations'),
      fetch('/api/broadcasts'),
    ]);
    if (statusRes.ok) setSmtpConfigured((await statusRes.json()).configured);
    if (recipientsRes.ok) {
      const list = await recipientsRes.json();
      setRecipientCount(Array.isArray(list) ? list.filter((i: any) => i.contactEmail).length : 0);
    }
    if (historyRes.ok) setHistory(await historyRes.json());
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!expanded) { setDetail(null); return; }
    fetch(`/api/broadcasts/${expanded}`).then((r) => r.ok ? r.json() : null).then(setDetail);
  }, [expanded]);

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Send failed');
        return;
      }
      setSubject('');
      setBody('');
      setConfirming(false);
      await refresh();
    } finally {
      setSending(false);
    }
  };

  const canSend = smtpConfigured && recipientCount > 0 && subject.trim() && body.trim();

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Broadcasts</h1>

      <Card>
        <CardHeader><CardTitle>Compose</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!smtpConfigured && <p className="text-sm text-red-700">SMTP is not configured — see Email Settings.</p>}
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea placeholder="Message body (plain text)" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="text-sm text-gray-600">Will send to {recipientCount} invitation{recipientCount === 1 ? '' : 's'} with a contact email on file.</p>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button disabled={!canSend} onClick={() => setConfirming(true)}>Send broadcast</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">No broadcasts sent yet.</p>
          ) : (
            <ul className="divide-y">
              {history.map((b) => (
                <li key={b.id} className="py-3">
                  <button className="text-left w-full" onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{b.subject}</span>
                      <span className="text-xs text-gray-500">{new Date(b.sentAt).toLocaleString()}</span>
                    </div>
                    <div className="text-sm">
                      {b.failedCount > 0
                        ? <span className="text-red-700">{b.sentCount} delivered, {b.failedCount} failed</span>
                        : <span>{b.sentCount} of {b.recipientCount} delivered</span>}
                    </div>
                  </button>
                  {expanded === b.id && detail && (
                    <div className="mt-3 pl-4 border-l-2 border-gray-200 space-y-3">
                      <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">{detail.body}</pre>
                      <table className="text-sm w-full">
                        <thead><tr className="text-left text-gray-500"><th>Household</th><th>Email</th><th>Status</th><th>Error</th></tr></thead>
                        <tbody>
                          {detail.deliveries.map((d) => (
                            <tr key={d.id} className="border-t">
                              <td>{d.invitation.householdName}</td>
                              <td className="font-mono text-xs">{d.emailAddress}</td>
                              <td className={d.status === 'failed' ? 'text-red-700' : ''}>{d.status}</td>
                              <td className="text-xs text-red-700">{d.errorMessage || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {confirming && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center" onClick={() => setConfirming(false)}>
          <Card className="max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader><CardTitle>Send broadcast?</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">This will send to {recipientCount} recipient{recipientCount === 1 ? '' : 's'}. Sending may take up to a minute.</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
                <Button onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
