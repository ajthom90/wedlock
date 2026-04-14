'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface WallPhoto {
  id: string;
  url: string;
  caption: string | null;
  uploadedBy: string | null;
  approved: boolean;
  createdAt: string;
}

export default function PhotoWallPage() {
  const [qr, setQr] = useState<{ qrCode: string; uploadUrl: string } | null>(null);
  const [photos, setPhotos] = useState<WallPhoto[]>([]);
  const [guestUploadEnabled, setGuestUploadEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [qrRes, photosRes, featRes] = await Promise.all([
        fetch('/api/photos/wall/qr'),
        fetch('/api/photos'),
        fetch('/api/settings'),
      ]);
      if (qrRes.ok) setQr(await qrRes.json());
      if (photosRes.ok) {
        const all: WallPhoto[] = await photosRes.json();
        // Only show wall-tagged photos; most recent first.
        setPhotos(
          all
            .filter((p: WallPhoto & { gallerySection?: string | null }) => p.gallerySection === 'wall')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        );
      }
      if (featRes.ok) {
        const data = await featRes.json();
        setGuestUploadEnabled(!!data.features?.guestPhotoUpload);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleGuestUpload = async () => {
    setToggling(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: { guestPhotoUpload: !guestUploadEnabled } }),
      });
      setGuestUploadEnabled(!guestUploadEnabled);
    } finally {
      setToggling(false);
    }
  };

  const toggleApproval = async (photo: WallPhoto) => {
    await fetch(`/api/photos/${photo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: !photo.approved }),
    });
    await fetchAll();
  };

  const deletePhoto = async (id: string) => {
    if (!confirm('Delete this photo from the wall?')) return;
    await fetch(`/api/photos/${id}`, { method: 'DELETE' });
    await fetchAll();
  };

  if (loading) return <div className="flex justify-center py-12"><p className="text-gray-500">Loading photo wall...</p></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Photo Wall</h1>
        <p className="text-sm text-gray-500 mt-1">
          Live-updating gallery for the reception. Guests scan a QR code, upload, and their photo appears on the big screen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Guest uploads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={guestUploadEnabled}
                onChange={toggleGuestUpload}
                disabled={toggling}
                className="h-5 w-5 rounded border-gray-300"
              />
              <span className="font-medium">Allow guests to upload photos</span>
            </label>
            <span className={`text-sm ${guestUploadEnabled ? 'text-green-600' : 'text-gray-500'}`}>
              {guestUploadEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Must be on for the QR code below to work. Wall uploads auto-approve; other guest uploads go into a moderation queue on the Media page.
          </p>
        </CardContent>
      </Card>

      {qr && (
        <Card>
          <CardHeader>
            <CardTitle>QR code for the reception</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row items-center gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.qrCode} alt="QR code" className="w-64 h-64 border rounded-lg" />
            <div className="flex-1 space-y-3 text-sm">
              <p>
                <strong>Print this QR code</strong> and place it on tables or slides at the reception. Guests scan it with their phone&apos;s camera to upload photos directly to the wall.
              </p>
              <p className="text-gray-600">
                Direct link: <a href={qr.uploadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{qr.uploadUrl}</a>
              </p>
              <p>
                <strong>Open the wall on a TV:</strong>{' '}
                <a href="/wall" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  /wall
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-xl font-semibold mb-3">Recent uploads ({photos.length})</h2>
        {photos.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">No wall uploads yet.</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((photo) => (
              <div key={photo.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <div className={`aspect-square relative ${photo.approved ? '' : 'opacity-60'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.caption || ''} className="w-full h-full object-cover" />
                  {!photo.approved && (
                    <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs px-2 py-1 rounded">Hidden</div>
                  )}
                </div>
                <div className="p-2 space-y-1">
                  {photo.caption && <p className="text-xs truncate">{photo.caption}</p>}
                  {photo.uploadedBy && <p className="text-xs text-gray-500">— {photo.uploadedBy}</p>}
                  <div className="flex gap-1 pt-1">
                    <Button size="sm" variant={photo.approved ? 'outline' : 'primary'} className="text-xs flex-1" onClick={() => toggleApproval(photo)}>
                      {photo.approved ? 'Hide' : 'Show'}
                    </Button>
                    <Button size="sm" variant="danger" className="text-xs" onClick={() => deletePhoto(photo.id)}>
                      ✕
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
