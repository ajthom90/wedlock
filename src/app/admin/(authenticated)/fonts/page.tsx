'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

interface CustomFont {
  id: string;
  name: string;
  family: string;
  filename: string;
  format: string;
  createdAt: string;
}

const FONT_FORMATS: Record<string, string> = {
  woff: 'woff',
  woff2: 'woff2',
  ttf: 'truetype',
  otf: 'opentype',
};

export default function FontsPage() {
  const [fonts, setFonts] = useState<CustomFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [family, setFamily] = useState('');
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const fetchFonts = useCallback(async () => {
    try {
      const res = await fetch('/api/fonts');
      if (res.ok) {
        const data = await res.json();
        setFonts(data);
      }
    } catch (err) {
      console.error('Failed to fetch fonts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFonts();
  }, [fetchFonts]);

  const resetForm = () => {
    setName('');
    setFamily('');
    setFontFile(null);
    setError('');
  };

  const getFileExtension = (filename: string): string => {
    return filename.split('.').pop()?.toLowerCase() || '';
  };

  const handleUpload = async () => {
    if (!fontFile || !name.trim() || !family.trim()) return;

    const ext = getFileExtension(fontFile.name);
    if (!FONT_FORMATS[ext]) {
      setError('Unsupported font format. Please use woff, woff2, ttf, or otf.');
      return;
    }

    setUploading(true);
    setError('');
    try {
      // Upload the font file
      const formData = new FormData();
      formData.append('file', fontFile);
      formData.append('type', 'font');
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) {
        const uploadErr = await uploadRes.json();
        setError(uploadErr.error || 'Failed to upload font file');
        return;
      }
      const uploadData = await uploadRes.json();

      // Register the font
      const res = await fetch('/api/fonts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          family: family.trim(),
          filename: uploadData.filename,
          format: FONT_FORMATS[ext],
        }),
      });

      if (res.ok) {
        setShowModal(false);
        resetForm();
        await fetchFonts();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to register font');
      }
    } catch (err) {
      console.error('Failed to upload font:', err);
      setError('An error occurred during upload');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/fonts/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteId(null);
        await fetchFonts();
      }
    } catch (err) {
      console.error('Failed to delete font:', err);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading fonts...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Custom Fonts</h1>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>Upload Font</Button>
      </div>

      <p className="text-sm text-gray-500">
        Upload custom fonts to use in your theme. Supported formats: WOFF, WOFF2, TTF, OTF.
      </p>

      <div className="space-y-3">
        {fonts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">No custom fonts uploaded yet</CardContent>
          </Card>
        ) : (
          fonts.map((font) => (
            <Card key={font.id}>
              <CardContent className="py-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{font.name}</p>
                    <p className="text-sm text-gray-500">
                      Family: <span className="font-mono">{font.family}</span>
                    </p>
                    <p className="text-xs text-gray-400">
                      Format: {font.format} | File: {font.filename}
                    </p>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => setDeleteId(font.id)}>Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Upload Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Upload Custom Font</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Display Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., My Custom Script" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">CSS Family Name *</label>
                <Input value={family} onChange={(e) => setFamily(e.target.value)} placeholder="e.g., MyCustomScript" />
                <p className="text-xs text-gray-400 mt-1">The name used in CSS font-family declarations</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Font File *</label>
                <input
                  type="file"
                  accept=".woff,.woff2,.ttf,.otf"
                  onChange={(e) => setFontFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90"
                />
              </div>
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading || !name.trim() || !family.trim() || !fontFile}>
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Confirm Delete</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">Are you sure you want to delete this font? It will no longer be available for use in themes.</p>
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete}>Delete</Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
