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

export default function PhotosPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [gallerySection, setGallerySection] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch('/api/photos');
      if (res.ok) {
        const data = await res.json();
        setPhotos(data);
      }
    } catch (error) {
      console.error('Failed to fetch photos:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const resetForm = () => {
    setImageFile(null);
    setImageUrl('');
    setCaption('');
    setGallerySection('');
    setUploadMode('file');
  };

  const handleUpload = async () => {
    setUploading(true);
    try {
      let finalUrl = imageUrl;

      if (uploadMode === 'file' && imageFile) {
        const formData = new FormData();
        formData.append('file', imageFile);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!uploadRes.ok) return;
        const uploadData = await uploadRes.json();
        finalUrl = uploadData.url;
      }

      if (!finalUrl) return;

      const body = {
        url: finalUrl,
        caption: caption.trim() || null,
        gallerySection: gallerySection.trim() || null,
        order: photos.length,
      };

      const res = await fetch('/api/photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowModal(false);
        resetForm();
        await fetchPhotos();
      }
    } catch (error) {
      console.error('Failed to upload photo:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/photos/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteId(null);
        await fetchPhotos();
      }
    } catch (error) {
      console.error('Failed to delete photo:', error);
    }
  };

  const sections = Array.from(new Set(photos.filter((p) => p.gallerySection).map((p) => p.gallerySection!)));

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading photos...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Photos</h1>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>Add Photo</Button>
      </div>

      {photos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">No photos yet</CardContent>
        </Card>
      ) : (
        <>
          {sections.length > 0 && (
            <div className="text-sm text-gray-500">
              Sections: {sections.join(', ')}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.sort((a, b) => a.order - b.order).map((photo) => (
              <Card key={photo.id} className="overflow-hidden">
                <div className="aspect-square relative">
                  <img
                    src={photo.url}
                    alt={photo.caption || 'Photo'}
                    className="w-full h-full object-cover"
                  />
                </div>
                <CardContent className="py-3">
                  {photo.caption && <p className="text-sm font-medium truncate">{photo.caption}</p>}
                  {photo.gallerySection && (
                    <p className="text-xs text-gray-500">{photo.gallerySection}</p>
                  )}
                </CardContent>
                <CardFooter className="py-2">
                  <Button size="sm" variant="danger" onClick={() => setDeleteId(photo.id)} className="w-full">
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Upload Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Add Photo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={uploadMode === 'file' ? 'primary' : 'outline'}
                  onClick={() => setUploadMode('file')}
                >
                  Upload File
                </Button>
                <Button
                  size="sm"
                  variant={uploadMode === 'url' ? 'primary' : 'outline'}
                  onClick={() => setUploadMode('url')}
                >
                  URL
                </Button>
              </div>

              {uploadMode === 'file' ? (
                <div>
                  <label className="block text-sm font-medium mb-1">Image File</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1">Image URL</label>
                  <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Caption</label>
                <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Photo caption" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Gallery Section</label>
                <Input value={gallerySection} onChange={(e) => setGallerySection(e.target.value)} placeholder="e.g., Engagement, Ceremony" />
              </div>
            </CardContent>
            <CardFooter className="gap-2 justify-end">
              <Button variant="outline" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</Button>
              <Button
                onClick={handleUpload}
                disabled={uploading || (uploadMode === 'file' ? !imageFile : !imageUrl.trim())}
              >
                {uploading ? 'Uploading...' : 'Add Photo'}
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
              <p className="text-sm text-gray-600">Are you sure you want to delete this photo?</p>
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
