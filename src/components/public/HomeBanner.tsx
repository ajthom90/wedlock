'use client';

import { useEffect, useState } from 'react';

type BannerPhoto = { id: string; url: string; caption: string | null };

interface Props {
  photos: BannerPhoto[];
  style: 'hero' | 'strip';
  children: React.ReactNode;
}

const ROTATE_MS = 6000;

export function HomeBanner({ photos, style, children }: Props) {
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = photos.filter((p) => !hidden.has(p.id));

  const removePhoto = (id: string) => {
    setHidden((prev) => new Set(prev).add(id));
  };

  useEffect(() => {
    if (visible.length <= 1) return;
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let id: ReturnType<typeof setInterval> | null = null;

    const startInterval = () => {
      if (id !== null) return;
      id = setInterval(() => setIndex((i) => (i + 1) % visible.length), ROTATE_MS);
    };
    const stopInterval = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const sync = () => {
      if (mq?.matches) stopInterval();
      else startInterval();
    };

    sync();
    mq?.addEventListener?.('change', sync);

    return () => {
      mq?.removeEventListener?.('change', sync);
      stopInterval();
    };
  }, [visible.length]);

  // Reset index if visible shrinks beneath it.
  useEffect(() => {
    if (index >= visible.length && visible.length > 0) setIndex(0);
  }, [index, visible.length]);

  if (visible.length === 0) {
    return <section className="py-20 md:py-32 text-center">{children}</section>;
  }

  if (style === 'hero') {
    return (
      <section className="relative overflow-hidden" style={{ minHeight: '70vh' }}>
        {visible.map((photo, i) => (
          <img
            key={photo.id}
            src={photo.url}
            alt={photo.caption || ''}
            onError={() => removePhoto(photo.id)}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
            style={{ opacity: i === index ? 1 : 0 }}
          />
        ))}
        <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
        <div className="relative z-10 flex items-center justify-center py-20 md:py-32 text-center text-white [text-shadow:_0_1px_3px_rgba(0,0,0,0.5)]">
          <div className="w-full">{children}</div>
        </div>
        {visible.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2" aria-label="Banner photo navigation">
            {visible.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                aria-current={i === index ? 'true' : undefined}
                aria-label={`Show photo ${i + 1} of ${visible.length}`}
                onClick={() => setIndex(i)}
                className={`h-2 w-2 rounded-full transition-all ${i === index ? 'bg-white w-6' : 'bg-white/50 hover:bg-white/75'}`}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  // strip style
  return (
    <>
      <section className="relative w-full overflow-hidden" style={{ height: '35vh', minHeight: '240px' }}>
        {visible.map((photo, i) => (
          <img
            key={photo.id}
            src={photo.url}
            alt={photo.caption || ''}
            onError={() => removePhoto(photo.id)}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
            style={{ opacity: i === index ? 1 : 0 }}
          />
        ))}
        {visible.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-2" aria-label="Banner photo navigation">
            {visible.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                aria-current={i === index ? 'true' : undefined}
                aria-label={`Show photo ${i + 1} of ${visible.length}`}
                onClick={() => setIndex(i)}
                className={`h-2 w-2 rounded-full transition-all ${i === index ? 'bg-white w-6' : 'bg-white/60 hover:bg-white/80'}`}
              />
            ))}
          </div>
        )}
      </section>
      <section className="py-20 md:py-32 text-center">{children}</section>
    </>
  );
}
