'use client';

import { useEffect, useRef, useState } from 'react';

interface WallPhoto {
  id: string;
  url: string;
  caption: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 10_000;
const DISPLAY_INTERVAL_MS = 6000;

/**
 * Live-updating photo wall. Polls /api/photos/wall every 10s for new guest
 * uploads, cycles through them with cross-fade. Most-recent photos are
 * prioritized so new uploads feel immediate to the room.
 */
export function WallGallery() {
  const [photos, setPhotos] = useState<WallPhoto[]>([]);
  const [index, setIndex] = useState(0);
  const [showNewBanner, setShowNewBanner] = useState<WallPhoto | null>(null);
  const previousIdsRef = useRef<Set<string>>(new Set());

  // Poll for photos
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/photos/wall', { cache: 'no-store' });
        if (!res.ok) return;
        const data: WallPhoto[] = await res.json();
        if (cancelled) return;

        // Detect new arrivals so we can flash a "new photo" banner.
        const previousIds = previousIdsRef.current;
        const newOnes = data.filter((p) => !previousIds.has(p.id));
        if (newOnes.length > 0 && previousIds.size > 0) {
          setShowNewBanner(newOnes[0]);
          setTimeout(() => setShowNewBanner(null), 4000);
        }
        previousIdsRef.current = new Set(data.map((p) => p.id));
        setPhotos(data);
      } catch {
        // Network blip — try again on next tick.
      }
    };

    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Auto-advance
  useEffect(() => {
    if (photos.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % photos.length), DISPLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [photos.length]);

  useEffect(() => {
    if (index >= photos.length && photos.length > 0) setIndex(0);
  }, [index, photos.length]);

  if (photos.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-white/80 text-2xl p-8 text-center">
        <div>
          <p className="mb-4 text-4xl font-light">Scan the QR code to add photos</p>
          <p className="text-lg text-white/50">Waiting for the first upload...</p>
        </div>
      </div>
    );
  }

  const current = photos[index];
  return (
    <div className="absolute inset-0">
      {photos.map((photo, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photo.id}
          src={photo.url}
          alt={photo.caption || ''}
          className="absolute inset-0 w-full h-full object-contain transition-opacity duration-1000"
          style={{ opacity: i === index ? 1 : 0 }}
        />
      ))}

      {/* Caption + uploader overlay */}
      {(current.caption || current.uploadedBy) && (
        <div className="absolute bottom-8 left-8 right-8 text-white text-center [text-shadow:_0_2px_6px_rgba(0,0,0,0.9)]">
          {current.caption && <p className="text-2xl md:text-3xl font-light mb-2">{current.caption}</p>}
          {current.uploadedBy && <p className="text-lg text-white/80">— {current.uploadedBy}</p>}
        </div>
      )}

      {/* New upload banner */}
      {showNewBanner && showNewBanner.id !== current.id && (
        <div className="absolute top-8 right-8 bg-white/90 text-black rounded-lg shadow-xl px-6 py-3 flex items-center gap-3 animate-pulse">
          <span className="text-2xl">📸</span>
          <div>
            <p className="text-sm font-medium">New photo!</p>
            {showNewBanner.uploadedBy && <p className="text-xs text-black/60">from {showNewBanner.uploadedBy}</p>}
          </div>
        </div>
      )}

      {/* Count indicator */}
      <div className="absolute top-8 left-8 text-white/70 text-sm">
        {index + 1} / {photos.length}
      </div>
    </div>
  );
}
