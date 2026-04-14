/**
 * Renders an <img> that respects a focal point (focalX, focalY in 0–100%) and
 * optional zoom (1.0–3.0). Intended to live inside a container that sets the
 * display aspect ratio and `overflow: hidden` — this component only produces
 * the image element itself so it composes cleanly with any wrapper.
 *
 * Usage:
 *   <div className="aspect-video overflow-hidden rounded-lg">
 *     <Framed src={url} focalX={40} focalY={30} zoom={1.5} />
 *   </div>
 */
interface Props {
  src: string;
  alt?: string;
  focalX?: number;
  focalY?: number;
  zoom?: number;
  className?: string;
}

export function Framed({ src, alt = '', focalX = 50, focalY = 50, zoom = 1, className = '' }: Props) {
  const safeX = Math.max(0, Math.min(100, focalX));
  const safeY = Math.max(0, Math.min(100, focalY));
  const safeZoom = Math.max(1, Math.min(3, zoom));

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`w-full h-full object-cover ${className}`}
      style={{
        objectPosition: `${safeX}% ${safeY}%`,
        transform: safeZoom > 1 ? `scale(${safeZoom})` : undefined,
        transformOrigin: `${safeX}% ${safeY}%`,
      }}
    />
  );
}
