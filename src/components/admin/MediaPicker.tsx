'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

interface Photo {
  id: string;
  url: string;
  caption: string | null;
  gallerySection: string | null;
}

type Tab = 'library' | 'upload';

interface Props {
  onSelect: (url: string, caption: string | null) => void;
  onClose: () => void;
  // When defined, uploaded images are tagged with this gallery section so
  // they show up in the Media Manager under that tab.
  uploadSection?: string;
}

export function MediaPicker({ onSelect, onClose, uploadSection = 'content' }: Props) {
  const [tab, setTab] = useState<Tab>('library');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch('/api/photos');
      if (res.ok) setPhotos(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const filtered = photos.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.caption || '').toLowerCase().includes(q) ||
      (p.gallerySection || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Insert Image</CardTitle>
            <div className="flex gap-1">
              <TabBtn active={tab === 'library'} onClick={() => setTab('library')}>Choose from Library</TabBtn>
              <TabBtn active={tab === 'upload'} onClick={() => setTab('upload')}>Upload New</TabBtn>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          {tab === 'library' ? (
            <LibraryView
              photos={filtered}
              allCount={photos.length}
              loading={loading}
              search={search}
              onSearchChange={setSearch}
              onPick={(p) => { onSelect(p.url, p.caption); onClose(); }}
            />
          ) : (
            <UploadView
              uploadSection={uploadSection}
              onUploaded={async (photo) => { onSelect(photo.url, photo.caption); onClose(); }}
            />
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
        active ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

function LibraryView({
  photos,
  allCount,
  loading,
  search,
  onSearchChange,
  onPick,
}: {
  photos: Photo[];
  allCount: number;
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  onPick: (p: Photo) => void;
}) {
  if (loading) return <p className="text-center py-8 text-gray-500">Loading...</p>;

  if (allCount === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No photos uploaded yet.</p>
        <p className="text-sm mt-1">Switch to &ldquo;Upload New&rdquo; to add one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by caption or section..."
        className="max-w-sm"
      />
      {photos.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No matches for &ldquo;{search}&rdquo;.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => onPick(photo)}
              className="group relative block aspect-square bg-gray-100 rounded overflow-hidden ring-2 ring-transparent hover:ring-primary transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.caption || ''} className="w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left">
                <p className="text-xs text-white truncate">{photo.caption || <span className="italic text-white/70">No caption</span>}</p>
                {photo.gallerySection && (
                  <p className="text-[10px] text-white/60">{photo.gallerySection}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UploadView({
  uploadSection,
  onUploaded,
}: {
  uploadSection: string;
  onUploaded: (photo: Photo) => Promise<void>;
}) {
  const [mode, setMode] = useState<'file' | 'url'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      let finalUrl = url;
      if (mode === 'file' && file) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          const e = await res.json().catch(() => ({ error: 'Upload failed' }));
          alert(e.error || 'Upload failed');
          return;
        }
        finalUrl = (await res.json()).url;
      }
      if (!finalUrl) return;
      // Create a Photo row so the image appears in the Media Manager.
      const photoRes = await fetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: finalUrl,
          caption: caption.trim() || null,
          gallerySection: uploadSection,
        }),
      });
      if (!photoRes.ok) {
        alert('Image uploaded but could not be registered in Media.');
        return;
      }
      const photo = await photoRes.json();
      await onUploaded(photo);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 py-2">
      <div className="flex gap-2">
        <Button size="sm" variant={mode === 'file' ? 'primary' : 'outline'} onClick={() => setMode('file')}>Upload File</Button>
        <Button size="sm" variant={mode === 'url' ? 'primary' : 'outline'} onClick={() => setMode('url')}>URL</Button>
      </div>
      {mode === 'file' ? (
        <div>
          <label className="block text-sm font-medium mb-1">Image File</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90"
          />
          <p className="text-xs text-gray-500 mt-1">JPG, PNG, GIF, WebP, or HEIC — up to 10 MB. Saves to Media.</p>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium mb-1">Image URL</label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium mb-1">Caption (optional)</label>
        <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Describe this image" />
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={busy || (mode === 'file' ? !file : !url.trim())}>
          {busy ? 'Uploading...' : 'Insert'}
        </Button>
      </div>
    </div>
  );
}
