'use client';

import { useState } from 'react';

export function WallUploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setFile(null);
    setCaption('');
    setError('');
    setSubmitted(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim()) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', name.trim());
      fd.append('caption', caption.trim());
      fd.append('target', 'wall');
      const res = await fetch('/api/photos/guest-upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upload failed');
        return;
      }
      setSubmitted(true);
    } finally {
      setUploading(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 text-center">
        <p className="text-3xl mb-2">🎉</p>
        <p className="font-medium text-lg mb-1">Uploaded!</p>
        <p className="text-foreground/70 text-sm mb-4">Your photo is on the wall now.</p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-white text-sm font-medium hover:bg-primary/90"
        >
          Add another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Your name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-base"
          required
          autoComplete="name"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Photo</label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm"
          required
        />
        <p className="text-xs text-foreground/60 mt-1">Your phone camera works great.</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Caption (optional)</label>
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-base"
          placeholder="What's happening?"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={uploading || !file || !name.trim()}
        className="w-full rounded-md bg-primary px-4 py-3 text-white font-medium disabled:opacity-50 hover:bg-primary/90"
      >
        {uploading ? 'Uploading...' : 'Share this photo'}
      </button>
    </form>
  );
}
