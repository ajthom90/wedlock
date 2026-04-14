'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { FocalPointEditor } from '@/components/admin/FocalPointEditor';
import { Framed } from '@/components/public/Framed';

interface BannerPhoto {
  id: string;
  url: string;
  caption: string | null;
  order: number;
  focalX: number;
  focalY: number;
  zoom: number;
}

type BannerStyle = 'hero' | 'strip';

function SortablePhoto({
  photo,
  onRemove,
  onCaptionChange,
  onEditFraming,
}: {
  photo: BannerPhoto;
  onRemove: (id: string) => void;
  onCaptionChange: (id: string, caption: string) => void;
  onEditFraming: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="relative group bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm"
    >
      <button
        type="button"
        className="absolute top-2 left-2 z-10 bg-gray-900/70 text-white rounded p-1.5 cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="6" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          type="button"
          onClick={() => onEditFraming(photo.id)}
          className="bg-gray-900/70 hover:bg-gray-900 text-white rounded p-1.5 transition-colors"
          aria-label="Edit framing"
          title="Edit framing"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onRemove(photo.id)}
          className="bg-red-600/90 hover:bg-red-700 text-white rounded p-1.5 transition-colors"
          aria-label="Remove from banner"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="w-full aspect-video overflow-hidden bg-gray-100">
        <Framed src={photo.url} alt={photo.caption || ''} focalX={photo.focalX} focalY={photo.focalY} zoom={photo.zoom} />
      </div>
      <div className="p-2">
        <Input
          value={photo.caption || ''}
          onChange={(e) => onCaptionChange(photo.id, e.target.value)}
          placeholder="Caption (optional)"
          className="text-xs"
        />
      </div>
    </div>
  );
}

