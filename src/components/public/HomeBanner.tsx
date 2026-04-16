'use client';

import { useEffect, useRef, useState } from 'react';

type BannerPhoto = {
  id: string;
  url: string;
  caption: string | null;
  focalX: number;
  focalY: number;
  zoom: number;
};

interface Props {
  photos: BannerPhoto[];
  style: 'hero' | 'strip';
  children: React.ReactNode;
}

const ROTATE_MS = 6000;
const SWIPE_THRESHOLD_PX = 50;

export function HomeBanner({ photos, style, children }: Props) {
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [rotateToken, setRotateToken] = useState(0);
  const visible = photos.filter((p) => !hidden.has(p.id));

  const removePhoto = (id: string) => {
    setHidden((prev) => new Set(prev).add(id));
  };

  const resetRotate = () => setRotateToken((t) => t + 1);

  const next = () => {
    if (visible.length === 0) return;
    setIndex((i) => (i + 1) % visible.length);
    resetRotate();
  };

  const prev = () => {
    if (visible.length === 0) return;
    setIndex((i) => (i - 1 + visible.length) % visible.length);
    resetRotate();
  };

  const jumpTo = (i: number) => {
    if (visible.length === 0) return;
    setIndex(i);
    resetRotate();
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
  }, [visible.length, rotateToken]);

  useEffect(() => {
    if (index >= visible.length && visible.length > 0) setIndex(0);
  }, [index, visible.length]);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) next();
    else prev();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    }
  };

  if (visible.length === 0) {
    return <section className="py-20 md:py-32 text-center">{children}</section>;
  }

  const showControls = visible.length > 1;

  const chevrons = showControls ? (
    <>
      <button
        type="button"
        onClick={prev}
        aria-label="Previous photo"
        className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-20 grid place-items-center h-10 w-10 rounded-full bg-black/35 text-white backdrop-blur-sm opacity-70 hover:opacity-100 focus:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M12.5 15L7.5 10L12.5 5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={next}
        aria-label="Next photo"
        className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-20 grid place-items-center h-10 w-10 rounded-full bg-black/35 text-white backdrop-blur-sm opacity-70 hover:opacity-100 focus:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M7.5 5L12.5 10L7.5 15"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </>
  ) : null;

  if (style === 'hero') {
    return (
      <section
        className="relative overflow-hidden min-h-[360px] sm:min-h-[420px] sm:h-[55vh] lg:h-[70vh] lg:min-h-[560px]"
        onTouchStart={showControls ? onTouchStart : undefined}
        onTouchEnd={showControls ? onTouchEnd : undefined}
        onKeyDown={showControls ? onKeyDown : undefined}
      >
        {visible.map((photo, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo.id}
            src={photo.url}
            alt={photo.caption || ''}
            onError={() => removePhoto(photo.id)}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
            style={{
              opacity: i === index ? 1 : 0,
              objectPosition: `${photo.focalX}% ${photo.focalY}%`,
              transform: photo.zoom > 1 ? `scale(${photo.zoom})` : undefined,
              transformOrigin: `${photo.focalX}% ${photo.focalY}%`,
            }}
          />
        ))}
        {/* Base scrim — a flat darkening layer to lift contrast across the whole hero. */}
        <div className="absolute inset-0 bg-black/55 sm:bg-black/45 lg:bg-black/40" aria-hidden="true" />
        {/* Spotlight — an ellipse of extra darkness centered on the text so light
            photo content near the middle doesn't swallow the typography. */}
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_50%,rgba(0,0,0,0.45),transparent_75%)]"
          aria-hidden="true"
        />
        <div className="relative z-10 flex items-center justify-center min-h-[360px] sm:min-h-[420px] sm:h-[55vh] lg:h-[70vh] lg:min-h-[560px] py-12 sm:py-20 md:py-32 text-center text-white [text-shadow:_0_2px_4px_rgba(0,0,0,0.85),_0_0_14px_rgba(0,0,0,0.65)]">
          <div className="w-full">{children}</div>
        </div>
        {chevrons}
        {showControls && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2" aria-label="Banner photo navigation">
            {visible.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                aria-current={i === index ? 'true' : undefined}
                aria-label={`Show photo ${i + 1} of ${visible.length}`}
                onClick={() => jumpTo(i)}
                className={`h-2 w-2 rounded-full transition-all ${i === index ? 'bg-white w-6' : 'bg-white/50 hover:bg-white/75'}`}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <section
        className="relative w-full overflow-hidden h-[180px] sm:h-[30vh] sm:min-h-[220px] lg:h-[35vh] lg:min-h-[280px]"
        onTouchStart={showControls ? onTouchStart : undefined}
        onTouchEnd={showControls ? onTouchEnd : undefined}
        onKeyDown={showControls ? onKeyDown : undefined}
      >
        {visible.map((photo, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo.id}
            src={photo.url}
            alt={photo.caption || ''}
            onError={() => removePhoto(photo.id)}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
            style={{
              opacity: i === index ? 1 : 0,
              objectPosition: `${photo.focalX}% ${photo.focalY}%`,
              transform: photo.zoom > 1 ? `scale(${photo.zoom})` : undefined,
              transformOrigin: `${photo.focalX}% ${photo.focalY}%`,
            }}
          />
        ))}
        {chevrons}
        {showControls && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-2" aria-label="Banner photo navigation">
            {visible.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                aria-current={i === index ? 'true' : undefined}
                aria-label={`Show photo ${i + 1} of ${visible.length}`}
                onClick={() => jumpTo(i)}
                className={`h-2 w-2 rounded-full transition-all ${i === index ? 'bg-white w-6' : 'bg-white/60 hover:bg-white/80'}`}
              />
            ))}
          </div>
        )}
      </section>
      <section className="py-12 sm:py-20 md:py-32 text-center">{children}</section>
    </>
  );
}
