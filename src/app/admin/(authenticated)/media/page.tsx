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
  order: number;
}

const BUILTIN_SECTIONS = [
  { value: 'home-banner', label: 'Home Banner' },
  { value: 'us', label: 'Our Story' },
  { value: 'content', label: 'Content' },
  { value: 'gallery', label: 'Gallery' },
];

export default function MediaPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [editing, setEditing] = useState<Photo | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch('/api/photos');
      if (res.ok) {
        setPhotos(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const handleDelete = async (id: string) => {
    await fetch(`/api/photos/${id}`, { method: 'DELETE' });
    setDeleteId(null);
    await fetchPhotos();
  };

  const saveEdit = async (updated: Photo) => {
    await fetch(`/api/photos/${updated.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption: updated.caption,
        gallerySection: updated.gallerySection,
      }),
    });
    setEditing(null);
    await fetchPhotos();
  };

  const sectionCounts = photos.reduce<Record<string, number>>((acc, p) => {
    const key = p.gallerySection ?? 'unsorted';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const customSections = Array.from(
    new Set(
      photos
        .map((p) => p.gallerySection)
        .filter((s): s is string => !!s && !BUILTIN_SECTIONS.some((b) => b.value === s)),
    ),
  );

  const filteredPhotos = photos
    .filter((p) => {
      if (filter === 'all') return true;
      if (filter === 'unsorted') return !p.gallerySection;
      return p.gallerySection === filter;
    })
    .sort((a, b) => a.order - b.order);

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading media...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Media</h1>
          <p className="text-sm text-gray-500 mt-1">All photos uploaded for the site. Click any photo to edit.</p>
        </div>
        <Button onClick={() => setShowUpload(true)}>+ Upload</Button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        <FilterTab label="All" count={photos.length} active={filter === 'all'} onClick={() => setFilter('all')} />
        {BUILTIN_SECTIONS.map((s) => (
          <FilterTab
            key={s.value}
            label={s.label}
            count={sectionCounts[s.value] || 0}
            active={filter === s.value}
            onClick={() => setFilter(s.value)}
          />
        ))}
        {customSections.map((s) => (
          <FilterTab
            key={s}
            label={s}
            count={sectionCounts[s] || 0}
            active={filter === s}
            onClick={() => setFilter(s)}
          />
        ))}
        <FilterTab
          label="Unsorted"
          count={sectionCounts.unsorted || 0}
          active={filter === 'unsorted'}
          onClick={() => setFilter('unsorted')}
        />
      </div>

      {filteredPhotos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            {filter === 'all' ? 'No photos yet. Click Upload to add one.' : `No photos in "${filter}".`}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filteredPhotos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              onEdit={() => setEditing(photo)}
              onDelete={() => setDeleteId(photo.id)}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditPhotoModal
          photo={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
          customSections={customSections}
        />
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onDone={async () => {
            setShowUpload(false);
            await fetchPhotos();
          }}
          customSections={customSections}
        />
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader><CardTitle>Delete photo?</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-gray-600">This removes the photo from the database. The file itself stays on disk.</p></CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => handleDelete(deleteId)}>Delete</Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}

function FilterTab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {label} <span className="text-xs text-gray-400">({count})</span>
    </button>
  );
}

function PhotoCard({ photo, onEdit, onDelete }: { photo: Photo; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className="overflow-hidden group">
      <button type="button" onClick={onEdit} className="block w-full aspect-square relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={photo.caption || ''} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          <span className="text-white opacity-0 group-hover:opacity-100 text-sm font-medium">Edit</span>
        </div>
      </button>
      <CardContent className="py-3 space-y-1">
        <p className="text-sm font-medium truncate">
          {photo.caption || <span className="text-gray-400 italic">No caption</span>}
        </p>
        <p className="text-xs text-gray-500">{photo.gallerySection || 'unsorted'}</p>
      </CardContent>
      <CardFooter className="py-2 gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={onEdit}>Edit</Button>
        <Button size="sm" variant="danger" onClick={onDelete}>Delete</Button>
      </CardFooter>
    </Card>
  );
}

function EditPhotoModal({
  photo,
  onClose,
  onSave,
  customSections,
}: {
  photo: Photo;
  onClose: () => void;
  onSave: (updated: Photo) => Promise<void>;
  customSections: string[];
}) {
  const [caption, setCaption] = useState(photo.caption || '');
  const [sectionMode, setSectionMode] = useState<'preset' | 'custom' | 'none'>(() => {
    if (!photo.gallerySection) return 'none';
    if (BUILTIN_SECTIONS.some((b) => b.value === photo.gallerySection)) return 'preset';
    return 'custom';
  });
  const [presetSection, setPresetSection] = useState(
    BUILTIN_SECTIONS.some((b) => b.value === photo.gallerySection)
      ? photo.gallerySection!
      : BUILTIN_SECTIONS[0].value,
  );
  const [customSection, setCustomSection] = useState(
    !BUILTIN_SECTIONS.some((b) => b.value === photo.gallerySection) ? photo.gallerySection || '' : '',
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      let gallerySection: string | null = null;
      if (sectionMode === 'preset') gallerySection = presetSection;
      else if (sectionMode === 'custom') gallerySection = customSection.trim() || null;
      await onSave({ ...photo, caption: caption.trim() || null, gallerySection });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader><CardTitle>Edit Photo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="aspect-video bg-gray-100 rounded overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.caption || ''} className="w-full h-full object-contain" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Caption</label>
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Describe this photo" />
            <p className="text-xs text-gray-500 mt-1">Used as alt text for screen readers and shown under the photo on public pages.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Gallery Section</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="sectionMode"
                  checked={sectionMode === 'preset'}
                  onChange={() => setSectionMode('preset')}
                  className="h-4 w-4"
                />
                <span className="text-sm">Preset:</span>
                <select
                  value={presetSection}
                  onChange={(e) => setPresetSection(e.target.value)}
                  onFocus={() => setSectionMode('preset')}
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                >
                  {BUILTIN_SECTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="sectionMode"
                  checked={sectionMode === 'custom'}
                  onChange={() => setSectionMode('custom')}
                  className="h-4 w-4"
                />
                <span className="text-sm">Custom:</span>
                <Input
                  value={customSection}
                  onChange={(e) => {
                    setCustomSection(e.target.value);
                    setSectionMode('custom');
                  }}
                  onFocus={() => setSectionMode('custom')}
                  placeholder="e.g. engagement"
                  className="flex-1 max-w-xs"
                  list="existing-sections"
                />
                {customSections.length > 0 && (
                  <datalist id="existing-sections">
                    {customSections.map((s) => <option key={s} value={s} />)}
                  </datalist>
                )}
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="sectionMode"
                  checked={sectionMode === 'none'}
                  onChange={() => setSectionMode('none')}
                  className="h-4 w-4"
                />
                <span className="text-sm">Unsorted (not shown on any public page)</span>
              </label>
            </div>
          </div>
        </CardContent>
        <CardFooter className="gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function UploadModal({
  onClose,
  onDone,
  customSections,
}: {
  onClose: () => void;
  onDone: () => Promise<void>;
  customSections: string[];
}) {
  const [mode, setMode] = useState<'file' | 'url'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [section, setSection] = useState('gallery');
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
      await fetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: finalUrl,
          caption: caption.trim() || null,
          gallerySection: section.trim() || null,
        }),
      });
      await onDone();
    } finally {
      setBusy(false);
    }
  };

  const allSections = Array.from(new Set([...BUILTIN_SECTIONS.map((s) => s.value), ...customSections]));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader><CardTitle>Upload Photo</CardTitle></CardHeader>
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
              <p className="text-xs text-gray-500 mt-1">JPG, PNG, GIF, WebP, or HEIC — up to 10 MB. HEIC files are converted to JPG automatically.</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1">Image URL</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Caption</label>
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Describe this photo" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Gallery Section</label>
            <Input
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="e.g. gallery"
              list="upload-sections"
            />
            <datalist id="upload-sections">
              {allSections.map((s) => <option key={s} value={s} />)}
            </datalist>
            <p className="text-xs text-gray-500 mt-1">
              Presets: <code className="bg-gray-100 px-1 rounded">home-banner</code>, <code className="bg-gray-100 px-1 rounded">us</code>, <code className="bg-gray-100 px-1 rounded">gallery</code>. Or type any name.
            </p>
          </div>
        </CardContent>
        <CardFooter className="gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || (mode === 'file' ? !file : !url.trim())}>
            {busy ? 'Uploading...' : 'Upload'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