export default function HomeBannerPage() {
  const [photos, setPhotos] = useState<BannerPhoto[]>([]);
  const [style, setStyle] = useState<BannerStyle>('strip');
  const [loading, setLoading] = useState(true);
  const [savingStyle, setSavingStyle] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Abort in-flight reorder requests when a newer drop arrives so rapid drags
  // don't race. The server state ends up matching the most recent UI state.
  const reorderAbortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [photosRes, settingsRes] = await Promise.all([
        fetch('/api/photos'),
        fetch('/api/settings'),
      ]);
      if (photosRes.ok) {
        const all = await photosRes.json();
        const banner = all
          .filter((p: BannerPhoto & { gallerySection: string | null }) => p.gallerySection === 'home-banner')
          .sort((a: BannerPhoto, b: BannerPhoto) => a.order - b.order);
        setPhotos(banner);
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.site?.homeBannerStyle) setStyle(data.site.homeBannerStyle);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStyleChange = async (next: BannerStyle) => {
    setStyle(next);
    setSavingStyle(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: { homeBannerStyle: next } }),
      });
    } finally {
      setSavingStyle(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = photos.findIndex((p) => p.id === active.id);
    const newIndex = photos.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(photos, oldIndex, newIndex).map((p, i) => ({ ...p, order: i }));
    setPhotos(reordered);

    // Cancel any prior in-flight reorder so the server always reflects the
    // most recent drop, not an older one that finishes later.
    reorderAbortRef.current?.abort();
    const controller = new AbortController();
    reorderAbortRef.current = controller;

    try {
      await fetch('/api/photos/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: reordered.map((p) => ({ id: p.id, order: p.order })) }),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Reorder failed', err);
      }
    }
  };

  const handleRemove = async (id: string) => {
    const previous = photos;
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    try {
      const res = await fetch(`/api/photos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gallerySection: null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error('Remove failed', err);
      // Roll back optimistic UI change so the admin isn't lied to.
      setPhotos(previous);
      alert('Could not remove photo from banner. Please try again.');
    }
  };

  const handleCaptionChange = (id: string, caption: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));
  };

  const [framingId, setFramingId] = useState<string | null>(null);
  const framingPhoto = framingId ? photos.find((p) => p.id === framingId) || null : null;

  const handleFramingSave = async (focal: { focalX: number; focalY: number; zoom: number }) => {
    if (!framingPhoto) return;
    setPhotos((prev) => prev.map((p) => (p.id === framingPhoto.id ? { ...p, ...focal } : p)));
    setFramingId(null);
    await fetch(`/api/photos/${framingPhoto.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(focal),
    });
  };

  const handleCaptionBlur = async (id: string) => {
    const photo = photos.find((p) => p.id === id);
    if (!photo) return;
    await fetch(`/api/photos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: photo.caption }),
    });
  };

  const addPhoto = async (url: string, caption: string) => {
    const maxOrder = photos.reduce((m, p) => Math.max(m, p.order), -1);
    const res = await fetch('/api/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        caption: caption || null,
        gallerySection: 'home-banner',
        order: maxOrder + 1,
      }),
    });
    if (!res.ok) return;
    await fetchData();
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading...</p></div>;

  return (
    <div className="space-y-6" onBlur={(e) => {
      const input = e.target as HTMLInputElement;
      if (input?.closest?.('[data-photo-id]')) {
        const id = input.closest('[data-photo-id]')?.getAttribute('data-photo-id');
        if (id) handleCaptionBlur(id);
      }
    }}>
      <div>
        <h1 className="text-3xl font-bold">Home Banner</h1>
        <p className="text-sm text-gray-500 mt-1">Photos shown at the top of your homepage.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Banner Style</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors ${style === 'strip' ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="homeBannerStyle"
                  value="strip"
                  checked={style === 'strip'}
                  onChange={() => handleStyleChange('strip')}
                  disabled={savingStyle}
                  className="h-4 w-4"
                />
                <span className="font-medium">Strip above text</span>
              </div>
              <svg viewBox="0 0 200 120" className="w-full" role="img" aria-label="Strip layout preview">
                <rect x="0" y="0" width="200" height="120" fill="#f9fafb" />
                <rect x="10" y="10" width="180" height="40" fill="#d1d5db" />
                <text x="100" y="75" textAnchor="middle" fontSize="10" fill="#374151">We&apos;re Getting Married</text>
                <text x="100" y="92" textAnchor="middle" fontSize="8" fill="#6b7280">[ RSVP Now ]</text>
              </svg>
              <p className="text-xs text-gray-500">Photos sit above the hero text in their own block.</p>
            </label>

            <label className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors ${style === 'hero' ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="homeBannerStyle"
                  value="hero"
                  checked={style === 'hero'}
                  onChange={() => handleStyleChange('hero')}
                  disabled={savingStyle}
                  className="h-4 w-4"
                />
                <span className="font-medium">Photo behind text</span>
              </div>
              <svg viewBox="0 0 200 120" className="w-full" role="img" aria-label="Hero layout preview">
                <rect x="0" y="0" width="200" height="120" fill="#d1d5db" />
                <rect x="0" y="0" width="200" height="120" fill="#000" opacity="0.3" />
                <text x="100" y="55" textAnchor="middle" fontSize="10" fill="#fff">We&apos;re Getting Married</text>
                <text x="100" y="75" textAnchor="middle" fontSize="8" fill="#fff">[ RSVP Now ]</text>
              </svg>
              <p className="text-xs text-gray-500">Photos fill the hero with text overlaid on top.</p>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Banner Photos</CardTitle>
            <Button onClick={() => setShowUpload(true)}>+ Add Photo</Button>
          </div>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
              <p className="text-gray-500 mb-4">No banner photos yet.</p>
              <Button onClick={() => setShowUpload(true)}>Upload first photo</Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">
                Drag the handle on any photo to reorder. Photos cross-fade on the homepage in this order.
              </p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {photos.map((photo) => (
                      <div key={photo.id} data-photo-id={photo.id}>
                        <SortablePhoto photo={photo} onRemove={handleRemove} onCaptionChange={handleCaptionChange} onEditFraming={setFramingId} />
                      </div>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </>
          )}
        </CardContent>
      </Card>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onAdd={addPhoto} />}
      {framingPhoto && (
        <FramingModal
          photo={framingPhoto}
          onSave={handleFramingSave}
          onClose={() => setFramingId(null)}
        />
      )}
    </div>
  );
}

function FramingModal({
  photo,
  onSave,
  onClose,
}: {
  photo: BannerPhoto;
  onSave: (focal: { focalX: number; focalY: number; zoom: number }) => Promise<void>;
  onClose: () => void;
}) {
  const [focal, setFocal] = useState({ focalX: photo.focalX, focalY: photo.focalY, zoom: photo.zoom });
  const [saving, setSaving] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader><CardTitle>Edit Framing</CardTitle></CardHeader>
        <CardContent>
          <FocalPointEditor src={photo.url} value={focal} onChange={setFocal} />
        </CardContent>
        <CardFooter className="gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={async () => {
              setSaving(true);
              try { await onSave(focal); } finally { setSaving(false); }
            }}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function UploadModal({ onClose, onAdd }: { onClose: () => void; onAdd: (url: string, caption: string) => Promise<void> }) {
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
      await onAdd(finalUrl, caption);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Add Banner Photo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <p className="text-xs text-gray-500 mt-1">JPG, PNG, GIF, WebP, or HEIC — up to 10 MB.</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1">Image URL</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Caption (optional)</label>
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Alt text for screen readers" />
          </div>
        </CardContent>
        <CardFooter className="gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || (mode === 'file' ? !file : !url.trim())}>
            {busy ? 'Uploading...' : 'Add Photo'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
