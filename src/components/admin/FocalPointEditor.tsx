'use client';

import { useState, useRef } from 'react';
import { Framed } from '@/components/public/Framed';

export interface FocalPoint {
  focalX: number;
  focalY: number;
  zoom: number;
}

interface Props {
  src: string;
  value: FocalPoint;
  onChange: (next: FocalPoint) => void;
}

/**
 * Editor for per-image focal point + zoom. The main image is rendered at its
 * natural aspect ratio so the crosshair percentages map 1:1 to pixel positions
 * inside the image. Three preview tiles show how the current settings will
 * render in the three common display contexts on the public site.
 */
export function FocalPointEditor({ src, value, onChange }: Props) {
  const imageRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [aspect, setAspect] = useState<number | null>(null);

  const updateFocalFromPointer = (clientX: number, clientY: number) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
    const y = Math.round(Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)));
    onChange({ ...value, focalX: x, focalY: y });
  };

  return (
    <div className="space-y-4">
      <div
        ref={imageRef}
        className="relative bg-gray-100 rounded overflow-hidden mx-auto w-full max-w-xl select-none cursor-crosshair"
        style={{ aspectRatio: aspect ?? 16 / 9 }}
        onPointerDown={(e) => {
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFocalFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (dragging) updateFocalFromPointer(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          setDragging(false);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => setDragging(false)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="w-full h-full object-contain pointer-events-none"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setAspect(img.naturalWidth / img.naturalHeight);
            }
          }}
        />
        {/* Crosshair marker */}
        <div
          className="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${value.focalX}%`, top: `${value.focalY}%` }}
          aria-hidden="true"
        >
          <div className="absolute inset-0 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.3)]" />
          <div className="absolute inset-[10px] rounded-full bg-white" />
          <div className="absolute inset-[14px] rounded-full bg-red-500" />
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center">
        Click or drag on the photo to set where the subject is. Previews update live.
      </p>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label htmlFor="zoom-slider" className="text-sm font-medium">Zoom</label>
          <span className="text-xs text-gray-500">{value.zoom.toFixed(1)}×</span>
        </div>
        <input
          id="zoom-slider"
          type="range"
          min={1}
          max={3}
          step={0.1}
          value={value.zoom}
          onChange={(e) => onChange({ ...value, zoom: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Preview</p>
        <div className="grid grid-cols-3 gap-3">
          <PreviewTile label="Banner" aspectClass="aspect-video">
            <Framed src={src} focalX={value.focalX} focalY={value.focalY} zoom={value.zoom} />
          </PreviewTile>
          <PreviewTile label="Wedding Party" aspectClass="aspect-square" rounded>
            <Framed src={src} focalX={value.focalX} focalY={value.focalY} zoom={value.zoom} />
          </PreviewTile>
          <PreviewTile label="Story Card" aspectClass="aspect-[4/3]">
            <Framed src={src} focalX={value.focalX} focalY={value.focalY} zoom={value.zoom} />
          </PreviewTile>
        </div>
      </div>
    </div>
  );
}

function PreviewTile({
  label,
  aspectClass,
  rounded,
  children,
}: {
  label: string;
  aspectClass: string;
  rounded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={`${aspectClass} bg-gray-100 overflow-hidden ${rounded ? 'rounded-full' : 'rounded'}`}>
        {children}
      </div>
      <p className="text-xs text-gray-500 text-center mt-1">{label}</p>
    </div>
  );
}
