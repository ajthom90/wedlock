'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface EmailStatus {
  configured: boolean;
  host?: string;
  port?: string;
  user?: string;
  from?: string;
  publicSiteUrl?: string;
}

export default function EmailSettingsPage() {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [replyTo, setReplyTo] = useState('');
  const [savingReply, setSavingReply] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [statusRes, settingsRes] = await Promise.all([
        fetch('/api/email-settings/status'),
        fetch('/api/settings'),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setReplyTo(s.site?.replyToEmail || '');
      }
    })();
  }, []);

  const saveReplyTo = async () => {
    setSavingReply(true);
    setReplyMessage('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: { replyToEmail: replyTo.trim() } }),
      });
      setReplyMessage(res.ok ? 'Saved' : 'Save failed');
    } finally {
      setSavingReply(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/email-settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const data = await res.json();
      if (res.ok) setTestResult({ ok: true, message: 'Test email sent — check your inbox' });
      else setTestResult({ ok: false, message: data.error || 'Send failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Email Settings</h1>

      <Card>
        <CardHeader><CardTitle>SMTP configuration</CardTitle></CardHeader>
        <CardContent>
          {status ? (
            <div className="space-y-1 text-sm">
              <p>Status: {status.configured ? '✅ Configured' : '❌ Not configured — set SMTP_* env vars in your container'}</p>
              <p>Host: <span className="font-mono">{status.host || '—'}</span></p>
              <p>Port: <span className="font-mono">{status.port || '—'}</span></p>
              <p>User: <span className="font-mono">{status.user || '—'}</span></p>
              <p>From: <span className="font-mono">{status.from || '—'}</span></p>
              <p>Password: <span className="font-mono">••••••••</span> <span className="text-xs text-gray-500">(always masked)</span></p>
              <p>Public site URL: <span className="font-mono">{status.publicSiteUrl || '—'}</span> {!status.publicSiteUrl && <span className="text-red-600 text-xs">(required for RSVP confirmation magic links)</span>}</p>
            </div>
          ) : <p className="text-sm text-gray-500">Loading…</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Reply-to address</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">Where guest replies to your wedding emails will land.</p>
          <Input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="couple@example.com" />
          <div className="flex items-center gap-3">
            <Button onClick={saveReplyTo} disabled={savingReply}>{savingReply ? 'Saving…' : 'Save'}</Button>
            {replyMessage && <span className="text-sm">{replyMessage}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Send a test email</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">Verify your SMTP setup before relying on it. The test email uses the same themed wrapper as broadcasts and confirmations.</p>
          <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
          <div className="flex items-center gap-3">
            <Button onClick={sendTest} disabled={testing || !status?.configured || !testTo.trim()}>{testing ? 'Sending…' : 'Send test'}</Button>
            {testResult && <span className={`text-sm ${testResult.ok ? 'text-green-700' : 'text-red-700'}`}>{testResult.message}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
