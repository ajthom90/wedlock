'use client';

import { useState, FormEvent, useRef } from 'react';

export function GuestPhotoUpload() {
  const [name, setName] = useState('');
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Please select a photo to upload.');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('caption', caption);
      formData.append('file', file);

      const res = await fetch('/api/photos/guest-upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setSuccess(true);
        setName('');
        setCaption('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Upload failed. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="max-w-md mx-auto" aria-labelledby="photo-upload-heading">
      <h2
        id="photo-upload-heading"
        className="text-2xl font-heading font-semibold text-center mb-6"
      >
        Share a Photo
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="photo-name"
            className="block text-sm font-medium text-foreground/80 mb-1"
          >
            Your Name
          </label>
          <input
            id="photo-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-2 border border-foreground/20 rounded-md bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <div>
          <label
            htmlFor="photo-caption"
            className="block text-sm font-medium text-foreground/80 mb-1"
          >
            Caption (optional)
          </label>
          <input
            id="photo-caption"
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full px-4 py-2 border border-foreground/20 rounded-md bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <div>
          <label
            htmlFor="photo-file"
            className="block text-sm font-medium text-foreground/80 mb-1"
          >
            Photo
          </label>
          <input
            id="photo-file"
            type="file"
            accept="image/*"
            ref={fileInputRef}
            required
            className="w-full text-sm text-foreground/70 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        {error && (
          <p className="text-red-600 text-sm" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="text-green-600 text-sm" role="status">
            Photo submitted for review!
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white px-6 py-3 rounded-md font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {loading ? 'Uploading...' : 'Upload Photo'}
        </button>
      </form>
    </section>
  );
}
